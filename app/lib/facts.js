// Spec 003 — fact check. Extract every figure, percentage, date, duration and
// reference from outbound text; trace each to a line in a workspace file.
// Deterministic: supported / contradicted (with the real value and file) /
// unsupported.

const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
const STOP = new Set(['the', 'a', 'an', 'at', 'of', 'to', 'by', 'is', 'are', 'was', 'our', 'per', 'and', 'that', 'this', 'when', 'for', 'on', 'in', 'it', 'we', 'you', 'your', 'can', 'be', 'been', 'has', 'have', 'with', 'as', 'so', 'if', 'any']);

const num = (s) => Number(String(s).replace(/,/g, ''));
const words = (s) => String(s).toLowerCase().match(/[a-z]+/g) || [];
const topicWords = (s) => words(s).filter((w) => w.length > 2 && !STOP.has(w));

function contextAt(text, index) {
  return text.slice(Math.max(0, index - 60), index);
}

export function extractClaims(body) {
  const claims = [];
  const text = String(body || '');
  const taken = [];
  const overlaps = (s, e) => taken.some(([a, b]) => s < b && e > a);
  const add = (kind, value, display, index, len, extra = {}) => {
    if (overlaps(index, index + len)) return;
    taken.push([index, index + len]);
    claims.push({ kind, value, text: display, context: contextAt(text, index), ...extra });
  };

  for (const m of text.matchAll(/\b(2026-\d{3})\b/g)) {
    add('reference', m[1], m[1], m.index, m[0].length);
  }
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
    add('percent', num(m[1]), m[0].trim(), m.index, m[0].length);
  }
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS})[a-z]*\\b`, 'gi'))) {
    add('date', `${m[1]} ${m[2]}`, m[0], m.index, m[0].length);
  }
  for (const m of text.matchAll(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+days?\b/gi)) {
    const v = WORD_NUM[m[1].toLowerCase()] ?? num(m[1]);
    add('duration', v, m[0], m.index, m[0].length);
  }
  for (const m of text.matchAll(/\b(\d+)\s+(units?|slides?|pages?|hours?)\b/gi)) {
    add('count', num(m[1]), m[0], m.index, m[0].length, { unit: m[2].toLowerCase() });
  }
  for (const m of text.matchAll(/(?:SGD\s*)?(\d{1,3}(?:,\d{3})+|\d{3,})(?:\.\d+)?/g)) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 8);
    if (new RegExp(`^\\s*(${MONTHS})`, 'i').test(after)) continue; // a date
    const before = text.slice(Math.max(0, m.index - 16), m.index);
    if (new RegExp(`\\d{1,2}\\s+(${MONTHS})[a-z]*\\s+$`, 'i').test(before)) continue; // a year
    if (/-$/.test(before)) continue; // part of a ref
    add('money', num(m[1]), m[0].trim(), m.index, m[0].length);
  }
  return claims;
}

function linesOf(files) {
  const out = [];
  for (const f of files) {
    const body = String(f.content || '').replace(/^---\n[\s\S]*?\n---\n?/, '');
    for (const line of body.split('\n')) {
      if (line.trim()) out.push({ file: f.path, line: line.trim() });
    }
  }
  return out;
}

function overlapScore(context, line) {
  const cw = new Set(topicWords(context));
  return words(line).filter((w) => cw.has(w)).length;
}

function fmtMoney(n) {
  return n.toLocaleString('en-US');
}

// files: [{path, content}] — files_read first, then recipient-related, then rest.
export function checkClaims(body, files) {
  const claims = extractClaims(body);
  const lines = linesOf(files);
  const results = [];

  for (const c of claims) {
    let supported = null;
    let contradicted = null;

    if (c.kind === 'reference') {
      supported = lines.find((l) => l.line.includes(c.value));
    } else if (c.kind === 'percent') {
      const pctRe = /(\d+(?:\.\d+)?)\s*%/g;
      const pctsIn = (line) => [...line.matchAll(pctRe)].map((m) => ({ v: num(m[1]), t: m[0].trim() }));
      const pctLines = lines.filter((l) => pctsIn(l.line).length);
      supported = pctLines.find((l) => pctsIn(l.line).some((p) => p.v === c.value));
      if (!supported) {
        const best = pctLines
          .map((l) => ({ l, s: overlapScore(c.context, l.line) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)[0];
        if (best) {
          const other = pctsIn(best.l.line).find((p) => p.v !== c.value);
          if (other) contradicted = { found: other.t, ...best.l };
        }
      }
    } else if (c.kind === 'duration') {
      const durRe = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+days?\b/gi;
      const dursIn = (line) => [...line.matchAll(durRe)].map((m) => ({ v: WORD_NUM[m[1].toLowerCase()] ?? num(m[1]), t: m[0] }));
      const durLines = lines.filter((l) => dursIn(l.line).length);
      supported = durLines.find((l) => dursIn(l.line).some((d) => d.v === c.value));
      if (!supported) {
        const best = durLines
          .map((l) => ({ l, s: overlapScore(c.context, l.line) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)[0];
        if (best) {
          const other = dursIn(best.l.line).find((d) => d.v !== c.value);
          if (other) contradicted = { found: other.t, ...best.l };
        }
      }
    } else if (c.kind === 'date') {
      const dateRe = new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS})[a-z]*`, 'gi');
      const datesIn = (line) => [...line.matchAll(dateRe)].map((m) => `${m[1]} ${m[2]}`);
      const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').slice(0, 6);
      const dateLines = lines.filter((l) => datesIn(l.line).length);
      supported = dateLines.find((l) => datesIn(l.line).some((d) => norm(d) === norm(c.value)));
      if (!supported) {
        const best = dateLines
          .map((l) => ({ l, s: overlapScore(c.context, l.line) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)[0];
        if (best) {
          const other = datesIn(best.l.line).find((d) => norm(d) !== norm(c.value));
          if (other) contradicted = { found: other, ...best.l };
        }
      }
    } else if (c.kind === 'money') {
      const moneyRe = /(?:SGD\s*)?(\d{1,3}(?:,\d{3})+|\d{3,})(?:\.\d+)?/g;
      const moneyLines = lines.filter((l) => [...l.line.matchAll(moneyRe)].some((m) => num(m[1]) === c.value));
      supported = moneyLines[0];
      if (!supported && /total/i.test(c.context)) {
        const totalRe = /(?:SGD\s*)?(\d{1,3}(?:,\d{3})+|\d{3,})(?:\.\d+)?/;
        const totalLines = lines.filter((l) => /total/i.test(l.line) && totalRe.test(l.line));
        const best = totalLines
          .map((l) => ({ l, s: overlapScore(c.context, l.line) + (/total/i.test(l.line) ? 1 : 0) }))
          .sort((a, b) => b.s - a.s)[0];
        if (best) {
          const m = [...best.l.line.matchAll(moneyRe)].pop();
          contradicted = { found: `total ${fmtMoney(num(m[1]))}`, ...best.l };
        }
      }
    } else if (c.kind === 'count') {
      const re = new RegExp(`\\b(\\d+)\\s+${c.unit}`, 'gi');
      const countsIn = (line) => [...line.matchAll(re)].map((m) => ({ v: num(m[1]), t: m[0] }));
      const countLines = lines.filter((l) => countsIn(l.line).length);
      supported = countLines.find((l) => countsIn(l.line).some((x) => x.v === c.value));
      if (!supported && countLines.length) {
        const best = countLines
          .map((l) => ({ l, s: overlapScore(c.context, l.line) }))
          .sort((a, b) => b.s - a.s)[0];
        const other = countsIn(best.l.line).find((x) => x.v !== c.value);
        if (other) contradicted = { found: other.t, ...best.l };
      }
    }

    if (supported) {
      results.push({ claim: c.text, status: 'supported', found: supported.line, file: supported.file });
    } else if (contradicted) {
      results.push({ claim: c.text, status: 'contradicted', found: contradicted.found, file: contradicted.file, line: contradicted.line });
    } else {
      results.push({ claim: c.text, status: 'unsupported', found: null, file: null });
    }
  }
  return results;
}