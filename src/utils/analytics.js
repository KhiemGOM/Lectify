/* ── analytics.js — pure utility functions for AnalyticsPage ── */

export function makeIdMap(items) {
  const map = {};
  for (const item of items) map[item.id] = item;
  return map;
}

export function filterByDateRange(attempts, range) {
  if (range === 'all') return attempts;
  const days   = range === '7d' ? 7 : 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return attempts.filter(a => new Date(a.attemptedAt) >= cutoff);
}

export function computeSummary(attempts) {
  if (!attempts.length) {
    return { totalAttempts: 0, avgScore: 0, bestScore: 0, avgTimeSeconds: 0 };
  }
  const totalAttempts  = attempts.length;
  const avgScore       = attempts.reduce((s, a) => s + a.scorePercent, 0) / totalAttempts;
  const bestScore      = Math.max(...attempts.map(a => a.scorePercent));
  const avgTimeSeconds = attempts.reduce((s, a) => s + (a.timeTakenSeconds || 0), 0) / totalAttempts;
  return { totalAttempts, avgScore, bestScore, avgTimeSeconds };
}

export function groupByFilePerformance(attempts, filesById) {
  const map = new Map();
  for (const a of attempts) {
    const fid      = a.sourceFileId;
    const fileName = filesById[fid]?.name || 'Unknown';
    const ex       = map.get(fid) || { sourceFileId: fid, fileName, totalScore: 0, attempts: 0 };
    ex.totalScore += a.scorePercent;
    ex.attempts   += 1;
    map.set(fid, ex);
  }
  return Array.from(map.values())
    .map(x => ({ ...x, avgScorePercent: x.totalScore / x.attempts }))
    .sort((a, b) => b.avgScorePercent - a.avgScorePercent);
}

export function formatShortDateLabel(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatTableDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

export function secondsToMMSS(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
