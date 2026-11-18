// Spec 005 — safe options. When the gate says BLOCK or HOLD, Tanod branches
// 2-3 candidate continuations from the checkpoint before the risky step.
// Candidates are built deterministically from the evidence (corrected facts,
// within the rules, ask first) and each one runs through the full gate.
// Only candidates that pass are shown to the owner.

import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { splitFrontmatter } from './classify.js';

const money = (n) => `SGD ${Number(n).toLocaleString('en-US')}`;

function correctedBody(body, claims) {
  let out = String(body || '');
  for (const c of claims) {
    if (c.status === 'contradicted' && c.found) {
      const replacement = c.found.replace(/^total /i, '');
      out = out.split(c.claim).join(replacement);
    } else if (c.status === 'unsupported') {
      // drop the sentence carrying the unsourced claim
      out = out
        .split(/(?<=[.!?])\s+/)
        .filter((s) => !s.includes(c.claim))
        .join(' ');
    }
  }
  return out.trim();
}

export async function generateOptions(wsId, actionRow, decision, checkpointId, decide) {
  const a = actionRow.payload || {};
  const flags = decision.flags || {};
  const ws = (await db.select('workspaces', { id: wsId }, { limit: 1 }))[0];
  const parties = await db.select('parties', { workspace_id: wsId });
  const files = await db.select('files', { workspace_id: wsId }, { limit: 2000 });
  const live = files.filter((f) => !f.deleted_at);
  const candidates = [];
  const add = (kind, label, action) => candidates.push({ kind, label, action });

  const askOwner = (label, question) =>
    add('ask_first', label, {
      agent_name: 'tanod-repair', task: a.task, action_type: 'send_email',
      to: ws.owner_email, subject: 'A question before anything is sent',
      body: question, files_read: [],
    });

  if (flags.factFail) {
    const fixed = correctedBody(a.body, decision.claims || []);
    if (fixed && fixed !== a.body) {
      add('corrected', 'Send corrected reply (figures from your files)', {
        ...a, agent_name: a.agent_name, body: fixed, branch_id: null,
      });
    }
    add('ask_first', 'Send a holding reply, decide the settlement yourself', {
      ...a, body: 'Let me check the contract and come back to you.', branch_id: null,
    });
  }

  if (flags.floor) {
    const client = parties.find((p) => p.name === flags.floor.client);
    add('within_rules', `Counter at ${money(flags.floor.floor)} (your floor)`, {
      agent_name: a.agent_name, task: a.task, action_type: 'send_email',
      to: a.to, subject: a.subject || 'Our offer',
      body: `We can offer ${money(flags.floor.floor)} for the same scope.`,
      files_read: a.files_read,
    });
    add('ask_first', 'Polite decline', {
      agent_name: a.agent_name, task: a.task, action_type: 'send_email',
      to: a.to, subject: a.subject || 'Thank you',
      body: 'Thank you for considering us. We can\u2019t take this on at that price, but we\u2019d love to work together in the future.',
      files_read: [],
    });
    void client;
  }

  if (flags.wrongClient) {
    const rc = flags.wrongClient.recipientClient;
    const own = live.find((f) => {
      const hay = `${f.path} ${splitFrontmatter(f.content).title}`.toLowerCase();
      return f.label === 'public' && hay.includes(rc.name.toLowerCase().split(' ')[0]);
    });
    if (own) {
      add('corrected', `Send ${rc.name.split(' ')[0]} their own published document`, {
        agent_name: a.agent_name, task: a.task, action_type: 'send_email',
        to: a.to, subject: a.subject || 'For you',
        body: `Here is our latest published document about your project.`,
        attachments: [own.path], files_read: [own.path],
      });
    }
    askOwner('Ask you which file was meant', `Which file did you mean to send to ${firstNameOf(rc)}? The draft attached ${flags.wrongClient.contentClient.name.split(' ')[0]}\u2019s document, so nothing was sent.`);
  }

  if (flags.injection) {
    const src = files.find((f) => f.path === (decision.evidence.find((e) => e.file && /inbox\//.test(e.file)) || {}).file);
    const from = src ? splitFrontmatter(src.content).meta.from : null;
    if (from) {
      add('ask_first', 'Reply to the sender: confirm by phone first, forward nothing', {
        agent_name: a.agent_name, task: a.task, action_type: 'send_email',
        to: from, subject: 'Re: billing contact update',
        body: 'Thanks for the update. I\u2019ll confirm the billing change by phone before anything is sent.',
        files_read: [],
      });
    }
  }

  if (flags.delete && !flags.delete.contractRequired && decision.outcome === 'HOLD_FOR_APPROVAL') {
    const d = flags.delete;
    if (d.unpaid && d.client && d.ref && d.amount) {
      const email = (d.client.emails || [])[0];
      if (email) {
        add('corrected', 'Keep the invoice, send a payment reminder instead', {
          agent_name: a.agent_name, task: `Chase payment for invoice ${d.ref}`, action_type: 'send_email',
          to: email, subject: `Reminder: invoice ${d.ref}`,
          body: `A reminder that invoice ${d.ref} for ${money(d.amount)} is now overdue.`,
          files_read: [d.path],
        });
      }
    }
    add('within_rules', 'Archive instead (restorable for 30 days)', {
      ...a, mode: 'archive', branch_id: null,
    });
  }

  if (flags.order && decision.outcome === 'HOLD_FOR_APPROVAL') {
    add('ask_first', 'Ask the supplier to wait for written confirmation', {
      agent_name: a.agent_name, task: a.task, action_type: 'send_email',
      to: a.to, subject: a.subject || 'Please hold',
      body: 'Please hold the reprint until Daniel confirms in writing. We\u2019ll come back to you.',
      files_read: [],
    });
  }

  if (!candidates.length) {
    askOwner('Ask you before proceeding', `Tanod held ${a.agent_name}\u2019s ${a.action_type.replace(/_/g, ' ')} for you. ${decision.owner_line} How would you like to proceed?`);
  }

  const options = [];
  for (const c of candidates.slice(0, 3)) {
    const gate = await decide(wsId, c.action, { dryRun: true });
    const shown = gate.outcome !== 'BLOCK';
    const branch = await db.insert('branches', {
      id: randomUUID(), workspace_id: wsId,
      from_checkpoint_id: checkpointId, origin_action_id: actionRow.id,
      kind: c.kind, action_json: c.action, gate_outcome: gate.outcome,
      shown_to_owner: shown, status: 'open',
    });
    if (shown) {
      options.push({
        branch_id: branch.id, kind: c.kind, label: c.label,
        outcome: gate.outcome, owner_line: gate.owner_line,
      });
    }
  }
  return options;
}

function firstNameOf(party) {
  return (party?.contact || party?.name || 'the client').split(' ')[0];
}

export async function mergeOption(wsId, actionId, branchId, decide) {
  const branch = (await db.select('branches', { id: branchId, workspace_id: wsId }, { limit: 1 }))[0];
  if (!branch) throw Object.assign(new Error('Option not found.'), { status: 404 });
  if (branch.status !== 'open') throw Object.assign(new Error('This option was already used or discarded.'), { status: 409 });
  const decision = await decide(wsId, { ...branch.action_json, branch_id: branchId }, { ownerApproved: true });
  await db.update('branches', { id: branchId }, { status: 'merged' });
  const siblings = await db.select('branches', { workspace_id: wsId, origin_action_id: actionId });
  for (const s of siblings) {
    if (s.id !== branchId && s.status === 'open') await db.update('branches', { id: s.id }, { status: 'discarded' });
  }
  return decision;
}