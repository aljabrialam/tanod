// Spec 004 — tamper-evident history. Append-only, SHA-256 hash chain.
// hash = SHA-256(prev_hash + canonical JSON of the entry without hash).

import { createHash } from 'node:crypto';
import { db } from './db.js';

// Only these fields are hashed; storage-added columns (id, created_at) are not
// part of the entry's content.
const FIELDS = ['workspace_id', 'seq', 'timestamp', 'agent', 'action_type', 'files_touched', 'data_level', 'outcome', 'rules', 'summary', 'prev_hash', 'action_id', 'checkpoint_id', 'branch_id', 'is_rewind'];

function pick(entry) {
  const out = {};
  for (const f of FIELDS) out[f] = entry[f] === undefined ? null : entry[f];
  return out;
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

export function entryHash(prevHash, entry) {
  return createHash('sha256').update(prevHash + canonical(pick(entry))).digest('hex');
}

export async function appendLedger(wsId, fields) {
  const last = await db.select('ledger', { workspace_id: wsId }, { order: 'seq.desc', limit: 1 });
  const prevHash = last.length ? last[0].hash : 'GENESIS';
  const seq = last.length ? last[0].seq + 1 : 1;
  const entry = {
    workspace_id: wsId,
    seq,
    timestamp: new Date().toISOString(),
    prev_hash: prevHash,
    ...fields,
  };
  entry.hash = entryHash(prevHash, entry);
  const row = await db.insert('ledger', entry);
  return row;
}

export async function verifyChain(wsId) {
  const rows = await db.select('ledger', { workspace_id: wsId }, { order: 'seq.asc', limit: 10000 });
  let prev = 'GENESIS';
  for (const row of rows) {
    if (row.prev_hash !== prev) {
      return { entries: rows.length, broken: row.seq, reason: 'previous-hash link broken' };
    }
    const expect = entryHash(prev, row);
    if (expect !== row.hash) {
      return { entries: rows.length, broken: row.seq, reason: 'content changed after it was written' };
    }
    prev = row.hash;
  }
  return { entries: rows.length, broken: null };
}