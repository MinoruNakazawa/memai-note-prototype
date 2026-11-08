// These records are prototype-only. Never interpret missing answers as negative findings.
export function dateKey(value = new Date()) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function daysEndingToday(count, now = new Date()) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - count + i + 1);
    return dateKey(d);
  });
}
export const impactLabels = { normal: 'いつもどおり過ごせた', limited: '少し控えて過ごした', help: '支えや手助けが必要だった', rest: 'ほとんど休んでいた' };
export const safetyLabels = { no: '挙げられた症状はない', yes: '当てはまる症状がある', unsure: '自分ではわからない' };
export function validateRecord(draft) {
  if (!['daily', 'attack'].includes(draft.kind)) return '記録の種類を確認してください。';
  if (draft.score === '' || draft.score === null || draft.score === undefined || !Number.isInteger(Number(draft.score)) || Number(draft.score) < 0 || Number(draft.score) > 10) return 'めまいの強さを選んでください。症状がなければ「0 症状なし」を選べます。';
  if (draft.kind === 'daily' && !Object.hasOwn(impactLabels, draft.impact)) return '生活への影響を選んでください。';
  if (!Object.hasOwn(safetyLabels, draft.safety)) return '気になる症状について、「ない・ある・わからない」のいずれかを選んでください。';
  if (draft.startedAt) {
    const start = new Date(draft.startedAt);
    if (!Number.isFinite(start.getTime()) || start.getTime() > Date.now() + 60000) return '発作の開始時刻は、現在までの時刻で入力してください。';
  }
  if (draft.medicationDose && !draft.medicationName?.trim()) return '薬の量を残す場合は、薬の名前も入力してください。';
  return '';
}
export function summarize(records, dates) {
  const selected = records.filter(r => dates.includes(r.date) && !r.deletedAt);
  const dailyByDate = new Map();
  for (const r of selected.filter(r => r.kind === 'daily').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) dailyByDate.set(r.date, r);
  return { selected, dailyByDate, recordedDays: dailyByDate.size, attacks: selected.filter(r => r.kind === 'attack').length };
}
export function csvCell(value) {
  let s = String(value ?? '');
  // Spreadsheet imports must not execute user-entered notes as formulas.
  if (/^[\s]*[=+\-@]/u.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}
export function recordsToCsv(records) {
  const keys = ['日付', '種類', 'めまいの強さ(0–10)', '生活への影響', '安全確認', '開始時刻', '持続', '感じ方', 'きっかけ', '随伴症状', '睡眠', 'ストレス', '薬剤名', '量', '服用時刻', 'リハビリ', '入力者', 'メモ', '動画', '動画品質の自己確認'];
  const rows = records.filter(r => !r.deletedAt).map(r => [r.date, r.kind === 'daily' ? '日常' : '発作', r.score, impactLabels[r.impact] || '未記録', safetyLabels[r.safety] || '未確認', r.startedAt, r.duration, r.sensation, r.trigger, (r.symptoms || []).join('、'), r.sleep, r.stress, r.medicationName, r.medicationDose, r.medicationTime, r.rehab, r.author === 'family' ? '家族・介助者（本人と確認）' : '本人', r.note, r.videoName || 'なし', r.videoQuality || '未確認']);
  return '\uFEFF' + [keys, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
}
export function sampleRecords(now = new Date()) {
  const dates = daysEndingToday(7, now);
  const scores = [4, 3, null, 5, 2, 0, null];
  const result = scores.flatMap((score, i) => score === null ? [] : [{ id: `sample-daily-${dates[i]}`, mode: 'sample', kind: 'daily', date: dates[i], score, impact: score === 0 ? 'normal' : 'limited', safety: 'no', sleep: i === 3 ? 'あまり眠れなかった' : 'ふつう', stress: '少しあった', rehab: '教わった運動を行った', author: 'self', note: i === 5 ? '今日はめまいを感じずに過ごせた。' : '', createdAt: `${dates[i]}T19:00:00`, updatedAt: `${dates[i]}T19:00:00` }]);
  result.push({ id: `sample-attack-${dates[3]}`, mode: 'sample', kind: 'attack', date: dates[3], score: 6, safety: 'no', startedAt: `${dates[3]}T08:30`, duration: '数分', sensation: 'ぐるぐる回る', trigger: '寝返り・頭を動かした', symptoms: ['吐き気'], author: 'self', note: '朝、起きたときに感じた。', createdAt: `${dates[3]}T09:00:00`, updatedAt: `${dates[3]}T09:00:00` });
  return result;
}
