import { dateKey, daysEndingToday, sampleRecords } from '../patient/model.mjs';
export { dateKey, daysEndingToday };
export const examTypes = [
  { key: 'svv', label: 'SVV', description: '自覚的視性垂直位', fields: [['angle', '偏倚角度（°）', 'number']] },
  { key: 'vhit', label: 'vHIT', description: 'ヘッドインパルス検査', fields: [['leftGain', '左 gain', 'number'], ['rightGain', '右 gain', 'number']] },
  { key: 'okn', label: 'OKN', description: '視運動性眼振', fields: [] },
  { key: 'ett', label: 'ETT / Saccade', description: '追跡・衝動性眼球運動', fields: [] },
  { key: 'goggle', label: '眼振・ゴーグル検査', description: '撮影条件と観察所見', fields: [] }
];
export const examStatuses = { '': '未記録', performed: '実施', unable: '実施できず', notDone: '未実施', notApplicable: '対象外' };
export const safetyLabels = { no: '挙げられた症状の申告なし', yes: '当てはまる症状の申告あり', unsure: '本人には判断できない', unrecorded: '未確認' };
export const clinicalSafetyLabels = { no: '確認時、挙げられた症状なし', yes: '確認時、該当する症状あり', unsure: '判断保留・追加確認が必要' };
export const actionLabels = { emergency: '救急への切替', inPerson: '対面受診への切替', expert: '専門家への連絡', followUp: '経過確認・その他' };
export function newId(prefix = 'B') {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
export function initialWorkspace(now = new Date()) {
  const dates = daysEndingToday(7, now);
  const first = sampleRecords(now).map(r => ({ ...r, id: `a1-${r.id}`, patientId: 'A-001', source: 'sample' }));
  const attack = first.find(r => r.kind === 'attack');
  attack.safety = 'unsure'; attack.videoName = '発作時動画_サンプル.mov'; attack.videoQuality = '自分ではわからない';
  const second = [0, 1, 0, 2].map((score, i) => ({ id: `a2-${i}`, patientId: 'A-002', source: 'sample', kind: 'daily', date: dates[i + 2], score, impact: score === 0 ? 'normal' : 'limited', safety: 'no', updatedAt: `${dates[i+2]}T18:00:00`, note: '' }));
  return {
    revision: 0,
    patients: [
      { id: 'A-001', name: '佐藤 花子', age: '60歳代', source: 'sample', memo: '発作時の経過を確認し、相談の準備へ。' },
      { id: 'A-002', name: '鈴木 太郎', age: '50歳代', source: 'sample', memo: '日常の記録と来院時の状態を確認。' },
      { id: 'A-003', name: '山田 美咲', age: '40歳代', source: 'sample', memo: '記録のない状態も体験できます。' }
    ],
    records: [...first, ...second], reviews: {}, videos: {}, consultations: [], actions: [],
    visits: [{ id: 'sample-visit', patientId: 'A-001', source: 'sample', author: '地域医療者B（サンプル）', occurredAt: `${dates[2]}T10:30`, safety: 'unsure', safetyNote: '症状の経過について追加で確認する、という記録例。', device: '検査機器名の記録例', note: '架空の来院記録です。', createdAt: `${dates[2]}T11:00:00`, tests: { svv: { status: 'performed', angle: '3.2', note: '右偏倚、という入力例。測定条件は要確認。' }, vhit: { status: 'notDone', note: '今回は実施していない、という入力例。' } } }]
  };
}
export function recordVersion(record) {
  return JSON.stringify(Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b))));
}
export function patientRecords(workspace, patientId) {
  return workspace.records.filter(r => r.patientId === patientId && !r.deletedAt).sort((a,b) => b.date.localeCompare(a.date) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
export function reviewStats(workspace, patientId) {
  const records = patientRecords(workspace, patientId);
  const checked = workspace.reviews[patientId]?.versions || {};
  const pending = records.filter(r => checked[r.id] !== recordVersion(r));
  return { records, pending, needsClarification: pending.filter(r => r.safety !== 'no'), videos: records.filter(r => r.videoName) };
}
export function reviewSnapshot(records, author, at = new Date().toISOString()) {
  return { at, author, versions: Object.fromEntries(records.map(r => [r.id, recordVersion(r)])) };
}
export function validateVisit(visit) {
  if (!visit.author?.trim()) return '記録者を入力してください。';
  if (!visit.occurredAt || !Number.isFinite(new Date(visit.occurredAt).getTime())) return '実施日時を入力してください。';
  if (new Date(visit.occurredAt).getTime() > Date.now() + 60000) return '実施日時は現在までの時刻を指定してください。';
  if (!Object.hasOwn(clinicalSafetyLabels, visit.safety)) return '今回の症状確認を「なし・あり・判断保留」から選んでください。';
  if (visit.safety !== 'no' && !visit.safetyNote?.trim()) return '該当する症状、または判断を保留した理由を記録してください。';
  for (const type of examTypes) {
    const test = visit.tests?.[type.key] || {};
    if (!Object.hasOwn(examStatuses, test.status || '')) return `${type.label}の実施状況を確認してください。`;
    if (test.status === 'performed') {
      if (!test.note?.trim() && !type.fields.some(([key]) => String(test[key] ?? '').trim() !== '')) return `${type.label}の測定値または所見を入力してください。`;
      for (const [key] of type.fields) {
        if (String(test[key] ?? '').trim() === '') continue;
        if (!Number.isFinite(Number(test[key])) || (key.toLowerCase().includes('gain') && Number(test[key]) < 0)) return `${type.label}の測定値を数値で確認してください。`;
      }
    }
    if (test.status === 'unable' && !test.note?.trim()) return `${type.label}を実施できなかった理由を入力してください。`;
  }
  return '';
}
export function normalizeVisit(visit) {
  const next = structuredClone(visit);
  next.author = next.author.trim();
  next.tests = Object.fromEntries(examTypes.map(type => {
    const input = next.tests?.[type.key] || {};
    const output = { status: input.status || '', note: input.note || '' };
    if (output.status === 'performed') for (const [key] of type.fields) if (String(input[key] ?? '').trim() !== '') output[key] = input[key];
    return [type.key, output];
  }));
  return next;
}
export function validateAction(action) {
  if (!Object.hasOwn(actionLabels, action.type)) return '対応の種類を選んでください。';
  if (!action.author?.trim()) return '対応者を入力してください。';
  if (!action.at || !Number.isFinite(new Date(action.at).getTime()) || new Date(action.at).getTime() > Date.now() + 60000) return '対応した日時を現在までの時刻で入力してください。';
  if (!action.note?.trim()) return '実際に行った対応を入力してください。';
  if (!['ongoing', 'done'].includes(action.status)) return '対応中・今回の対応完了のいずれかを選んでください。';
  if (action.followUp && !Number.isFinite(new Date(action.followUp).getTime())) return '次回確認の日時を確認してください。';
  return '';
}
export function validateConsultation(consultation) {
  if (!consultation.question?.trim()) return '専門家に確認したいことを入力してください。';
  if (!consultation.author?.trim()) return '担当者を入力してください。';
  if (!consultation.nextAction?.trim()) return '相談までにBで行う対応を入力してください。';
  if (!['routine','soon'].includes(consultation.priority)) return '希望する確認のタイミングを選んでください。';
  if (consultation.desiredDate && (!/^\d{4}-\d{2}-\d{2}$/.test(consultation.desiredDate) || dateKey(new Date(`${consultation.desiredDate}T12:00:00`)) !== consultation.desiredDate)) return '希望日を確認してください。';
  if (consultation.period !== undefined && !['7','30'].includes(String(consultation.period))) return '対象期間を7日または30日から選んでください。';
  return '';
}
export function createConsultation(workspace, patientId, form, period = 7, now = new Date()) {
  const dates = daysEndingToday(period, now);
  const records = patientRecords(workspace, patientId).filter(r => dates.includes(r.date));
  const visits = workspace.visits.filter(v => v.patientId === patientId && dates.includes(v.occurredAt.slice(0,10)));
  const videoReviews = Object.fromEntries(records.filter(r => workspace.videos[r.id]?.version === recordVersion(r)).map(r => [r.id, workspace.videos[r.id]]));
  const actions = workspace.actions.filter(a => a.patientId === patientId && dates.includes(a.at.slice(0,10)));
  return structuredClone({ ...form, id: newId('CONSULT'), patientId, state: 'prepared', createdAt: now.toISOString(), period, periodStart: dates[0], periodEnd: dates.at(-1), records, visits, videoReviews, actions });
}
export function mergeLocalPatient(workspace, localRecords, importedAt = new Date().toISOString()) {
  const id = 'LOCAL-A'; const next = structuredClone(workspace);
  const patient = { id, name: 'この端末の患者記録', age: '本人情報は未登録', source: 'local', memo: '同じブラウザ内から取り込んだ表示用スナップショットです。', importedAt };
  next.patients = [...next.patients.filter(p => p.id !== id), patient];
  next.records = [...next.records.filter(r => r.patientId !== id), ...localRecords.filter(r => r.mode === 'own' && !r.deletedAt).map(r => ({ ...r, id: `local-${r.id}`, originalId: r.id, patientId: id, source: 'local' }))];
  return next;
}
export function consultationText(consultation, patient) {
  const videoQuality = { reviewed: '映像を確認した', unreadable: '判読できず', unreviewed: '未確認' };
  return [
    'めまいノート｜専門家への相談準備（未送信）',
    patient.source === 'sample' ? '【すべて架空のサンプルです】' : '【同じブラウザ内から取り込んだ試作記録です】',
    `患者：${patient.id} ${patient.name}`,
    `準備日時：${consultation.createdAt}`,
    `担当：${consultation.author}`,
    `確認希望：${consultation.priority === 'soon' ? '早めの確認を希望' : '通常'} ${consultation.desiredDate || ''}`,
    `相談したいこと：\n${consultation.question}`,
    `Bでの次の対応：\n${consultation.nextAction}`,
    `対象期間：${consultation.periodStart}〜${consultation.periodEnd}`, '',
    '患者の自己記録：',
    ...consultation.records.map(r => {
      const review = consultation.videoReviews?.[r.id];
      const context = [
        r.startedAt, r.duration, r.sensation, r.trigger, ...(r.symptoms || []),
        r.sleep && `睡眠：${r.sleep}`, r.stress && `ストレス：${r.stress}`, r.rehab,
        r.medicationName, r.medicationDose, r.medicationTime, r.note,
        r.videoName && `動画名：${r.videoName}（動画本体は含みません）`,
        r.videoName && `Bの動画確認：${videoQuality[review?.quality] || '未確認'}`,
        review && `${review.author} ${review.at} ${review.note || ''}`
      ].filter(Boolean).join(' / ');
      return `${r.date} ${r.kind === 'daily' ? '日常' : '発作'} 強さ ${r.score}/10｜${safetyLabels[r.safety] || '未確認'}｜${context}`;
    }), '',
    '来院時の記録：',
    ...consultation.visits.map(v => {
      const tests = examTypes.map(t => {
        const x = v.tests?.[t.key] || {};
        const values = x.status === 'performed' ? t.fields
          .filter(([key]) => String(x[key] ?? '').trim() !== '')
          .map(([key, label]) => `${label} ${x[key]}`).join(' / ') : '';
        return `${t.label}：${examStatuses[x.status || '']} ${values} ${x.note || ''}`;
      }).join('\n');
      return `${v.occurredAt} 記録者：${v.author}｜${clinicalSafetyLabels[v.safety] || '未確認'} ${v.safetyNote || ''}\n${tests}\n機器・条件：${v.device || '未記録'}\n${v.note || ''}`;
    }), '',
    'Bで実際に行った対応：',
    ...(consultation.actions || []).map(a => `${a.at} ${actionLabels[a.type]}｜${a.status === 'ongoing' ? '対応中' : '今回の対応完了'}｜対応者：${a.author}\n${a.note}${a.followUp ? `\n次回確認：${a.followUp}` : ''}`), '',
    'このファイルの作成は、専門家への送信・受領・確認を意味しません。'
  ].join('\n');
}
