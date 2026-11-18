// Spec 003 — scope check. Compare files read with the task text.
// in scope / arguably in scope / out of scope, each with a plain reason.

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'about', 'with', 'reply', 'draft', 'send', 'write', 'handle', 'new', 'old', 'this', 'that', 'from', 'our', 'my', 'me', 'please', 'task', 'given']);

const tokens = (s) =>
  (String(s).toLowerCase().match(/[a-z][a-z-]{2,}/g) || []).filter((w) => !STOP.has(w));

function bigrams(text) {
  const ws = (String(text).toLowerCase().match(/[a-z][a-z-]{2,}/g) || []).filter((w) => !STOP.has(w));
  const out = new Set();
  for (let i = 0; i < ws.length - 1; i++) out.add(`${ws[i]} ${ws[i + 1]}`);
  return out;
}

// files: [{path, content, label}]
export function scopeCheck(task, filesRead, files) {
  const taskTokens = tokens(task);
  const byPath = new Map(files.map((f) => [f.path, f]));
  const results = [];
  const inScopeBigrams = new Set();

  const direct = (f) => {
    if (/^inbox\//.test(f.path) && /\b(email|emails|inbox|reply|handle)\b/i.test(task)) return 1;
    const pathHits = taskTokens.filter((t) => f.path.toLowerCase().includes(t)).length;
    if (pathHits > 0) return pathHits;
    const body = String(f.content || '').toLowerCase();
    const contentHits = taskTokens.filter((t) => body.includes(t)).length;
    return contentHits >= 2 ? contentHits : 0;
  };

  for (const p of filesRead) {
    const f = byPath.get(p);
    if (!f) {
      results.push({ path: p, scope: 'out_of_scope', reason: 'This file is not in the workspace.' });
      continue;
    }
    if (direct(f)) {
      results.push({ path: p, scope: 'in_scope', reason: 'Matches the task directly.' });
      for (const b of bigrams(f.content)) inScopeBigrams.add(b);
    }
  }
  for (const p of filesRead) {
    if (results.some((r) => r.path === p)) continue;
    const f = byPath.get(p);
    const body = String(f.content || '').toLowerCase();
    const shared = [...inScopeBigrams].filter((b) => body.includes(b)).slice(0, 3);
    if (shared.length) {
      results.push({ path: p, scope: 'arguably_in_scope', reason: `Linked to the task through \u201c${shared[0]}\u201d.` });
    } else {
      results.push({ path: p, scope: 'out_of_scope', reason: 'No link to the task.' });
    }
  }
  // keep the original read order
  return filesRead.map((p) => results.find((r) => r.path === p));
}