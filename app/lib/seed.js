// Workspace seeding: Lumen Studio demo (28 files incl. the S8 inbox email),
// parties, floors and the 19-rule policy template. Also creates fresh
// workspaces for onboarding and resets the demo.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { classifyText, splitFrontmatter } from './classify.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SEED_DIR = path.join(ROOT, 'data', 'seed');
const RULES_DIR = path.join(ROOT, 'data', 'rules');

export const DEMO_WORKSPACE = {
  id: 'lumen-studio',
  name: 'Lumen Studio',
  owner_name: 'Mei Tan',
  owner_email: 'mei@lumenstudio.example',
};

async function walk(dir, base = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const out = [];
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walk(path.join(dir, e.name), rel)));
    else out.push(rel);
  }
  return out;
}

export async function policyTemplate() {
  return JSON.parse(await readFile(path.join(RULES_DIR, 'policy.json'), 'utf8'));
}

export function parseClientCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const rows = [];
  for (const line of lines.slice(1)) {
    // simple CSV split honouring double quotes
    const cells = [];
    let cur = ''; let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    if (cells.length < 4) continue;
    const [name, contact, email] = cells;
    rows.push({
      kind: 'client', name: name.trim(), contact: contact.trim(),
      emails: [email.trim()], domains: [(email.split('@')[1] || '').trim()],
    });
  }
  return rows;
}

export const DEMO_SUPPLIERS = [
  { kind: 'supplier', name: 'QuickPrint SG', contact: 'Orders', emails: ['orders@quickprint.example'], domains: ['quickprint.example'] },
  { kind: 'supplier', name: 'Webflow', contact: '', emails: [], domains: [] },
  { kind: 'supplier', name: 'Adobe', contact: '', emails: [], domains: [] },
  { kind: 'supplier', name: 'Jia Wen (freelance)', contact: 'Jia Wen', emails: ['jiawen@example'], domains: ['example'] },
];

export async function seedRules(wsId) {
  const existing = await db.select('rules', { workspace_id: wsId }, { limit: 1 });
  if (existing.length) return;
  const tpl = await policyTemplate();
  const rows = tpl.rules.map((r) => ({
    workspace_id: wsId, rid: r.id, action: r.action,
    condition_text: r.condition, decision: r.decision,
    owner_words: r.condition, enabled: true, builtin: true, condition: null,
  }));
  await db.insert('rules', rows);
  for (const [partyName, amount] of Object.entries(tpl.owner_floors || {})) {
    await db.upsert('floors', { workspace_id: wsId, party_name: partyName, min_amount_sgd: amount }, 'workspace_id,party_name');
  }
}

export async function partiesCtx(wsId) {
  const parties = await db.select('parties', { workspace_id: wsId });
  const ws = (await db.select('workspaces', { id: wsId }, { limit: 1 }))[0];
  return {
    parties,
    clientDomains: parties.filter((p) => p.kind === 'client').flatMap((p) => p.domains || []),
    supplierDomains: parties.filter((p) => p.kind === 'supplier').flatMap((p) => p.domains || []),
    ownerEmail: ws?.owner_email || '',
  };
}

export async function seedDemoFiles(wsId, { force = false } = {}) {
  const ctx = await partiesCtx(wsId);
  const rels = await walk(SEED_DIR);
  let count = 0;
  for (const rel of rels) {
    const content = (await readFile(path.join(SEED_DIR, rel), 'utf8'))
      .replace(/^sensitivity:[^\n]*\n?/gm, '');
    const { meta } = splitFrontmatter(content);
    const { label, reasons } = classifyText(content, { ...ctx, path: rel, from: meta.from, to: meta.to });
    const row = {
      workspace_id: wsId, path: rel, content,
      label, label_reasons: reasons, label_confirmed: false,
      deleted_at: null, kept_until: null,
    };
    if (force) {
      await db.upsert('files', row, 'workspace_id,path');
    } else {
      const existing = await db.select('files', { workspace_id: wsId, path: rel }, { limit: 1 });
      if (!existing.length) await db.insert('files', row);
    }
    count++;
  }
  return count;
}

export async function ensureDemoWorkspace() {
  await db.upsert('workspaces', { ...DEMO_WORKSPACE }, 'id');
  const parties = await db.select('parties', { workspace_id: DEMO_WORKSPACE.id }, { limit: 1 });
  if (!parties.length) {
    const csv = await readFile(path.join(SEED_DIR, 'admin', 'client_list.csv'), 'utf8');
    await db.insert('parties', parseClientCsv(csv).map((p) => ({ ...p, workspace_id: DEMO_WORKSPACE.id })));
    await db.insert('parties', DEMO_SUPPLIERS.map((p) => ({ ...p, workspace_id: DEMO_WORKSPACE.id })));
  }
  await seedRules(DEMO_WORKSPACE.id);
  // insert any seed files missing from an earlier deployment (e.g. the S8 email)
  await seedDemoFiles(DEMO_WORKSPACE.id);
  // backfill labels for files seeded before the classifier existed
  const unlabeled = await db.select('files', { workspace_id: DEMO_WORKSPACE.id, label: { op: 'is', v: null } }, { limit: 2000 });
  if (unlabeled.length) {
    const ctx = await partiesCtx(DEMO_WORKSPACE.id);
    for (const f of unlabeled) {
      const { meta } = splitFrontmatter(f.content);
      const { label, reasons } = classifyText(f.content, { ...ctx, path: f.path, from: meta.from, to: meta.to });
      await db.update('files', { id: f.id }, { label, label_reasons: reasons });
    }
    console.log(`[tanod] labelled ${unlabeled.length} pre-existing files`);
  }
}

export async function createWorkspace({ name, owner_name, owner_email }) {
  const id = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'workspace';
  const existing = await db.select('workspaces', { id }, { limit: 1 });
  if (existing.length) throw Object.assign(new Error('A workspace with that name already exists.'), { status: 409 });
  await db.insert('workspaces', { id, name, owner_name, owner_email });
  await seedRules(id);
  return { id, name, owner_name, owner_email };
}

export async function resetDemo() {
  const wsId = DEMO_WORKSPACE.id;
  for (const table of ['actions', 'ledger', 'approvals', 'checkpoints', 'branches', 'briefings', 'test_runs']) {
    await db.remove(table, { workspace_id: wsId });
  }
  await db.remove('rules', { workspace_id: wsId });
  await db.remove('floors', { workspace_id: wsId });
  await seedRules(wsId);
  await seedDemoFiles(wsId, { force: true });
}

// Extract candidate parties from uploaded files (onboarding step 3).
export function extractParties(files) {
  const found = new Map();
  const emailRe = /[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  for (const f of files) {
    const { body } = splitFrontmatter(f.content);
    for (const m of body.matchAll(emailRe)) {
      const email = m[0].toLowerCase();
      const domain = m[1].toLowerCase();
      if (domain.endsWith('.example') === false && !/\.(com|org|net|io|co|sg)$/.test(domain)) continue;
      if (!found.has(email)) {
        const local = email.split('@')[0];
        found.set(email, {
          kind: 'client', name: domain.split('.')[0], contact: local,
          emails: [email], domains: [domain],
        });
      }
    }
  }
  return [...found.values()];
}