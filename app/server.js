// Tanod — your agents draft. Tanod decides what leaves.
// Node.js built-ins only. Persistent storage via the Page database.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './lib/db.js';
import {
  ensureDemoWorkspace, ensureBusinessWorkspace, createWorkspace, resetDemo, extractParties, partiesCtx, DEMO_WORKSPACE, BUSINESS_WORKSPACE,
} from './lib/seed.js';
import { classifyText, splitFrontmatter } from './lib/classify.js';
import { decide, normalizeInput, resolveApproval, approvalHealth, rewind, ACTION_TYPES } from './lib/engine.js';
import { verifyChain, appendLedger } from './lib/ledger.js';
import { mergeOption } from './lib/repair.js';
import { buildBriefing } from './lib/briefing.js';
import { runSuite, latestRun } from './lib/tests.js';
import { startRun, studioStatus, studioSupported, AGENTS } from './lib/studio.js';
import { compileRule } from './lib/policy.js';

const PORT = Number(process.env.PORT) || 8081;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const STATIC_FILES = new Map([
  ['/', { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/index.html', { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/styles.css', { file: 'styles.css', type: 'text/css; charset=utf-8' }],
  ['/app.js', { file: 'app.js', type: 'text/javascript; charset=utf-8' }],
]);

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(data);
}
const sendError = (res, status, message) => send(res, status, { error: message });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  try {
    const json = JSON.parse(raw);
    if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new Error();
    return json;
  } catch {
    throw Object.assign(new Error('Request body must be a JSON object.'), { status: 400 });
  }
}

async function getWorkspace(id) {
  const ws = (await db.select('workspaces', { id }, { limit: 1 }))[0];
  if (!ws) throw Object.assign(new Error(`Unknown workspace "${id}".`), { status: 404 });
  return ws;
}

// ---------------------------------------------------------------- api

async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;

  if (p === '/api/workspaces' && method === 'GET') {
    return send(res, 200, { workspaces: await db.select('workspaces', {}, { order: 'created_at.asc', limit: 100 }) });
  }
  if (p === '/api/workspaces' && method === 'POST') {
    const json = await readJson(req);
    if (!json.name || !json.owner_name || !json.owner_email) {
      return sendError(res, 400, 'Business name, owner name and owner email are all required.');
    }
    const ws = await createWorkspace({ name: String(json.name), owner_name: String(json.owner_name), owner_email: String(json.owner_email) });
    return send(res, 201, { workspace: ws });
  }

  const m = p.match(/^\/api\/workspaces\/([^/]+)(\/.*)?$/);
  if (!m) return sendError(res, 404, 'Unknown API route.');
  const [, wsId, rest = ''] = m;
  const ws = await getWorkspace(wsId);
  const seg = rest.split('/').filter(Boolean);

  // ---- gateway ----
  if (rest === '/actions' && method === 'POST') {
    const json = await readJson(req);
    const normalized = normalizeInput(json);
    if (normalized.error) return sendError(res, 400, normalized.error);
    const d = await decide(wsId, normalized.value);
    return send(res, 201, {
      ref: d.ref, outcome: d.outcome, rules: d.rules, data_level: d.data_level,
      owner_line: d.owner_line, reason: d.owner_line, evidence: d.evidence,
      recommendation: d.recommendation, ledger_seq: d.ledger_seq,
      checkpoint_id: d.checkpoint_id, options: d.options || [],
      agent: normalized.value.agent_name, action: normalized.value.action_type,
      submitted_at: new Date().toISOString(),
    });
  }
  if (rest === '/actions' && method === 'GET') {
    const rows = await db.select('actions', { workspace_id: wsId }, { order: 'id.desc', limit: 1000 });
    return send(res, 200, { workspace: wsId, actions: rows });
  }
  if (seg[0] === 'actions' && seg[1] && method === 'GET' && seg.length === 2) {
    const row = (await db.select('actions', { id: Number(seg[1]), workspace_id: wsId }, { limit: 1 }))[0];
    if (!row) return sendError(res, 404, 'Action not found.');
    const branches = await db.select('branches', { workspace_id: wsId, origin_action_id: row.id });
    return send(res, 200, { action: row, branches });
  }
  if (seg[0] === 'actions' && seg[1] && seg[2] === 'merge' && method === 'POST') {
    const json = await readJson(req);
    if (!json.branch_id) return sendError(res, 400, '"branch_id" is required.');
    const d = await mergeOption(wsId, Number(seg[1]), String(json.branch_id), decide);
    return send(res, 201, { ref: d.ref, outcome: d.outcome, owner_line: d.owner_line, reason: d.owner_line, rules: d.rules, evidence: d.evidence, ledger_seq: d.ledger_seq });
  }

  // ---- files ----
  if (rest === '/files' && method === 'GET') {
    const filePath = url.searchParams.get('path');
    if (filePath) {
      const f = (await db.select('files', { workspace_id: wsId, path: filePath }, { limit: 1 }))[0];
      if (!f) return sendError(res, 404, `No file at "${filePath}" in this workspace.`);
      return send(res, 200, { file: f });
    }
    const files = await db.select('files', { workspace_id: wsId }, { order: 'path.asc', limit: 2000 });
    return send(res, 200, { workspace: wsId, files: files.map(({ content, ...meta }) => meta) });
  }
  if (rest === '/files' && method === 'POST') {
    const json = await readJson(req);
    const items = Array.isArray(json.files) ? json.files : [json];
    const ctx = await partiesCtx(wsId);
    const added = [];
    for (const item of items.slice(0, 100)) {
      const filePath = String(item.path || '').trim().replace(/^\/+/, '');
      if (!filePath || typeof item.content !== 'string') continue;
      const content = item.content.replace(/^sensitivity:[^\n]*\n?/gm, '');
      const { meta } = splitFrontmatter(content);
      const { label, reasons } = classifyText(content, { ...ctx, path: filePath, from: meta.from, to: meta.to });
      await db.upsert('files', {
        workspace_id: wsId, path: filePath, content, label,
        label_reasons: reasons, label_confirmed: false, deleted_at: null, kept_until: null,
      }, 'workspace_id,path');
      added.push({ path: filePath, label, reasons });
    }
    if (!added.length) return sendError(res, 400, 'Send {files: [{path, content}]} with at least one text file.');
    return send(res, 201, { added });
  }
  if (rest === '/files/label' && method === 'POST') {
    const json = await readJson(req);
    const levels = ['public', 'internal', 'client-confidential', 'regulated'];
    if (!json.path || !levels.includes(json.label)) return sendError(res, 400, 'A file path and a valid level are required.');
    const patch = { label: json.label, label_confirmed: true };
    if (json.previous_label && json.label !== json.previous_label) patch.label_reasons = ['You set this level yourself.'];
    const rows = await db.update('files', { workspace_id: wsId, path: String(json.path) }, patch);
    if (!rows.length) return sendError(res, 404, 'File not found.');
    return send(res, 200, { file: rows[0] });
  }

  // ---- ledger ----
  if (rest === '/ledger' && method === 'GET') {
    const rows = await db.select('ledger', { workspace_id: wsId }, { order: 'seq.desc', limit: 2000 });
    return send(res, 200, { workspace: wsId, entries: rows });
  }
  if (rest === '/ledger/verify' && method === 'POST') {
    return send(res, 200, await verifyChain(wsId));
  }

  // ---- approvals ----
  if (rest === '/approvals' && method === 'GET') {
    const approvals = await db.select('approvals', { workspace_id: wsId }, { order: 'id.desc', limit: 500 });
    const actions = await db.select('actions', { workspace_id: wsId }, { limit: 2000 });
    const byId = new Map(actions.map((a) => [a.id, a]));
    const now = Date.now();
    const items = [];
    for (const ap of approvals) {
      if (ap.status === 'pending' && new Date(ap.expires_at).getTime() < now) {
        await db.update('approvals', { id: ap.id }, { status: 'expired' });
        ap.status = 'expired';
      }
      items.push({ ...ap, action: byId.get(ap.action_id) || null });
    }
    return send(res, 200, { items, health: await approvalHealth(wsId) });
  }
  if (seg[0] === 'approvals' && seg[1] && (seg[2] === 'release' || seg[2] === 'reject') && method === 'POST') {
    const result = await resolveApproval(wsId, Number(seg[1]), seg[2]);
    return send(res, 200, result);
  }

  // ---- checkpoints & rewind ----
  if (rest === '/checkpoints' && method === 'GET') {
    const rows = await db.select('checkpoints', { workspace_id: wsId }, { order: 'created_at.desc', limit: 500 });
    return send(res, 200, { checkpoints: rows });
  }
  if (rest === '/rewind' && method === 'POST') {
    const json = await readJson(req);
    if (!json.checkpoint_id) return sendError(res, 400, '"checkpoint_id" is required.');
    return send(res, 200, await rewind(wsId, String(json.checkpoint_id)));
  }

  // ---- policy ----
  if (rest === '/rules' && method === 'GET') {
    const rules = await db.select('rules', { workspace_id: wsId }, { order: 'rid.asc', limit: 200 });
    const floors = await db.select('floors', { workspace_id: wsId });
    return send(res, 200, { rules, floors });
  }
  if (rest === '/rules/compile' && method === 'POST') {
    const json = await readJson(req);
    const compiled = compileRule(json.sentence);
    if (compiled.error) return sendError(res, 400, compiled.error);
    return send(res, 200, { compiled });
  }
  if (rest === '/rules' && method === 'POST') {
    const json = await readJson(req);
    const compiled = compileRule(json.sentence);
    if (compiled.error) return sendError(res, 400, compiled.error);
    const existing = await db.select('rules', { workspace_id: wsId }, { limit: 200 });
    const n = existing.filter((r) => !r.builtin).length + 1;
    const rid = `C${String(n).padStart(2, '0')}`;
    const row = await db.insert('rules', {
      workspace_id: wsId, rid, action: compiled.action, condition_text: compiled.condition_text,
      decision: compiled.decision, owner_words: compiled.owner_words, enabled: true,
      builtin: false, condition: compiled.condition,
    });
    if (compiled.condition?.type === 'floor') {
      await db.upsert('floors', { workspace_id: wsId, party_name: compiled.condition.party, min_amount_sgd: compiled.condition.amount }, 'workspace_id,party_name');
    }
    const tests = wsId === DEMO_WORKSPACE.id ? await runSuite(wsId, decide) : null; // CI: re-run when rules change (benchmark workspace)
    return send(res, 201, { rule: row, preview: compiled.preview, tests: tests?.totals || null });
  }
  if (seg[0] === 'rules' && seg[1] && method === 'PATCH') {
    const json = await readJson(req);
    const patch = {};
    if (typeof json.enabled === 'boolean') patch.enabled = json.enabled;
    if (!Object.keys(patch).length) return sendError(res, 400, 'Nothing to change.');
    const rows = await db.update('rules', { workspace_id: wsId, rid: seg[1] }, patch);
    if (!rows.length) return sendError(res, 404, 'Rule not found.');
    const tests = wsId === DEMO_WORKSPACE.id ? await runSuite(wsId, decide) : null;
    return send(res, 200, { rule: rows[0], tests: tests?.totals || null });
  }
  if (rest === '/floors' && method === 'POST') {
    const json = await readJson(req);
    if (!json.party_name || !(Number(json.min_amount_sgd) > 0)) return sendError(res, 400, 'A client name and a positive amount are required.');
    await db.upsert('floors', { workspace_id: wsId, party_name: String(json.party_name), min_amount_sgd: Number(json.min_amount_sgd) }, 'workspace_id,party_name');
    return send(res, 201, { ok: true });
  }

  // ---- parties ----
  if (rest === '/parties' && method === 'GET') {
    return send(res, 200, { parties: await db.select('parties', { workspace_id: wsId }, { limit: 500 }) });
  }
  if (rest === '/parties' && method === 'POST') {
    const json = await readJson(req);
    if (!json.name || !['client', 'supplier'].includes(json.kind)) return sendError(res, 400, 'A name and kind (client or supplier) are required.');
    const emails = Array.isArray(json.emails) ? json.emails : String(json.email || '').split(',').map((s) => s.trim()).filter(Boolean);
    const row = await db.insert('parties', {
      workspace_id: wsId, kind: json.kind, name: String(json.name), contact: String(json.contact || ''),
      emails, domains: [...new Set(emails.map((e) => e.split('@')[1]).filter(Boolean))],
    });
    return send(res, 201, { party: row });
  }
  if (rest === '/parties/extract' && method === 'POST') {
    const files = await db.select('files', { workspace_id: wsId }, { limit: 2000 });
    return send(res, 200, { candidates: extractParties(files) });
  }

  // ---- studio: simulated agents, real gate ----
  if (rest === '/studio/agents' && method === 'GET') {
    return send(res, 200, { agents: AGENTS });
  }
  if (rest === '/studio/run' && method === 'POST') {
    if (!studioSupported(wsId)) return sendError(res, 400, 'The studio demo runs in the Brightledger or Lumen Studio workspace.');
    const json = await readJson(req);
    return send(res, 202, startRun(wsId, json.mode || 'rogue', { speedMs: json.speed_ms }));
  }
  if (rest === '/studio/status' && method === 'GET') {
    return send(res, 200, studioStatus(wsId));
  }

  // ---- briefing, tests, health ----
  if (rest === '/briefing' && method === 'GET') {
    return send(res, 200, { date: url.searchParams.get('date') || new Date().toISOString().slice(0, 10), lines: await buildBriefing(wsId, url.searchParams.get('date')) });
  }
  if (rest === '/tests/run' && method === 'POST') {
    if (wsId !== DEMO_WORKSPACE.id) return sendError(res, 400, 'The test suite runs against the Lumen Studio benchmark workspace.');
    return send(res, 200, await runSuite(wsId, decide));
  }
  if (rest === '/tests/latest' && method === 'GET') {
    return send(res, 200, { results: await latestRun(wsId) });
  }
  if (rest === '/health' && method === 'GET') {
    const actions = await db.select('actions', { workspace_id: wsId }, { limit: 2000 });
    const today = new Date().toISOString().slice(0, 10);
    const todays = actions.filter((a) => String(a.submitted_at).slice(0, 10) === today);
    const count = (o) => todays.filter((a) => a.outcome === o).length;
    return send(res, 200, {
      today: { total: todays.length, allow: count('ALLOW'), hold: count('HOLD_FOR_APPROVAL'), block: count('BLOCK') },
      approvals: await approvalHealth(wsId),
      storage: db.kind,
    });
  }
  if (rest === '/sent' && method === 'GET') {
    const rows = await db.select('actions', { workspace_id: wsId }, { order: 'id.desc', limit: 1000 });
    return send(res, 200, { sent: rows.filter((a) => a.executed && a.action_type === 'send_email') });
  }
  if (rest === '/reset' && method === 'POST') {
    if (wsId !== DEMO_WORKSPACE.id && wsId !== BUSINESS_WORKSPACE.id) return sendError(res, 403, 'Only the demo workspaces can be reset.');
    await resetDemo(wsId);
    return send(res, 200, { ok: true });
  }

  if (!rest) {
    const origin = `${url.protocol}//${req.headers.host}`;
    return send(res, 200, {
      app: 'Tanod', tagline: 'Your agents draft. Tanod decides what leaves.',
      workspace: ws,
      endpoints: {
        actions: `POST ${origin}/api/workspaces/${wsId}/actions`,
        actionList: `GET ${origin}/api/workspaces/${wsId}/actions`,
        files: `GET ${origin}/api/workspaces/${wsId}/files`,
        outbox: `${origin}/#/outbox`,
      },
      action_types: ACTION_TYPES,
    });
  }

  return sendError(res, 405, `Method ${method} is not allowed here.`);
}

// ---------------------------------------------------------------- startup

let ready = null;
async function ensureReady() {
  if (!ready) {
    ready = (async () => {
      await ensureDemoWorkspace();
      await ensureBusinessWorkspace();
      // backfill the chain for any spec-000 actions recorded before the ledger existed
      const head = await db.select('ledger', { workspace_id: DEMO_WORKSPACE.id }, { limit: 1 });
      if (!head.length) {
        const old = await db.select('actions', { workspace_id: DEMO_WORKSPACE.id }, { order: 'id.asc', limit: 1000 });
        for (const a of old) {
          await appendLedger(DEMO_WORKSPACE.id, {
            agent: a.agent_name, action_type: a.action_type,
            files_touched: a.files_read || [], data_level: a.data_level || 'internal',
            outcome: a.outcome, rules: a.rules || [], summary: a.reason,
            action_id: a.id, checkpoint_id: null, is_rewind: false,
          });
        }
      }
    })().catch((err) => { ready = null; throw err; });
  }
  return ready;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    try {
      await ensureReady();
      return await handleApi(req, res, url);
    } catch (err) {
      const status = err.status || 500;
      console.error(`[tanod] ${req.method} ${url.pathname} failed:`, err.message);
      return sendError(res, status, status < 500 ? err.message : 'Something went wrong on Tanod\u2019s side. Please try again.');
    }
  }

  if (url.pathname === '/fonts/outfit-latin.woff2' && (req.method === 'GET' || req.method === 'HEAD')) {
    try {
      const content = await readFile(path.join(PUBLIC_DIR, 'fonts', 'outfit-latin.woff2'));
      res.writeHead(200, {
        'Content-Type': 'font/woff2',
        'Content-Length': content.length,
        'Cache-Control': 'public, max-age=604800',
      });
      return res.end(req.method === 'HEAD' ? undefined : content);
    } catch {
      return sendError(res, 404, 'Not found.');
    }
  }

  const staticRoute = STATIC_FILES.get(url.pathname);
  if (staticRoute && (req.method === 'GET' || req.method === 'HEAD')) {
    try {
      const content = await readFile(path.join(PUBLIC_DIR, staticRoute.file));
      res.writeHead(200, {
        'Content-Type': staticRoute.type,
        'Content-Length': content.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.end(req.method === 'HEAD' ? undefined : content);
    } catch {
      return sendError(res, 404, 'Not found.');
    }
  }
  return sendError(res, 404, 'Not found.');
});

server.listen(PORT, HOST, () => {
  console.log(`[tanod] listening on http://${HOST}:${PORT}`);
  console.log(`[tanod] outbox: http://${HOST}:${PORT}/#/outbox`);
  console.log(`[tanod] api:    POST http://${HOST}:${PORT}/api/workspaces/${BUSINESS_WORKSPACE.id}/actions`);
});