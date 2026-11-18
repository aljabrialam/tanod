// Generic table storage. Two backends, one interface:
//  - Supabase REST (production; the Page runtime injects SUPABASE_URL / SUPABASE_ANON_KEY)
//  - in-memory (local development)
// Tables: workspaces, files, parties, floors, rules, actions, ledger,
//         approvals, checkpoints, branches, briefings, test_runs.

function supabaseBackend() {
  const base = `${process.env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`;
  const key = process.env.SUPABASE_ANON_KEY;

  async function call(route, init = {}) {
    const res = await fetch(`${base}/${route}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`database request failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  function qs(filter = {}, opts = {}) {
    const parts = [];
    for (const [col, val] of Object.entries(filter)) {
      if (val && typeof val === 'object' && val.op) parts.push(`${col}=${val.op}.${encodeURIComponent(val.v)}`);
      else parts.push(`${col}=eq.${encodeURIComponent(val)}`);
    }
    if (opts.order) parts.push(`order=${opts.order}`);
    if (opts.limit) parts.push(`limit=${opts.limit}`);
    return parts.join('&');
  }

  return {
    kind: 'supabase',
    async insert(table, rows) {
      const list = Array.isArray(rows) ? rows : [rows];
      const out = [];
      for (let i = 0; i < list.length; i += 20) {
        const res = await call(table, {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(list.slice(i, i + 20)),
        });
        out.push(...(res || []));
      }
      return Array.isArray(rows) ? out : out[0];
    },
    async select(table, filter = {}, opts = {}) {
      return (await call(`${table}?${qs(filter, opts)}`)) || [];
    },
    async update(table, filter, patch) {
      return (await call(`${table}?${qs(filter)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      })) || [];
    },
    async upsert(table, rows, conflict) {
      const list = Array.isArray(rows) ? rows : [rows];
      for (let i = 0; i < list.length; i += 20) {
        await call(`${table}?on_conflict=${conflict}`, {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify(list.slice(i, i + 20)),
        });
      }
    },
    async remove(table, filter) {
      await call(`${table}?${qs(filter)}`, { method: 'DELETE' });
    },
  };
}

function memoryBackend() {
  const tables = new Map();
  const seqs = new Map();
  const t = (name) => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name);
  };
  const match = (row, filter) =>
    Object.entries(filter).every(([col, val]) => {
      if (val && typeof val === 'object' && val.op) {
        if (val.op === 'gt') return row[col] > val.v;
        if (val.op === 'gte') return row[col] >= val.v;
        if (val.op === 'lt') return row[col] < val.v;
        if (val.op === 'lte') return row[col] <= val.v;
        if (val.op === 'neq') return row[col] !== val.v;
        if (val.op === 'is') return val.v === null ? row[col] == null : row[col] === val.v;
        return false;
      }
      return row[col] === val;
    });
  const sortRows = (rows, order) => {
    if (!order) return rows;
    const [col, dir] = order.split('.');
    return [...rows].sort((a, b) => {
      const av = a[col]; const bv = b[col];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === 'desc' ? -cmp : cmp;
    });
  };
  return {
    kind: 'memory',
    async insert(table, rows) {
      const list = Array.isArray(rows) ? rows : [rows];
      const out = list.map((r) => {
        const id = (seqs.get(table) || 0) + 1;
        seqs.set(table, id);
        const row = { id, created_at: new Date().toISOString(), ...r };
        t(table).push(row);
        return row;
      });
      return Array.isArray(rows) ? out : out[0];
    },
    async select(table, filter = {}, opts = {}) {
      let rows = t(table).filter((r) => match(r, filter));
      rows = sortRows(rows, opts.order);
      if (opts.limit) rows = rows.slice(0, opts.limit);
      return rows.map((r) => ({ ...r }));
    },
    async update(table, filter, patch) {
      const out = [];
      for (const row of t(table)) {
        if (match(row, filter)) {
          Object.assign(row, patch);
          out.push({ ...row });
        }
      }
      return out;
    },
    async upsert(table, rows, conflict) {
      const cols = conflict.split(',');
      const list = Array.isArray(rows) ? rows : [rows];
      for (const r of list) {
        const existing = t(table).find((row) => cols.every((c) => row[c] === r[c]));
        if (existing) Object.assign(existing, r);
        else await this.insert(table, r);
      }
    },
    async remove(table, filter) {
      const rows = t(table);
      for (let i = rows.length - 1; i >= 0; i--) {
        if (match(rows[i], filter)) rows.splice(i, 1);
      }
    },
  };
}

export const db =
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ? supabaseBackend()
    : memoryBackend();