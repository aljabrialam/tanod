// The Tanod gate. Runs the decision engine in spec order:
// classify -> wrong-client -> fact check -> scope -> policy -> combine ->
// owner line. Deterministic: code decides, never a model.
// Also owns execution (simulated), checkpoints, approvals and rewind.

import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { classifyText, maxLevel, splitFrontmatter } from './classify.js';
import { checkClaims, extractClaims } from './facts.js';
import { scopeCheck } from './scope.js';
import {
  loadPolicy, partyForEmail, floorFor, parsePriceList, priceCheck,
  isPriceOffer, isSettlement, isOrderGoAhead, customRulesFired,
} from './policy.js';
import { appendLedger } from './ledger.js';
import { generateOptions } from './repair.js';

export const ACTION_TYPES = [
  'read_file', 'send_email', 'quote_price', 'accept_terms', 'pay_supplier',
  'order_from_supplier', 'upload_to_external_tool', 'delete_file', 'state_fact',
];

const str = (v, max = 20000) =>
  typeof v === 'string' ? v.trim().slice(0, max) : v == null ? '' : String(v).trim().slice(0, max);

export function normalizeInput(json) {
  const agent = str(json.agent ?? json.agent_name, 200);
  if (!agent) return { error: '"agent" is required: the name of the agent submitting the action.' };
  const actionType = str(json.action ?? json.action_type ?? json.type, 100).toLowerCase();
  if (!ACTION_TYPES.includes(actionType)) {
    return { error: `"action" must be one of: ${ACTION_TYPES.join(', ')}.` };
  }
  const list = (v) => {
    let arr = [];
    if (typeof v === 'string') arr = v.split(/[\n,]+/);
    else if (Array.isArray(v)) arr = v;
    return arr.map((x) => str(x, 500)).filter(Boolean).slice(0, 50);
  };
  const amountRaw = json.amount ?? json.amount_sgd;
  return {
    value: {
      agent_name: agent,
      task: str(json.task ?? json.task_text, 2000),
      action_type: actionType,
      to: str(json.to ?? json.recipient, 500),
      subject: str(json.subject, 500),
      body: str(json.body ?? json.message),
      files_read: list(json.files_read ?? json.filesRead),
      attachments: list(json.attachments ?? json.attachment),
      file_path: str(json.file_path ?? json.path ?? json.file, 500),
      target: str(json.target ?? json.tool, 300),
      amount: amountRaw != null && amountRaw !== '' ? Number(amountRaw) : null,
      mode: str(json.mode, 40) || null,
      branch_id: str(json.branch_id, 80) || null,
    },
  };
}

const agentLabel = (name) => {
  const base = String(name).replace(/[-_]?agent$/i, '').replace(/[-_]/g, ' ').trim();
  return base.charAt(0).toUpperCase() + base.slice(1) + ' agent';
};
const money = (n) => `SGD ${Number(n).toLocaleString('en-US')}`;
const firstName = (party) => (party?.contact || party?.name || '').split(' ')[0] || 'the client';

function fileDescription(path) {
  if (/bank_details/.test(path)) return 'your bank details';
  if (/cashflow/.test(path)) return 'your cash-flow notes';
  if (/owner_records/.test(path)) return 'your personal records';
  if (/client_list/.test(path)) return 'your client list';
  return path;
}

function owningClient(file, parties) {
  const clients = parties.filter((p) => p.kind === 'client');
  const inPath = clients.find((p) => file.path.toLowerCase().includes(p.name.toLowerCase().split(' ')[0]));
  if (inPath) return inPath;
  const title = (splitFrontmatter(file.content).title || '').toLowerCase();
  const inTitle = clients.find((p) => title.includes(p.name.toLowerCase().split(' ')[0]));
  if (inTitle) return inTitle;
  const hay = String(file.content).slice(0, 600).toLowerCase();
  return clients.find((p) => hay.includes(p.name.toLowerCase().split(' ')[0])) || null;
}

async function workspaceContext(wsId) {
  const ws = (await db.select('workspaces', { id: wsId }, { limit: 1 }))[0];
  if (!ws) throw Object.assign(new Error(`Unknown workspace "${wsId}".`), { status: 404 });
  const [policy, files] = await Promise.all([
    loadPolicy(wsId),
    db.select('files', { workspace_id: wsId }, { limit: 2000 }),
  ]);
  const live = files.filter((f) => !f.deleted_at);
  const byPath = new Map(files.map((f) => [f.path, f]));
  const classifyCtx = {
    clientDomains: policy.parties.filter((p) => p.kind === 'client').flatMap((p) => p.domains || []),
    supplierDomains: policy.parties.filter((p) => p.kind === 'supplier').flatMap((p) => p.domains || []),
    ownerEmail: ws.owner_email,
  };
  return { ws, policy, files, live, byPath, classifyCtx, priceList: parsePriceList(live) };
}

// ---------------------------------------------------------------- the gate

export async function decide(wsId, input, { dryRun = false, ownerApproved = false } = {}) {
  const { ws, policy, files, live, byPath, classifyCtx, priceList } = await workspaceContext(wsId);
  const a = input;
  a.files_read = a.files_read || [];
  a.attachments = a.attachments || [];
  a.body = a.body || '';
  a.to = a.to || '';
  a.task = a.task || '';
  if (a.action_type === 'read_file' && a.file_path && !a.files_read.includes(a.file_path)) {
    a.files_read = [...a.files_read, a.file_path];
  }
  const fired = []; // {id, decision, note}
  const evidence = [];
  const alerts = [];
  const fire = (id, decision, note) => {
    if (!fired.some((f) => f.id === id)) fired.push({ id, decision, note: note || '' });
  };
  const ruleDecision = (id) => policy.allRules.find((r) => r.rid === id)?.decision || 'APPROVE';

  const readRows = a.files_read.map((p) => byPath.get(p)).filter(Boolean);
  const attachRows = a.attachments.map((p) => byPath.get(p)).filter(Boolean);
  const bodyClass = a.body ? classifyText(a.body, classifyCtx) : { label: 'public', reasons: [] };
  const contentLevel = maxLevel(bodyClass.label, ...attachRows.map((f) => f.label));
  const dataLevel = maxLevel(contentLevel, ...readRows.map((f) => f.label));

  let recipientParty = partyForEmail(policy.parties, a.to);
  if (!recipientParty && a.to && a.to.toLowerCase() === ws.owner_email.toLowerCase()) {
    recipientParty = { kind: 'owner', name: ws.owner_name, contact: ws.owner_name };
  }
  const isClientBound = recipientParty?.kind === 'client';
  const outbound = ['send_email', 'upload_to_external_tool', 'state_fact', 'quote_price'].includes(a.action_type);

  // ---- prompt injection: instructions inside files are never the owner's ----
  let injection = null;
  for (const f of readRows) {
    for (const m of String(f.content).matchAll(/<!--([\s\S]*?)-->/g)) {
      if (/AI assistant|forward|ignore|do not mention|send all|upload/i.test(m[1])) {
        injection = { file: f.path, text: m[1].trim() };
        break;
      }
    }
    if (injection) break;
  }
  if (injection && outbound && a.to && !recipientParty) {
    fire('UNTRUSTED_INSTRUCTION', 'NEVER', 'instruction came from inside an email, not from the owner');
    fire('R05', ruleDecision('R05'), 'recipient not in the client or supplier list');
    evidence.push({ point: 'The instruction came from inside an email, not from you', file: injection.file, line: injection.text.slice(0, 160) });
    evidence.push({ point: `${a.to} is not a known client or supplier` });
    if (attachRows.length) {
      for (const f of attachRows) evidence.push({ point: `The attachments include ${fileDescription(f.path)} (${f.label})`, file: f.path });
    }
  } else if (injection && outbound) {
    alerts.push({ kind: 'injection_seen', text: `An email read for this task contained hidden instructions (${injection.file}). They were not followed.` });
  }

  // ---- wrong-client check ----
  let wrongClient = null;
  if (outbound && isClientBound) {
    for (const f of attachRows) {
      const owner = owningClient(f, policy.parties);
      if (owner && owner.name !== recipientParty.name) {
        wrongClient = { contentClient: owner, recipientClient: recipientParty, file: f };
        break;
      }
    }
    if (wrongClient) {
      fire('WRONG_CLIENT', 'NEVER', 'content belongs to a different client than the recipient');
      const nonPublic = /raising|fundraising|unannounced|not public|isn't public|NDA|keep quiet/i.test(wrongClient.file.content);
      fire(nonPublic ? 'R19' : 'R04', ruleDecision(nonPublic ? 'R19' : 'R04'), 'one client\u2019s private information going to another');
      evidence.push({ point: `The attachment belongs to ${wrongClient.contentClient.name}`, file: wrongClient.file.path });
      evidence.push({ point: `The recipient belongs to ${wrongClient.recipientClient.name}` });
      if (nonPublic) {
        const acq = /acquisition/i.test(wrongClient.file.content);
        const line = String(wrongClient.file.content).split('\n').find((l) => /raising|fundraising|acquisition/i.test(l));
        evidence.push({ point: `It contains ${wrongClient.contentClient.name.split(' ')[0]}\u2019s non-public ${acq ? 'acquisition news' : 'fundraising figures'}`, file: wrongClient.file.path, line: line?.trim() });
      }
    }
  }

  // ---- fact check ----
  let factResults = [];
  let factFail = false;
  if (['send_email', 'state_fact', 'quote_price'].includes(a.action_type) && (a.body || a.amount != null)) {
    const text = a.body || (a.amount != null ? `Quote: SGD ${a.amount.toLocaleString('en-US')}.` : '');
    const related = live.filter((f) => recipientParty && String(f.content).toLowerCase().includes(recipientParty.name.toLowerCase().split(' ')[0]));
    const searchFiles = [...readRows, ...related, ...live].filter((f, i, arr) => arr.findIndex((x) => x.path === f.path) === i);
    factResults = checkClaims(text, searchFiles);
    const bad = factResults.filter((r) => r.status !== 'supported');
    if (isClientBound && bad.length) {
      factFail = true;
      fire('R18', 'NEVER', 'a figure with no source, or contradicting a file');
      for (const r of factResults) {
        evidence.push({ claim: r.claim, found: r.found, file: r.file, status: r.status, line: r.line });
      }
      if (bad.some((r) => /days/i.test(r.claim))) {
        const dl = related.map((f) => ({ f, line: String(f.content).split('\n').find((l) => /deadline moved to/i.test(l)) })).find((x) => x.line);
        if (dl) evidence.push({ point: 'The deadline on file', file: dl.f.path, line: dl.line.trim() });
      }
    } else if (isClientBound && factResults.length) {
      fire('R18', 'ALLOW', 'every figure traces to a file');
      for (const r of factResults) evidence.push({ claim: r.claim, found: r.found, file: r.file, status: 'supported' });
    } else if (factResults.length) {
      for (const r of factResults) evidence.push({ claim: r.claim, found: r.found, file: r.file, status: r.status });
    }
  }

  // ---- scope check ----
  let scope = [];
  if (a.files_read.length) {
    scope = scopeCheck(a.task, a.files_read, files);
    const inScope = scope.filter((s) => s.scope === 'in_scope');
    const outReg = scope.filter((s) => s.scope === 'out_of_scope' && byPath.get(s.path)?.label === 'regulated');
    if (inScope.length) fire('R01', ruleDecision('R01'), 'reads needed for the task');
    for (const s of outReg) {
      fire('R02', a.action_type === 'read_file' ? 'NEVER' : 'ALERT', 'regulated file read without need');
      evidence.push({ point: `${fileDescription(s.path)} was read with no link to the task`, file: s.path });
      alerts.push({ kind: 'scope_creep', text: `While working on \u201c${a.task || a.action_type}\u201d, ${agentLabel(a.agent_name)} read ${fileDescription(s.path)}. Nothing was sent, but you should know.`, file: s.path });
    }
    for (const s of scope.filter((x) => x.scope === 'arguably_in_scope')) {
      evidence.push({ point: `${s.path}: arguably in scope. ${s.reason}`, file: s.path });
    }
  }

  // ---- policy rules by action type ----
  const flags = { injection: !!injection && fired.some((f) => f.id === 'UNTRUSTED_INSTRUCTION'), wrongClient, factFail };
  let recommendation = null;
  let settlementAmount = null;

  const priceOffer = a.action_type === 'quote_price' || (a.action_type === 'send_email' && isClientBound && isPriceOffer(a.body));
  const amount = a.amount ?? (priceOffer ? (extractClaims(a.body).find((c) => c.kind === 'money')?.value ?? null) : null);
  a.amount = amount;
  a.price_offer = priceOffer;

  if (priceOffer && amount != null) {
    const floor = floorFor(policy.floors, recipientParty?.name);
    for (const id of priceCheck(amount, `${a.task} ${a.body}`, priceList, floor)) {
      fire(id, ruleDecision(id), id === 'R08' ? `below the owner's floor of ${money(floor)}` : id === 'R07' ? 'below the published price list' : 'within the published price list');
    }
    if (floor != null && amount < floor) {
      flags.floor = { amount, floor, client: recipientParty?.name };
      for (const f of live) {
        const line = String(f.content).split('\n').find((l) => new RegExp(`(floor|below).*${floor.toLocaleString('en-US')}`, 'i').test(l));
        if (line) evidence.push({ point: `Your floor for ${recipientParty.name.split(' ')[0]} is ${money(floor)}`, file: f.path, line: line.trim() });
      }
      evidence.push({ point: `Policy floor: ${recipientParty?.name} ${money(floor)}` });
    }
  }

  switch (a.action_type) {
    case 'send_email': {
      if (a.to && !recipientParty) fire('R05', ruleDecision('R05'), 'recipient not in the client or supplier list');
      if (contentLevel === 'client-confidential' || contentLevel === 'regulated') {
        fire('R04', ruleDecision('R04'), 'content contains client-confidential or regulated data');
      } else if (recipientParty) {
        fire('R03', ruleDecision('R03'), 'to a known client or supplier, internal or public content');
      }
      const readSettle = readRows.find((f) => isSettlement(f.content));
      if (isSettlement(a.body) || (readSettle && /surcharge|dispute|settle|invoice/i.test(a.task + a.body))) {
        fire('R09', ruleDecision('R09'), 'accepting a reduced payment or changing terms is the owner\u2019s call');
        const m = readSettle && String(readSettle.content).match(/settle at ([\d,]+)/i);
        settlementAmount = m ? Number(m[1].replace(/,/g, '')) : null;
        if (readSettle) {
          const line = String(readSettle.content).split('\n').find((l) => /settle at/i.test(l));
          evidence.push({ point: 'The client asked to settle at a lower amount', file: readSettle.path, line: line?.trim() });
        }
        if (settlementAmount) recommendation = `Settling at ${money(settlementAmount)} is your call.`;
      }
      if (recipientParty?.kind === 'supplier' && isOrderGoAhead(a.body)) {
        fire('R12', ruleDecision('R12'), 'new spend not confirmed by the owner in writing');
        flags.order = { supplier: recipientParty.name };
        const priceLine = readRows.map((f) => String(f.content).split('\n').find((l) => /SGD [\d,]+/.test(l))).find(Boolean);
        const m = priceLine && priceLine.match(/SGD ([\d,]+)/);
        flags.order.amount = m ? Number(m[1].replace(/,/g, '')) : amount;
        const condLine = live.map((f) => ({ f, line: String(f.content).split('\n').find((l) => /confirms? in writing/i.test(l)) })).find((x) => x.line);
        if (condLine) {
          evidence.push({ point: 'Your plan says this order goes ahead only if Daniel confirms in writing', file: condLine.f.path, line: condLine.line.trim() });
          flags.order.condition = 'Daniel hasn\u2019t confirmed in writing';
        } else {
          flags.order.condition = 'you haven\u2019t confirmed this spend in writing';
        }
        if (priceLine) evidence.push({ point: `The order amount on file`, line: priceLine.trim() });
      }
      break;
    }
    case 'accept_terms':
      fire('R09', ruleDecision('R09'), 'accepting terms is the owner\u2019s call');
      break;
    case 'pay_supplier': {
      const amt = amount ?? 0;
      const supplierName = recipientParty?.name || a.to;
      const invoice = live.find((f) => /invoice/i.test(f.path) && String(f.content).includes(String(amt)) && supplierName && String(f.content).toLowerCase().includes(supplierName.toLowerCase().split(' ')[0]));
      if (amt < 1000 && invoice) {
        fire('R10', ruleDecision('R10'), 'a received invoice under SGD 1,000');
        evidence.push({ point: 'Matches a received supplier invoice', file: invoice.path });
      } else {
        fire('R11', ruleDecision('R11'), amt >= 1000 ? 'over SGD 1,000' : 'no matching invoice');
      }
      break;
    }
    case 'order_from_supplier':
      fire('R12', ruleDecision('R12'), 'new spend not confirmed by the owner in writing');
      flags.order = { supplier: recipientParty?.name || a.to, amount, condition: 'you haven\u2019t confirmed this spend in writing' };
      break;
    case 'upload_to_external_tool': {
      if (contentLevel === 'public') fire('R13', ruleDecision('R13'), 'public data');
      else if (contentLevel === 'internal') fire('R14', ruleDecision('R14'), 'internal data to an outside tool');
      else fire('R15', ruleDecision('R15'), 'client-confidential or regulated data to an outside tool');
      for (const f of [...attachRows, ...readRows].filter((f, i, arr) => arr.findIndex((x) => x.path === f.path) === i)) {
        evidence.push({ point: `${f.path} is ${f.label}: ${(f.label_reasons || []).join(' ')}`, file: f.path });
      }
      break;
    }
    case 'delete_file': {
      const target = byPath.get(a.file_path) || attachRows[0] || readRows.find((f) => f.path === a.file_path);
      flags.delete = { path: target?.path || a.file_path };
      const contractClause = live.map((f) => ({ f, line: String(f.content).split('\n').find((l) => /received in error must be deleted/i.test(l)) })).find((x) => x.line);
      const inError = target && /in error|contains patient data/i.test(target.content);
      if (target?.label === 'regulated' && inError && contractClause) {
        fire('R17', ruleDecision('R17'), 'regulated data received in error; the contract requires deletion');
        evidence.push({ point: 'The client contract says data received in error must be deleted and reported within 24 hours', file: contractClause.f.path, line: contractClause.line.trim() });
        flags.delete.contractRequired = true;
        flags.delete.clientName = owningClient(target, policy.parties)?.name.split(' ')[0] || 'The client';
      } else {
        fire('R16', a.mode === 'archive' ? 'ALLOW' : ruleDecision('R16'),
          a.mode === 'archive' ? 'soft archive, restorable for 30 days' : 'deleting any file needs the owner');
        if (target) {
          const unpaid = /status:\s*UNPAID/i.test(target.content);
          const totalM = String(target.content).match(/\*\*Total\*\*\s*\|\s*\*\*([\d,]+)\*\*/);
          const amt = totalM ? Number(totalM[1].replace(/,/g, '')) : null;
          flags.delete.unpaid = unpaid;
          flags.delete.amount = amt;
          flags.delete.ref = (String(target.content).match(/Invoice (2026-\d{3})/) || [])[1];
          flags.delete.client = owningClient(target, policy.parties);
          if (unpaid) {
            recommendation = 'Recommend: no.';
            const statusLine = String(target.content).split('\n').find((l) => /UNPAID/i.test(l));
            evidence.push({ point: 'This invoice is still UNPAID', file: target.path, line: statusLine?.trim() });
            const cash = live.find((f) => /cashflow/i.test(f.path));
            const cashLine = cash && String(cash.content).split('\n').find((l) => /Outstanding receivables/i.test(l));
            if (cashLine) {
              const m = cashLine.match(/Outstanding receivables:\s*SGD ([\d,]+)/i);
              flags.delete.outstandingTotal = m ? Number(m[1].replace(/,/g, '')) : null;
              evidence.push({ point: `Your cash-flow notes list SGD ${flags.delete.outstandingTotal?.toLocaleString('en-US')} outstanding`, file: cash.path, line: cashLine.trim() });
            }
          }
        }
      }
      break;
    }
    case 'read_file':
      if (!a.files_read.length && a.file_path) {
        const f = byPath.get(a.file_path);
        if (f) evidence.push({ point: `${f.path} is ${f.label}`, file: f.path });
      }
      break;
    case 'state_fact':
      if (!factResults.length) fire('R03', ruleDecision('R03'), 'routine');
      break;
  }

  for (const c of customRulesFired(policy, a, recipientParty)) fire(c.id, c.decision, c.note);

  // ---- combine: strictest wins; list every rule that fired ----
  const blocking = fired.filter((f) => f.decision === 'NEVER' && !(f.id === 'R02' && a.action_type !== 'read_file'));
  const approving = fired.filter((f) => f.decision === 'APPROVE');
  const outcome = blocking.length ? 'BLOCK' : approving.length ? 'HOLD_FOR_APPROVAL' : 'ALLOW';
  const rules = fired.map((f) => f.id);

  // ---- owner line ----
  const who = agentLabel(a.agent_name);
  let ownerLine;
  if (flags.injection) {
    ownerLine = `An email contained hidden instructions to forward your invoices and client list to an unknown address. ${who} tried to follow them. Blocked. Nothing was sent.`;
  } else if (wrongClient) {
    const cc = wrongClient.contentClient.name.split(' ')[0];
    const rc = wrongClient.recipientClient.name.split(' ')[0];
    const news = /acquisition/i.test(wrongClient.file.content)
      ? `, and it includes ${cc}\u2019s private acquisition news`
      : /raising|fundraising/i.test(wrongClient.file.content) ? `, and it includes ${cc}\u2019s private fundraising news` : '';
    ownerLine = `${who} tried to send ${cc}\u2019s ${/proposal/i.test(wrongClient.file.path) ? 'proposal' : 'document'} to ${firstName(wrongClient.recipientClient)} at ${rc}. Blocked: wrong client${news}. Nothing was sent.`;
  } else if (factFail) {
    const bad = factResults.filter((r) => r.status !== 'supported');
    const real = bad.filter((r) => r.found).map((r) => r.found.replace(/^total /, 'total '));
    const client = recipientParty?.name.split(' ')[0] || 'a client';
    ownerLine = `${who} drafted a reply to ${client} with ${bad.length} number${bad.length === 1 ? '' : 's'} that don\u2019t match any file (${bad.map((r) => r.claim).join(', ')}). Blocked.${real.length ? ` The real figures are ${real.join(', ')}.` : ''}${recommendation ? ` ${recommendation}` : ''}`;
  } else if (flags.floor) {
    ownerLine = `${who} drafted a ${money(flags.floor.amount).replace('SGD ', '')} offer to ${flags.floor.client?.split(' ')[0]}. Blocked: your floor is ${flags.floor.floor.toLocaleString('en-US')}. Draft is in your queue if you want to counter at ${flags.floor.floor.toLocaleString('en-US')}.`;
  } else if (fired.some((f) => f.id === 'R15')) {
    const tool = a.target || 'an outside tool';
    const what = attachRows[0] ? fileDescription(attachRows[0].path) : 'business files';
    ownerLine = `${who} tried to upload ${what} to ${tool}. Blocked: it holds personal data. Nothing was sent.`;
  } else if (flags.delete?.contractRequired) {
    ownerLine = `${flags.delete.clientName} sent patient data by mistake. Your agent deleted it and told ${flags.delete.clientName}, as your contract requires. Logged.`;
  } else if (flags.delete && a.mode === 'archive' && outcome === 'ALLOW') {
    ownerLine = `${who} archived ${flags.delete.path || 'the file'} instead of deleting it. You can bring it back for 30 days.`;
  } else if (flags.delete && outcome === 'HOLD_FOR_APPROVAL') {
    const d = flags.delete;
    if (d.unpaid && d.amount) {
      ownerLine = `${who} wants to delete invoice ${d.ref || d.path}${d.client ? ` (${d.client.name.split(' ')[0]})` : ''} worth ${money(d.amount)} that is still unpaid.${d.outstandingTotal ? ` Your cash-flow notes show ${money(d.outstandingTotal)} outstanding in total.` : ''} Held for your approval. Recommend: no.`;
    } else {
      ownerLine = `${who} wants to delete ${d.path || 'a file'}. Held for your approval: deleting is permanent, so nothing has been deleted yet.`;
    }
  } else if (flags.order && outcome === 'HOLD_FOR_APPROVAL') {
    const o = flags.order;
    const outReads = scope.filter((s) => s.scope === 'out_of_scope').map((s) => fileDescription(s.path));
    ownerLine = `${who} drafted a go-ahead to ${o.supplier?.split(' ')[0] || 'a supplier'}${o.amount ? ` for ${money(o.amount)}` : ''}. Held: ${o.condition}.${outReads.length ? ` Also: the agent read ${outReads.join(', ')}, none of which it needed. Nothing was sent, but you should know.` : ''}`;
  } else if (outcome === 'ALLOW') {
    if (a.action_type === 'send_email' && /reminder/i.test(`${a.subject} ${a.body} ${a.task}`)) {
      const ref = (a.body.match(/2026-\d{3}/) || [])[1];
      const amt = extractClaims(a.body).find((c) => c.kind === 'money');
      ownerLine = `Sent ${recipientParty?.name.split(' ')[0] || a.to} a payment reminder${ref ? ` for invoice ${ref}` : ''}${amt ? ` (${money(amt.value)})` : ''}.`;
    } else if (a.action_type === 'send_email') {
      ownerLine = `${who} sent ${recipientParty?.kind === 'owner' ? 'you' : firstName(recipientParty) || a.to} a message. Allowed: routine work, nothing sensitive left the business.`;
    } else if (a.action_type === 'read_file') {
      ownerLine = `${who} read ${a.file_path || a.files_read.join(', ') || 'files'} for the task. Allowed and logged.`;
    } else if (a.action_type === 'delete_file') {
      ownerLine = `${who} deleted ${flags.delete?.path || 'a file'} as your contract requires. Logged.`;
    } else {
      ownerLine = `${who}: ${a.action_type.replace(/_/g, ' ')}. Allowed: routine work within your rules.`;
    }
  } else if (outcome === 'HOLD_FOR_APPROVAL') {
    ownerLine = `${who} prepared ${a.action_type.replace(/_/g, ' ')}${a.to ? ` to ${recipientParty?.name?.split(' ')[0] || a.to}` : ''}. Waiting for you: your rules say this needs your approval. Nothing has happened yet.`;
  } else {
    ownerLine = `${who}: ${a.action_type.replace(/_/g, ' ')}. Blocked by your rules. Nothing was sent.`;
  }

  const decision = {
    outcome, rules, data_level: dataLevel, owner_line: ownerLine,
    evidence, recommendation, claims: factResults, scope, alerts, flags,
    content_level: contentLevel,
  };

  if (dryRun) return decision;

  // ---- checkpoint, record, execute ----
  const affected = [];
  if (a.action_type === 'delete_file') {
    const t = byPath.get(a.file_path) || attachRows[0];
    if (t) affected.push({ path: t.path, content: t.content, deleted_at: t.deleted_at });
  }
  const head = await db.select('ledger', { workspace_id: wsId }, { order: 'seq.desc', limit: 1 });
  const pending = await db.select('approvals', { workspace_id: wsId, status: 'pending' });
  const checkpoint = await db.insert('checkpoints', {
    id: randomUUID(), workspace_id: wsId,
    ledger_seq: head.length ? head[0].seq : 0,
    state: { files: affected, approvals: pending.map((p) => p.action_id) },
  });

  const actionRow = await db.insert('actions', {
    workspace_id: wsId,
    agent_name: a.agent_name, task: a.task, action_type: a.action_type,
    recipient: a.to, subject: a.subject, body: a.body,
    files_read: a.files_read, attachments: a.attachments,
    file_path: a.file_path || null, target: a.target || null,
    amount: a.amount ?? null, mode: a.mode || null, branch_id: a.branch_id || null,
    payload: a, outcome, reason: ownerLine,
    data_level: dataLevel, rules, evidence, recommendation, alerts,
    checkpoint_id: checkpoint.id, executed: false,
    submitted_at: new Date().toISOString(),
  });

  const ledgerRow = await appendLedger(wsId, {
    agent: a.agent_name, action_type: a.action_type,
    files_touched: [...new Set([...a.files_read, ...a.attachments, ...(a.file_path ? [a.file_path] : [])])],
    data_level: dataLevel, outcome, rules, summary: ownerLine,
    action_id: actionRow.id, checkpoint_id: checkpoint.id,
    branch_id: a.branch_id || null, is_rewind: false,
  });

  if (outcome === 'HOLD_FOR_APPROVAL') {
    if (ownerApproved) {
      // the owner's tap on a safe option IS the approval (owner is the approver)
      await execute(wsId, actionRow, byPath);
      await db.insert('approvals', {
        workspace_id: wsId, action_id: actionRow.id, status: 'released',
        raised_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        resolved_at: new Date().toISOString(), recheck_passed: true, time_to_decide_ms: null,
      });
    } else {
      await db.insert('approvals', {
        workspace_id: wsId, action_id: actionRow.id, status: 'pending',
        raised_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        resolved_at: null, recheck_passed: null, time_to_decide_ms: null,
      });
    }
  } else if (outcome === 'ALLOW') {
    await execute(wsId, actionRow, byPath);
  }

  let options = [];
  if (outcome !== 'ALLOW' && !ownerApproved) {
    options = await generateOptions(wsId, actionRow, decision, checkpoint.id, decide);
  }
  if (ownerApproved && outcome === 'HOLD_FOR_APPROVAL') {
    decision.owner_line = `You approved this safe option, so it went ahead: ${who.toLowerCase()} ${a.action_type.replace(/_/g, ' ')}${a.to ? ` to ${a.to}` : ''}.`;
  }

  return { ...decision, ref: actionRow.id, ledger_seq: ledgerRow.seq, checkpoint_id: checkpoint.id, options };
}

// Simulated execution: only ALLOW (or a released HOLD) performs the action.
// Email goes to a simulated outbox; deletes are soft (restorable 30 days).
export async function execute(wsId, actionRow, byPath) {
  const a = actionRow.payload || actionRow;
  if (a.action_type === 'delete_file') {
    const path = a.file_path || (a.attachments || [])[0];
    if (path) {
      await db.update('files', { workspace_id: wsId, path }, {
        deleted_at: new Date().toISOString(),
        kept_until: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      });
    }
  }
  await db.update('actions', { id: actionRow.id, workspace_id: wsId }, { executed: true });
}

// ---------------------------------------------------------------- approvals

export async function resolveApproval(wsId, actionId, resolve) {
  const approvals = await db.select('approvals', { workspace_id: wsId, action_id: actionId });
  const approval = approvals[0];
  if (!approval) throw Object.assign(new Error('This item is not in the queue.'), { status: 404 });
  if (approval.status !== 'pending') throw Object.assign(new Error(`This item was already ${approval.status}.`), { status: 409 });
  if (new Date(approval.expires_at) < new Date()) {
    await db.update('approvals', { id: approval.id }, { status: 'expired', resolved_at: new Date().toISOString() });
    throw Object.assign(new Error('This approval expired after 24 hours. Ask the agent to submit it again so it can be re-checked.'), { status: 410 });
  }
  const actionRow = (await db.select('actions', { id: actionId, workspace_id: wsId }, { limit: 1 }))[0];
  const elapsed = Date.now() - new Date(approval.raised_at).getTime();

  if (resolve === 'reject') {
    await db.update('approvals', { id: approval.id }, { status: 'rejected', resolved_at: new Date().toISOString(), time_to_decide_ms: elapsed });
    await appendLedger(wsId, {
      agent: 'owner', action_type: 'reject', files_touched: [], data_level: actionRow.data_level,
      outcome: 'BLOCK', rules: [], summary: `You rejected ${actionRow.agent_name}\u2019s ${actionRow.action_type.replace(/_/g, ' ')}. Nothing happened.`,
      action_id: actionId, checkpoint_id: actionRow.checkpoint_id, is_rewind: false,
    });
    return { status: 'rejected' };
  }

  // re-check against current files before running
  const recheck = await decide(wsId, actionRow.payload, { dryRun: true });
  if (recheck.outcome === 'BLOCK') {
    await db.update('approvals', { id: approval.id }, { recheck_passed: false });
    throw Object.assign(new Error(`Tanod re-checked this against your current files and now blocks it: ${recheck.owner_line}`), { status: 409 });
  }
  const { byPath } = await workspaceContext(wsId);
  await execute(wsId, actionRow, byPath);
  await db.update('approvals', { id: approval.id }, {
    status: 'released', resolved_at: new Date().toISOString(),
    recheck_passed: true, time_to_decide_ms: elapsed,
  });
  await appendLedger(wsId, {
    agent: 'owner', action_type: 'release', files_touched: actionRow.payload.files_read || [],
    data_level: actionRow.data_level, outcome: 'ALLOW', rules: [],
    summary: `You released ${actionRow.agent_name}\u2019s ${actionRow.action_type.replace(/_/g, ' ')}. It was re-checked, then done.`,
    action_id: actionId, checkpoint_id: actionRow.checkpoint_id, is_rewind: false,
  });
  return { status: 'released', recheck: recheck.outcome };
}

export async function approvalHealth(wsId) {
  const rows = await db.select('approvals', { workspace_id: wsId }, { limit: 1000 });
  const resolved = rows.filter((r) => r.status === 'released' || r.status === 'rejected');
  const actions = await db.select('actions', { workspace_id: wsId }, { limit: 1000 });
  const byId = new Map(actions.map((a) => [a.id, a]));
  let overrides = 0;
  for (const r of resolved) {
    const rec = byId.get(r.action_id)?.recommendation || '';
    if (r.status === 'released' && /recommend: no/i.test(rec)) overrides++;
  }
  const times = resolved.map((r) => r.time_to_decide_ms).filter((t) => t != null).sort((a, b) => a - b);
  const median = times.length ? times[Math.floor(times.length / 2)] : null;
  return {
    pending: rows.filter((r) => r.status === 'pending').length,
    resolved: resolved.length,
    override_rate: resolved.length ? overrides / resolved.length : 0,
    median_time_to_decide_ms: median,
    rubber_stamp_warning: times.length >= 3 && median != null && median < 3000,
  };
}

// ---------------------------------------------------------------- rewind

export async function rewind(wsId, checkpointId) {
  const cp = (await db.select('checkpoints', { id: checkpointId, workspace_id: wsId }, { limit: 1 }))[0];
  if (!cp) throw Object.assign(new Error('Checkpoint not found.'), { status: 404 });
  const later = await db.select('ledger', { workspace_id: wsId, seq: { op: 'gt', v: cp.ledger_seq } }, { order: 'seq.asc', limit: 10000 });
  const laterActionIds = later.map((l) => l.action_id).filter(Boolean);
  const laterActions = laterActionIds.length
    ? (await db.select('actions', { workspace_id: wsId }, { limit: 2000 })).filter((a) => laterActionIds.includes(a.id))
    : [];

  const restored = [];
  const irreversible = [];
  for (const a of laterActions) {
    if (!a.executed) continue;
    const p = a.payload || {};
    if (a.action_type === 'delete_file') {
      const path = p.file_path || (p.attachments || [])[0];
      if (path) {
        const snap = (cp.state?.files || []).find((f) => f.path === path);
        await db.update('files', { workspace_id: wsId, path }, {
          deleted_at: null, kept_until: null,
          ...(snap ? { content: snap.content } : {}),
        });
        restored.push(path);
      }
    } else if (['send_email', 'pay_supplier', 'upload_to_external_tool'].includes(a.action_type)) {
      irreversible.push({
        action_id: a.id, action_type: a.action_type, to: p.to || p.target || '',
        correction_draft: a.action_type === 'send_email'
          ? `Please disregard my previous message${p.subject ? ` (\u201c${p.subject}\u201d)` : ''}. I am checking the details and will come back to you with the correct information.`
          : null,
      });
    }
  }
  let cancelled = 0;
  for (const ap of await db.select('approvals', { workspace_id: wsId, status: 'pending' })) {
    if (laterActionIds.includes(ap.action_id)) {
      await db.update('approvals', { id: ap.id }, { status: 'cancelled', resolved_at: new Date().toISOString() });
      cancelled++;
    }
  }
  const summary = `Rewound to checkpoint before entry ${cp.ledger_seq + 1}. ${restored.length ? `Restored: ${restored.join(', ')}. ` : ''}${cancelled ? `Cancelled ${cancelled} queued item(s). ` : ''}${irreversible.length ? `${irreversible.length} thing(s) already went out and can\u2019t be undone; correction drafts are ready.` : ''}`;
  const row = await appendLedger(wsId, {
    agent: 'owner', action_type: 'rewind', files_touched: restored, data_level: 'internal',
    outcome: 'ALLOW', rules: [], summary, action_id: null, checkpoint_id: cp.id, is_rewind: true,
  });
  return { restored, irreversible, cancelled, ledger_seq: row.seq, summary };
}