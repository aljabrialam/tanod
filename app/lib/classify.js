// Spec 001 — data classifier. Content only: `sensitivity:` headers are never
// read (they are stripped at seed time and ignored here defensively).
// Deterministic pattern checks; every label records its reasons.

export const LEVELS = ['public', 'internal', 'client-confidential', 'regulated'];
export const rank = (l) => LEVELS.indexOf(l);
export const maxLevel = (...ls) =>
  ls.filter(Boolean).reduce((a, b) => (rank(b) > rank(a) ? b : a), 'public');

export function splitFrontmatter(raw) {
  const text = String(raw || '').replace(/^sensitivity:[^\n]*\n?/gm, '');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: text, title: '' };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: text.slice(m[0].length), title: meta.title || '' };
}

const REASONS = {
  nric: 'Contains an NRIC number (personal ID).',
  bank: 'Contains bank, card or PayNow account details.',
  health: 'Contains health or patient information.',
  address: 'Contains a home address.',
  phone: 'Contains phone numbers next to people\u2019s names.',
  contactList: 'A contact list of identifiable people (names, emails, phones).',
  ownerMoney: 'The owner\u2019s own money and private records.',
  regulatedMark: 'Marked as regulated personal data under the PDPA.',
  published: 'Written to be published, or approved for publication.',
  about: 'Public website copy about the business.',
  vendorMarketing: 'A marketing email received from a vendor.',
  agreement: 'A contract or agreement with a client.',
  proposal: 'A proposal or quote for a client.',
  confidentialMark: 'Contains information marked confidential or not public.',
  callNotes: 'Call notes about a client.',
  clientEmail: 'An email from a client about project terms or money.',
  invoice: 'An invoice the business issued or received.',
  supplier: 'Supplier list or supplier terms.',
  plan: 'A working plan, to-do or reminder.',
  default: 'The business\u2019s own working information.',
};

function push(reasons, key) {
  if (!reasons.includes(REASONS[key])) reasons.push(REASONS[key]);
}

// ctx: { path, from, to, clientDomains, supplierDomains, ownerEmail }
export function classifyText(raw, ctx = {}) {
  const { meta, body, title } = splitFrontmatter(raw);
  const from = ctx.from || meta.from || '';
  const reasons = [];

  // Visible text: hidden HTML comments are information, not content the
  // owner wrote; the injection check looks at them separately.
  const visible = body.replace(/<!--[\s\S]*?-->/g, '');
  const issuedInvoice = /^Invoice \d{4}-\d{3}/i.test(title) && /Bill to:/i.test(visible);
  // Payment instructions on our own invoices name our receiving account;
  // they do not make the invoice regulated.
  const scan = issuedInvoice
    ? visible.split('\n').filter((l) => !/^Pay to:/i.test(l.trim())).join('\n')
    : visible;
  const hay = `${title}\n${scan}`;

  // ---- regulated (highest wins) ----
  if (/\b[STFG]\d{7}[A-Z]\b/.test(hay)) push(reasons, 'nric');
  if (/\b(bank account|business account|card on file|paynow)\b/i.test(hay) || /DBS \d{3}-\d{6}-\d/.test(hay)) push(reasons, 'bank');
  if (/patient_name|reason_for_visit|hypertension|diagnosis|contains patient data|medical details/i.test(hay)) push(reasons, 'health');
  if (/home address/i.test(hay)) push(reasons, 'address');
  if (/\+65\s?\d{4}\s?\d{4}/.test(hay)) push(reasons, 'phone');
  const firstLine = scan.trim().split('\n')[0] || '';
  if (firstLine.includes(',') && /email/i.test(firstLine) && /phone/i.test(firstLine)) push(reasons, 'contactList');
  if (/owner's private|personal loan|bank balance/i.test(hay)) push(reasons, 'ownerMoney');
  if (/regulated personal data|treat the file as regulated/i.test(hay)) push(reasons, 'regulatedMark');
  if (reasons.length) return { label: 'regulated', reasons };

  // ---- public (explicit publication markers) ----
  if (/published rates|approved for publication/i.test(hay)) push(reasons, 'published');
  else if (/^About\b/i.test(title)) push(reasons, 'about');
  else if (from) {
    const domain = from.split('@')[1] || '';
    const known =
      domain === (ctx.ownerEmail || '').split('@')[1] ||
      (ctx.clientDomains || []).includes(domain) ||
      (ctx.supplierDomains || []).includes(domain);
    if (!known && /free|trial|newsletter|unsubscribe/i.test(hay)) push(reasons, 'vendorMarketing');
  }
  if (reasons.length) return { label: 'public', reasons };

  // ---- a compliance notification carries no private data itself ----
  if (/\b(have deleted|deleted it|deleted the file)\b/i.test(hay) && /\b(contract|requires|policy|in error)\b/i.test(hay)) {
    return { label: 'internal', reasons: ['A compliance notification; no private data is included.'] };
  }

  // ---- client-confidential ----
  if (/services agreement|\bagreement\b|\bcontract\b/i.test(hay)) push(reasons, 'agreement');
  if (/\bproposal\b|\bquote[ds]?\b/i.test(hay)) push(reasons, 'proposal');
  if (/\bNDA\b|not public|isn't public|keep quiet|unannounced|not announced|strictly confidential|confidentiality/i.test(hay)) push(reasons, 'confidentialMark');
  if (/call notes/i.test(title)) push(reasons, 'callNotes');
  if (!reasons.length && from && (ctx.clientDomains || []).includes(from.split('@')[1] || '')) {
    if (/\bSGD\b|\d{1,3},\d{3}|proposal|contract|quote|settle|surcharge|invoice/i.test(visible)) push(reasons, 'clientEmail');
  }
  if (reasons.length) return { label: 'client-confidential', reasons };

  // ---- internal ----
  if (/invoice/i.test(title)) push(reasons, 'invoice');
  else if (/supplier list/i.test(title)) push(reasons, 'supplier');
  else if (/weekly plan|reminder|to-do/i.test(title)) push(reasons, 'plan');
  else push(reasons, 'default');
  return { label: 'internal', reasons };
}