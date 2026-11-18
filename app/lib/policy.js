// Spec 002 — the rule table, owner floors, price list, and plain-English
// rule compilation. Deterministic: the final decision is computed by code.

import { db } from './db.js';

export async function loadPolicy(wsId) {
  const [rules, floors, parties] = await Promise.all([
    db.select('rules', { workspace_id: wsId }),
    db.select('floors', { workspace_id: wsId }),
    db.select('parties', { workspace_id: wsId }),
  ]);
  return {
    rules: rules.filter((r) => r.enabled),
    allRules: rules,
    floors,
    parties,
    has: (id) => rules.some((r) => r.rid === id && r.enabled),
  };
}

export function partyForEmail(parties, email) {
  const e = String(email || '').toLowerCase().trim();
  if (!e.includes('@')) return null;
  const domain = e.split('@')[1];
  return (
    parties.find((p) => (p.emails || []).some((x) => x.toLowerCase() === e)) ||
    parties.find((p) => (p.domains || []).includes(domain)) ||
    null
  );
}

export function floorFor(floors, partyName) {
  if (!partyName) return null;
  const f = floors.find((x) => partyName.toLowerCase().includes(x.party_name.toLowerCase()) || x.party_name.toLowerCase().includes(partyName.toLowerCase()));
  return f ? Number(f.min_amount_sgd) : null;
}

// Parse the published price list file into [{service, amount, keywords}].
export function parsePriceList(files) {
  const f = files.find((x) => /price_list/i.test(x.path));
  if (!f) return [];
  const out = [];
  for (const line of String(f.content).split('\n')) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([\d,]+)\s*\|/);
    if (!m || /service|from/i.test(m[1])) continue;
    const service = m[1].trim();
    out.push({
      service,
      amount: Number(m[2].replace(/,/g, '')),
      keywords: service.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3),
    });
  }
  return out;
}

export function priceCheck(amount, text, priceList, floor) {
  // returns fired rule ids for a quoted/offer amount
  const fired = [];
  const t = String(text || '').toLowerCase();
  const item = priceList.find((p) => p.keywords.some((k) => t.includes(k)));
  if (floor != null && amount < floor) fired.push('R08');
  if (item && amount < item.amount) fired.push('R07');
  else if (!item && floor != null && amount >= floor) fired.push('R06');
  else if (item && amount >= item.amount) fired.push('R06');
  else if (!item && floor == null) fired.push(amount > 0 ? 'R06' : 'R07');
  if (floor != null && amount < floor && !fired.includes('R07')) fired.push('R07');
  return fired;
}

export const isPriceOffer = (body) =>
  /\d/.test(body) && /\b(we can (match|offer|do)|match it|match that|our (quote|price)|quote you|discount|offer you)\b/i.test(body);

export const isSettlement = (text) =>
  /\b(settle|settlement|waive|waiving|reduced payment|accept (a )?lower|change the contract)\b/i.test(text);

export const isOrderGoAhead = (body) =>
  /\b(go ahead|please print|proceed|confirm(ing)? (the )?(order|reprint)|place the order)\b/i.test(body);

// ---- plain-English rule compilation (FR-002-02) ----
// Returns {action, condition_text, decision, condition, owner_words, preview}
export function compileRule(sentence) {
  const s = String(sentence || '').trim();
  const lower = s.toLowerCase();
  const amountM = lower.match(/(?:sgd\s*)?([\d,]+(?:\.\d+)?)/);
  const amount = amountM ? Number(amountM[1].replace(/,/g, '')) : null;
  const emailM = s.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

  let m = lower.match(/never (?:quote|offer|go) (?:to )?(.+?) below (?:sgd )?([\d,]+)/);
  if (m) {
    const party = m[1].trim();
    const floor = Number(m[2].replace(/,/g, ''));
    return {
      action: 'quote_price', decision: 'NEVER',
      condition_text: `below SGD ${floor.toLocaleString('en-US')} for ${party}`,
      condition: { type: 'floor', party, amount: floor },
      owner_words: s,
      preview: `Never quote ${party} below SGD ${floor.toLocaleString('en-US')}. Any lower offer is blocked, and you cannot approve it away.`,
    };
  }
  m = lower.match(/(?:always )?(?:hold|approve|ask me (?:before|about)) (?:any )?(?:payment|pay|spend|order)s? (?:over|above|more than) (?:sgd )?([\d,]+)/);
  if (m) {
    const limit = Number(m[1].replace(/,/g, ''));
    return {
      action: 'pay_supplier', decision: 'APPROVE',
      condition_text: `payments over SGD ${limit.toLocaleString('en-US')}`,
      condition: { type: 'pay_limit', amount: limit },
      owner_words: s,
      preview: `Any payment over SGD ${limit.toLocaleString('en-US')} waits for your approval.`,
    };
  }
  if (/(never|don't|do not) (send|email|write)/.test(lower) && emailM) {
    return {
      action: 'send_email', decision: 'NEVER',
      condition_text: `to ${emailM[0]}`,
      condition: { type: 'never_recipient', email: emailM[0].toLowerCase() },
      owner_words: s,
      preview: `Never send anything to ${emailM[0]}. Emails to that address are blocked.`,
    };
  }
  if (/(always )?(hold|ask me|approve)/.test(lower) && /(new client|unknown|first time)/.test(lower)) {
    return {
      action: 'send_email', decision: 'APPROVE',
      condition_text: 'to a recipient not in the client or supplier list',
      condition: { type: 'unknown_recipient_hold' },
      owner_words: s,
      preview: 'Emails to anyone not in your client or supplier list wait for your approval.',
    };
  }
  return { error: 'Tanod could not turn that into a rule yet. Try shapes like \u201cNever quote Greenstep below 6,500\u201d, \u201cHold payments over 1,000\u201d or \u201cNever send to someone@example.com\u201d.' };
}

// Evaluate owner-added compiled rules against an action.
export function customRulesFired(policy, action, recipientParty) {
  const fired = [];
  for (const r of policy.rules) {
    if (r.builtin || !r.condition) continue;
    const c = r.condition;
    if (c.type === 'floor' && (action.action_type === 'quote_price' || action.price_offer)) {
      const target = (recipientParty?.name || action.to || '').toLowerCase();
      if (target.includes(c.party.toLowerCase()) && action.amount != null && action.amount < c.amount) {
        fired.push({ id: r.rid, decision: r.decision, note: r.condition_text });
      }
    } else if (c.type === 'pay_limit' && action.action_type === 'pay_supplier' && action.amount != null && action.amount > c.amount) {
      fired.push({ id: r.rid, decision: r.decision, note: r.condition_text });
    } else if (c.type === 'never_recipient' && action.action_type === 'send_email' && String(action.to || '').toLowerCase() === c.email) {
      fired.push({ id: r.rid, decision: r.decision, note: r.condition_text });
    } else if (c.type === 'unknown_recipient_hold' && action.action_type === 'send_email' && !recipientParty) {
      fired.push({ id: r.rid, decision: r.decision, note: r.condition_text });
    }
  }
  return fired;
}