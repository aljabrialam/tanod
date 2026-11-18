// Spec 006 — the daily briefing page. Plain words, no rule codes, grouped as
// Needs you / Stopped / You should know / Routine. Every line opens evidence.

import { db } from './db.js';

export async function buildBriefing(wsId, dateKey) {
  const day = dateKey || new Date().toISOString().slice(0, 10);
  const [actions, approvals] = await Promise.all([
    db.select('actions', { workspace_id: wsId }, { order: 'id.desc', limit: 1000 }),
    db.select('approvals', { workspace_id: wsId }, { limit: 1000 }),
  ]);
  const todays = actions.filter((a) => String(a.submitted_at).slice(0, 10) === day);
  const pendingIds = new Set(approvals.filter((p) => p.status === 'pending').map((p) => p.action_id));

  const line = (a, text) => ({
    text: text || a.reason, action_id: a.id, agent: a.agent_name,
    outcome: a.outcome, evidence: a.evidence || [], recommendation: a.recommendation || null,
  });

  const needsYou = todays.filter((a) => pendingIds.has(a.id)).map((a) => line(a));
  const stopped = todays.filter((a) => a.outcome === 'BLOCK').map((a) => line(a));
  const shouldKnow = [];
  for (const a of todays) {
    for (const al of a.alerts || []) {
      if (al.kind === 'scope_creep' || al.kind === 'injection_seen') {
        shouldKnow.push({ text: al.text, action_id: a.id, agent: a.agent_name, outcome: a.outcome, evidence: a.evidence || [] });
      }
    }
    if (a.action_type === 'delete_file' && a.executed && a.outcome === 'ALLOW') {
      shouldKnow.push(line(a, `${a.agent_name} deleted ${(a.payload?.file_path) || 'a file'}. It can be brought back for 30 days from History.`));
    }
  }
  const routine = todays.filter((a) => a.outcome === 'ALLOW' && !shouldKnow.some((s) => s.action_id === a.id));

  const groups = {
    needs_you: needsYou,
    stopped,
    you_should_know: shouldKnow,
    routine: routine.length
      ? [{ text: `${routine.length} routine thing${routine.length === 1 ? '' : 's'} went ahead without needing you.`, action_id: routine[0].id, evidence: [] }]
      : [],
  };
  const total = todays.length;
  const intro = total
    ? `Today your agents did ${total} thing${total === 1 ? '' : 's'}. ${routine.length} ${routine.length === 1 ? 'was' : 'were'} routine.`
    : 'Nothing has happened yet today.';

  const row = { workspace_id: wsId, date: day, lines: { intro, ...groups } };
  const existing = await db.select('briefings', { workspace_id: wsId, date: day }, { limit: 1 });
  if (existing.length) await db.update('briefings', { id: existing[0].id }, { lines: row.lines });
  else await db.insert('briefings', row);
  return row.lines;
}