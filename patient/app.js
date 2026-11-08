import { dateKey, daysEndingToday, impactLabels, safetyLabels, validateRecord, summarize, recordsToCsv, sampleRecords } from './model.mjs';
import { allRecords, getVideo, getPreference, setPreference, saveRecord, seedSamples } from './storage.mjs';

const paths = {
 home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
 chart: '<path d="M4 4v16h17M8 15l4-5 4 2 5-7"/>',
 message: '<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 1-6a8 8 0 0 1-1-5 9 9 0 0 1 19 0Z"/><path d="M7 9h9M7 13h6"/>',
 settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>',
 help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17h.01"/>',
 arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
 chevron: '<path d="m9 5 7 7-7 7"/>',
 plus: '<path d="M12 5v14M5 12h14"/>',
 check: '<path d="m5 12 4 4L19 6"/>',
 close: '<path d="m6 6 12 12M6 18 18 6"/>',
 back: '<path d="m14 5-7 7 7 7"/>',
 leaf: '<path d="M19 3C8 3 3 7 5 14c6 6 15 1 14-11ZM4 21l11-11"/>',
 sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
 shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
 alert: '<path d="m12 3 10 18H2Z"/><path d="M12 9v5M12 17h.01"/>',
 note: '<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M3 7h4M3 12h4M3 17h4M10 8h6M10 12h6M10 16h4"/>',
 video: '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
 download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 heart: '<path d="M20 5c-3-3-6-1-8 1C10 4 7 2 4 5-2 11 12 21 12 21S26 11 20 5Z"/>',
 bell: '<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 21h4M12 2v2"/>',
 clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
 print: '<path d="M7 8V3h10v5M7 17H3V8h18v9h-4M7 14h10v7H7Z"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.note}</svg>`;
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { records: [], mode: 'own', view: 'today', period: 7, filter: 'all', settings: {}, flow: null, videoFile: null, videoUrl: null, saving: false, detailId: null, installEvent: null };
const sheet = $('#sheet');
let toastTimer;
let lastFocus;
const fmtDate = (date, weekday = true) => new Date(`${date}T12:00:00`).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', ...(weekday ? { weekday: 'short' } : {}) });
const fmtTime = value => new Date(value).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
const records = () => state.records.filter(r => r.mode === state.mode && !r.deletedAt);
const sortedRecords = () => records().sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
const dailyToday = () => sortedRecords().find(r => r.kind === 'daily' && r.date === dateKey());
const storageNote = () => `<p class="storage-note">${icon('lock')}<span>記録はこの端末のブラウザ内に保存されます。<br>医療者への送信は行われません。</span></p>`;
const sampleBadge = () => state.mode === 'sample' ? '<span class="badge">サンプル</span>' : '';
function toast(message, undo) {
  clearTimeout(toastTimer); const el = $('#toast'); el.replaceChildren(document.createTextNode(message));
  if (undo) { const button = document.createElement('button'); button.textContent = '元に戻す'; button.onclick = () => safe(undo); el.append(button); }
  el.classList.add('show'); toastTimer = setTimeout(() => el.classList.remove('show'), undo ? 12000 : 4500);
}
async function safe(action) {
  try { await action(); } catch (error) {
    console.error('Patient prototype:', error);
    const message = error?.name === 'QuotaExceededError' ? '端末の保存容量が足りません。動画を外すか、空き容量を確認してください。' : '保存・読込ができませんでした。入力内容を確認し、もう一度お試しください。';
    toast(message);
    if (state.flow) showFlowError(message);
  }
}
function currentRoute() { const name = location.hash.slice(1); return ['today', 'history', 'care', 'settings'].includes(name) ? name : 'today'; }
function render() {
  state.view = currentRoute();
  document.documentElement.classList.toggle('large-text', !!state.settings.largeText);
  document.querySelectorAll('[data-nav]').forEach(a => { a.toggleAttribute('aria-current', false); if (a.dataset.nav === state.view) a.setAttribute('aria-current', 'page'); });
  const banner = $('#modeBanner'); banner.hidden = state.mode !== 'sample';
  banner.innerHTML = state.mode === 'sample' ? '<div class="sample-banner"><span>体験モード · すべてサンプルです</span><button data-action="own-mode">自分の記録へ戻る</button></div>' : '';
  $('#main').innerHTML = ({ today: homeView, history: historyView, care: careView, settings: settingsView })[state.view]();
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
}
function weekView() {
  const dates = daysEndingToday(7); const summary = summarize(records(), dates);
  return `<div class="week">${dates.map(date => {
    const r = summary.dailyByDate.get(date); const d = new Date(`${date}T12:00:00`);
    return `<div class="day ${date === dateKey() ? 'current' : ''}" aria-label="${esc(fmtDate(date))} ${r ? r.score === 0 ? '症状なし' : `強さ${r.score}` : '未記録'}"><span>${d.toLocaleDateString('ja-JP', { weekday: 'short' })}</span><span class="day-date">${d.getDate()}</span><span class="day-ball ${!r ? 'missing' : r.score === 0 ? 'clear' : r.score >= 6 ? 'strong' : ''}">${r ? r.score === 0 ? icon('check') : r.score : '–'}</span></div>`;
  }).join('')}</div><div class="legend"><span><i></i>症状なし</span><span><i class="score"></i>数字は強さ</span><span><i class="missing"></i>未記録</span></div>`;
}
function homeView() {
  const today = dailyToday(); const reminder = state.settings.reminder;
  return `<section class="greeting"><div class="date-line">${fmtDate(dateKey())}<span>あなたのペースで</span></div><h1>今日の調子を、<br>ひとことから。</h1><p>元気な日も、つらい日も。少しずつ残そう。</p><svg class="sprout" viewBox="0 0 65 90" aria-hidden="true"><path d="M30 84V39M30 61C6 61 7 37 7 37c22 0 23 24 23 24ZM30 44c0-25 25-25 25-25s0 25-25 25Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="45" cy="8" r="3" fill="#bdcf9d"/></svg></section>
  <section class="daily-card"><div class="card-kicker">${icon(today ? 'check' : 'sun')}<span>${today ? '今日の記録は保存済み' : 'いつもの記録'}</span></div><h2>${today ? today.score === 0 ? '今日は「症状なし」' : `今日のめまいは ${today.score} / 10` : 'きょうは、どんな調子？'}</h2><p>${today ? '残した内容は、あとから直せます。' : 'めまいの強さと、生活のようすを教えてください。'}</p><button class="button lime wide" data-action="daily">${icon(today ? 'note' : 'plus')}${today ? '今日の記録を確認・編集' : hasDraft('daily') ? '途中の記録をつづける' : '今日の記録をつける'}${icon('arrow')}</button></section>
  <button class="attack-card" data-action="attack">${icon('clock')}<span><strong>発作があったとき</strong><small>落ち着いてから。動画はあとでも。</small></span><span class="arrow">${icon('chevron')}</span></button>
  <div class="section-heading"><h2>この1週間の足あと</h2><a href="#history">ふりかえる ${icon('chevron')}</a></div><section class="card">${weekView()}<p class="empty-hint">${summarize(records(), daysEndingToday(7)).recordedDays ? '記録できない日があっても大丈夫。次の記録からつづけましょう。' : '「症状なし」の日も大切な記録。まだ書いていない日は「–」で表示します。'}</p></section>
  <div class="section-heading"><h2>医療者から</h2>${sampleBadge()}</div><button class="message-preview" data-action="care"><span class="avatar">${icon('message')}</span><span><h3>${state.mode === 'sample' ? '次の診察に向けて' : '方針やお知らせを、ここに'}</h3><p>${state.mode === 'sample' ? 'サンプルのメッセージと確認操作を体験できます。' : '実際の医療者とは、まだ接続していません。'}</p></span></button>
  ${reminder ? `<p class="offline-label">${icon('bell')} 記録の目安は ${esc(reminder)} · 端末への通知はありません</p>` : ''}
  ${storageNote()}<button class="emergency-link" data-action="urgent">${icon('alert')}急な症状で困ったとき</button>
  ${state.mode === 'own' ? '<div class="sample-link"><p>使い方を試してみたい方へ</p><button class="text-button" data-action="sample-mode">サンプルを見る →</button></div>' : ''}`;
}
function historyView() {
  const dates = daysEndingToday(state.period); const summary = summarize(records(), dates);
  const filtered = summary.selected.filter(r => state.filter === 'all' || r.kind === state.filter).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  const chartDates = daysEndingToday(7); const chartSummary = summarize(records(), chartDates);
  return `<header class="page-header"><p class="eyebrow">MY JOURNAL</p><h1>ふりかえり</h1><p>日々の変化を、診察で話すきっかけに。</p></header>
  <div class="segmented" aria-label="表示する期間">${[7, 30].map(n => `<button data-action="period" data-value="${n}" aria-pressed="${state.period === n}">直近${n}日</button>`).join('')}</div>
  <section class="card"><div class="stat-row"><div><small>日常記録</small><strong>${summary.recordedDays}</strong><em>/ ${state.period}日</em></div><div><small>症状なし</small><strong>${[...summary.dailyByDate.values()].filter(r => r.score === 0).length}</strong><em>日</em></div><div><small>発作の記録</small><strong>${summary.attacks}</strong><em>件</em></div></div><h3>めまいの強さ <small class="muted">直近7日・日常記録</small></h3><div class="chart" role="img" aria-label="日常記録の強さ。${chartDates.map(d => `${fmtDate(d, false)} ${chartSummary.dailyByDate.has(d) ? chartSummary.dailyByDate.get(d).score : '未記録'}`).join('、')}">${chartDates.map(date => { const r = chartSummary.dailyByDate.get(date); return `<div class="chart-col">${r ? `<span>${r.score}</span><div class="chart-bar ${r.score >= 6 ? 'high' : ''}" style="height:${5 + r.score * 6}px"></div>` : '<span class="chart-empty">–</span>'}<span>${new Date(`${date}T12:00`).getDate()}日</span></div>`; }).join('')}</div><p class="empty-hint">記録から原因や診断は決められません。変化は医療者と一緒に確認しましょう。</p></section>
  <div class="section-heading"><h2>残した記録</h2>${sampleBadge()}</div><div class="segmented" aria-label="記録の種類">${[['all','すべて'],['daily','日常'],['attack','発作']].map(([v,l]) => `<button data-action="filter" data-value="${v}" aria-pressed="${state.filter === v}">${l}</button>`).join('')}</div>
  ${filtered.length ? `<div class="record-list">${filtered.map(r => `<button class="record-item" data-action="detail" data-id="${esc(r.id)}"><span class="record-score">${r.score === 0 ? icon('leaf') : r.score}</span><span><strong>${fmtDate(r.date)} <span class="badge ${r.kind === 'attack' ? 'amber' : ''}">${r.kind === 'attack' ? '発作' : '日常'}</span></strong><small>${r.score === 0 ? '症状なし' : `強さ ${r.score} / 10`}${r.videoName ? ' · 動画あり' : ''}${r.safety !== 'no' ? ' · 症状確認あり' : ''}</small></span>${icon('chevron')}</button>`).join('')}</div>` : `<div class="card empty">${icon('note')}<h2>この期間の記録はありません</h2><p>今日の調子から、少しずつ。</p><button class="button light" data-action="daily">今日の記録をつける</button></div>`}
  <div class="section-heading"><h2>診察に持っていく</h2></div><div class="card"><p class="small muted">表示中の${state.period}日分をまとめます。動画本体は含まれません。</p><div class="stack spacer-top"><button class="button light wide" data-action="report" ${!summary.selected.length ? 'disabled' : ''}>${icon('print')}診察用レポート / PDF</button><button class="button outline wide" data-action="csv" ${!summary.selected.length ? 'disabled' : ''}>${icon('download')}CSVで保存</button></div></div>${storageNote()}`;
}
function careView() {
  const ack = state.settings.sampleAcknowledged;
  return `<header class="page-header"><p class="eyebrow">YOUR CARE</p><h1>医療者から</h1><p>方針を確認して、次の診察につなげる。</p></header>
  ${state.mode === 'sample' ? `<section class="card"><div class="message-head"><span class="avatar">${icon('user')}</span><div><h3>担当医からのお知らせ <span class="badge">サンプル</span></h3><small>動作確認用の架空のメッセージです</small></div></div><div class="message-body">次の診察では、この1週間の記録を一緒に確認しましょう。気になったことがあれば、下のメモに残しておいてください。</div>${ack ? `<p class="checkline">${icon('check')}確認済み · ${esc(new Date(ack).toLocaleString('ja-JP'))}</p>` : '<button class="button wide" data-action="ack">内容を確認しました</button>'}<p class="small muted spacer-top">確認操作はこの端末内の体験です。医療者への通知は行われません。</p></section><section class="card"><h2>リハビリの予定 <span class="badge">サンプル</span></h2><p class="small muted spacer-top">医療者から指示されたメニューや実施状況を確認するための欄です。</p><div class="notice">この試作には、実際の運動指示はありません。教わっている運動がある場合に、日常記録で実施状況を残せます。</div><button class="button light wide" data-action="daily">実施状況を記録する</button></section>` : `<section class="card empty">${icon('message')}<h2>まだお知らせはありません</h2><p>このプロトタイプは医療者と未接続です。<br>サンプルで方針の確認操作を試せます。</p><button class="button light" data-action="sample-mode">サンプルで体験する</button></section>`}
  <section class="card"><h2>次の診察で話したいこと</h2><p class="small muted spacer-top">気になった変化や、聞いておきたいことを。<br>このメモは送信されません。</p><label class="field"><span class="sr-only">次の診察で話したいこと</span><textarea id="questionNote" maxlength="2000" placeholder="例：朝起きたときのふらつきについて聞きたい">${esc(state.settings[`${state.mode}Question`] || '')}</textarea></label><button class="button outline wide" data-action="save-question">メモを保存</button></section>
  <div class="notice warn">このアプリでは、医療者による常時確認や緊急対応は行われません。急な症状は、返信を待たずに相談・受診してください。</div><button class="emergency-link" data-action="urgent">${icon('alert')}急な症状で困ったとき</button>`;
}
function settingsView() {
  return `<header class="page-header"><p class="eyebrow">MAKE IT YOURS</p><h1>設定と使い方</h1><p>自分が使いやすい、ノートに。</p></header>
  <section class="card"><h2>見やすさ</h2><div class="setting-row"><div><strong id="largeLabel">文字を大きくする</strong><p>アプリ全体の文字サイズを変更</p></div><button class="switch" role="switch" aria-labelledby="largeLabel" aria-checked="${!!state.settings.largeText}" data-action="large-text"></button></div></section>
  <section class="card"><h2>記録する時間の目安</h2><p class="small muted spacer-top">無理のない時間を決めておけます。<br>端末への通知機能は、まだありません。</p><label class="field"><span>目安の時刻 <small>任意</small></span><input id="reminderTime" type="time" value="${esc(state.settings.reminder || '')}"></label><button class="button outline wide" data-action="reminder">時刻を保存</button></section>
  <section class="card"><h2>アプリについて</h2><button class="row-button" data-action="install">${icon('plus')}ホーム画面に追加する${icon('chevron')}</button><button class="row-button" data-action="help">${icon('help')}使い方とデータの扱い${icon('chevron')}</button><button class="row-button" data-action="trash">${icon('note')}一覧から外した記録${icon('chevron')}</button><button class="row-button" data-action="${state.mode === 'sample' ? 'own-mode' : 'sample-mode'}">${icon('note')}${state.mode === 'sample' ? '自分の記録へ戻る' : 'サンプルで操作を試す'}${icon('chevron')}</button></section>
  <div class="notice">ここでの記録や動画は、この端末のブラウザ内だけに保存されます。ブラウザのデータ消去や端末の変更では引き継がれません。必要な記録はレポートで保存してください。動画は元のファイルも保管してください。</div><p class="small muted">実際の個人情報を使わずにお試しください。認証・医療者との共有は、本番に向けて今後整備する機能です。</p><p class="version">めまいノート · Patient prototype 1.0<br><a href="/memai-note-prototype/preview.html">プロトタイプ一覧</a></p>`;
}
function openSheet(html) {
  lastFocus = document.activeElement;
  $('#sheetContent').innerHTML = html;
  if (!sheet.open) sheet.showModal();
  sheet.scrollTop = 0;
  const title = $('#sheetTitle'); if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
}
function sheetTop(title) { return `<div class="sheet-top"><p class="eyebrow">めまいノート</p><button class="icon-button" data-action="close" aria-label="閉じる">${icon('close')}</button></div><h1 id="sheetTitle" class="sheet-title">${title}</h1>`; }
function revokeVideo() { if (state.videoUrl) URL.revokeObjectURL(state.videoUrl); state.videoUrl = null; }
function closeSheet() {
  if (state.saving) return;
  if (state.flow) { persistDraft(); toast('入力途中の内容を、このタブに残しました'); }
  state.flow = null; state.videoFile = null; state.detailId = null; revokeVideo(); sheet.close(); render();
  if (lastFocus?.isConnected) lastFocus.focus(); else $('#main').focus({ preventScroll: true });
}
function urgentContent() {
  return `<div class="notice danger"><strong>記録や撮影より、救急への連絡を優先してください。</strong><p>急に、ろれつが回らない、片側の手足に力が入らない、激しい頭痛、支えなしで立てないほどのふらつき等がある場合は、119へ連絡してください。</p></div><a class="button danger wide" href="tel:119">119に電話する</a><p class="small muted spacer-top">上に当てはまらなくても、新しい症状や不安があるときは医療機関に相談してください。このアプリで原因や緊急性は判断できません。</p><p class="small spacer-top"><a href="https://kakarikata.mhlw.go.jp/kakaritsuke/urgency.html" target="_blank" rel="noopener noreferrer">厚生労働省：こんな時は迷わず119へ ↗</a></p>`;
}
function showUrgent() { openSheet(`${sheetTop('急な症状で困ったとき')}${urgentContent()}<div class="flow-footer"><button class="button outline wide" data-action="close">ノートに戻る</button></div>`); }
function showHelp() {
  openSheet(`${sheetTop('自分のペースで、つづける')}<ol class="help-steps"><li><strong>今日の調子を残す</strong><p>症状がない日は「0 症状なし」を選びます。未入力の日とは区別して表示されます。保存後も編集できます。</p></li><li><strong>発作は、落ち着いてから</strong><p>後からの入力でも大丈夫。開始時刻がわからない場合は空欄のままにできます。動画は必須ではありません。</p></li><li><strong>記録をふりかえる</strong><p>診察の前に、記録をレポートやCSVにして持っていけます。記録だけで原因は決められません。</p></li></ol><div class="notice"><strong>このプロトタイプでできること</strong><p>端末内への記録・編集、動画の添付と再生、ふりかえり、レポート保存。体験モードでは架空のお知らせと確認操作も試せます。</p></div><div class="notice warn"><strong>医療者とは未接続です</strong><p>記録やメモの送信、医療者からの返信、端末への通知は行いません。個人情報を含まない試作用の内容でお試しください。</p></div>${storageNote()}<div class="flow-footer"><button class="button wide" data-action="close">はじめる</button></div>`);
}
function showInstall() {
  openSheet(`${sheetTop('ホーム画面から、すぐに')}<p class="sheet-description">対応するスマートフォンでは、アプリのように開けます。</p>${state.installEvent ? '<button class="button wide" data-action="install-now">ホーム画面に追加</button>' : ''}<ol class="help-steps"><li><strong>iPhone / iPad（Safari）</strong><p>共有メニューを開き、「ホーム画面に追加」を選びます。</p></li><li><strong>Android（Chrome）</strong><p>メニューから「アプリをインストール」または「ホーム画面に追加」を選びます。表示は端末により異なります。</p></li></ol><div class="notice">ホーム画面への追加とオフライン起動は、HTTPSでの配信時（開発用のlocalhostを除く）に利用できます。別の端末からMacのHTTPアドレスを開いた場合は、通常のブラウザ表示としてお試しください。</div><button class="button outline wide" data-action="close">閉じる</button>`);
}
function draftKey(kind) { return `memai-note-github-prototype-draft:${state.mode}:${kind}`; }
function hasDraft(kind) { try { return !!sessionStorage.getItem(draftKey(kind)); } catch { return false; } }
function persistDraft() {
  if (!state.flow) return;
  try { sessionStorage.setItem(draftKey(state.flow.draft.kind), JSON.stringify({ draft: state.flow.draft, step: state.flow.step })); } catch { /* Saving the record still uses IndexedDB; drafts are best effort. */ }
}
function clearDraft(kind) { try { sessionStorage.removeItem(draftKey(kind)); } catch { /* Ignore disabled session storage. */ } }
async function openFlow(kind, existing) {
  revokeVideo(); state.videoFile = null; state.detailId = null;
  let pending;
  try { pending = JSON.parse(sessionStorage.getItem(draftKey(kind)) || 'null'); } catch { pending = null; }
  const resume = pending?.draft && (!existing || pending.draft.id === existing.id);
  const draft = resume ? pending.draft : existing ? { ...existing, symptoms: [...(existing.symptoms || [])] } : { kind, score: '', impact: '', safety: '', date: dateKey(), author: 'self', symptoms: [] };
  state.flow = { draft, step: resume ? pending.step || 0 : 0 };
  if (draft.videoName && draft.id) { const video = await getVideo(draft.id); if (video?.file) state.videoUrl = URL.createObjectURL(video.file); }
  renderFlow();
}
function radio(name, value, label, chosen, small = '') {
  return `<label class="chip"><input type="radio" name="${name}" value="${esc(value)}" ${String(chosen) === String(value) ? 'checked' : ''}><span>${small ? `<strong>${label}</strong><small>${small}</small>` : label}</span></label>`;
}
function selectField(name, label, values, selected, optional = true) {
  return `<label class="field"><span>${label}${optional ? ' <small>任意</small>' : ''}</span><select name="${name}"><option value="">選んでください</option>${values.map(v => `<option ${selected === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
}
function scoreFields(d) {
  return `<fieldset><legend>めまいの強さ<span class="required">必須</span></legend><div class="score-reading"><strong id="scoreReading">${d.score === '' ? '–' : esc(d.score)}</strong><span>/ 10</span></div><div class="scores">${Array.from({ length: 11 }, (_, i) => radio('score', i, i === 0 ? '0 症状なし' : String(i), d.score)).join('')}</div><div class="score-caption"><span>0：症状なし</span><span>10：最もつらい</span></div></fieldset>`;
}
function safetyFields(d) {
  return `<fieldset><legend>気になる症状はありますか？<span class="required">必須</span></legend><div class="safety-list"><p>次のような、急に起きた症状について教えてください。</p><ul><li>ろれつが回らない・うまく話せない</li><li>片側の手足に力が入らない</li><li>突然の激しい頭痛</li><li>支えなしで立てないほどのふらつき</li></ul></div><div class="choices">${radio('safety', 'no', '挙げられた症状はない', d.safety)}${radio('safety', 'yes', '当てはまる症状がある', d.safety)}${radio('safety', 'unsure', '自分ではわからない', d.safety)}</div><div id="safetyAdvice" role="status" aria-live="polite" ${!d.safety || d.safety === 'no' ? 'hidden' : ''}>${d.safety === 'yes' ? urgentContent() : '<div class="notice warn">症状が急に出た場合や判断に迷う場合は、記録を続ける前に医療機関へ相談してください。上のような急な症状がある場合は119へ連絡してください。</div>'}</div></fieldset>`;
}
function detailFields(d) {
  return `<details><summary>もう少し残す <span class="muted small">任意</span></summary>${selectField('sensation','どんな感じ？',['ぐるぐる回る','ふわふわ・ふらふらする','くらっとする','うまく表せない'],d.sensation)}${selectField('sleep','昨夜の睡眠',['よく眠れた','ふつう','あまり眠れなかった'],d.sleep)}${selectField('stress','今日のストレス',['あまりなかった','少しあった','強く感じた'],d.stress)}${selectField('rehab','教わったリハビリ',['教わった運動を行った','今日は行わなかった','症状が出て中止した','運動の指示はない'],d.rehab)}<label class="field"><span>薬の名前 <small>任意</small></span><input name="medicationName" maxlength="100" placeholder="薬の袋などを見て入力" value="${esc(d.medicationName)}"></label><div class="two-columns"><label class="field"><span>飲んだ量 <small>任意</small></span><input name="medicationDose" maxlength="50" placeholder="例：1錠" value="${esc(d.medicationDose)}"></label><label class="field"><span>飲んだ時刻 <small>任意</small></span><input type="time" name="medicationTime" value="${esc(d.medicationTime)}"></label></div><label class="field"><span>メモ <small>任意</small></span><textarea name="note" maxlength="2000" placeholder="いつもと違ったこと、気になったことなど">${esc(d.note)}</textarea></label></details>`;
}
function authorFields(d) { return `<details><summary>家族・介助者が入力する場合</summary><label class="check-label"><input type="checkbox" name="family" ${d.author === 'family' ? 'checked' : ''}><span>本人と内容を確認して、代わりに入力しています<small>記録に入力者の区分を残します。端末外への共有権限を付与する機能ではありません。</small></span></label></details>`; }
function videoFields(d) {
  return `<details ${d.videoName ? 'open' : ''}><summary>${icon('video')} 目の動きの動画 <span class="muted small">任意</span></summary><p class="small muted spacer-top">無理に撮らなくて大丈夫。安全を確保し、落ち着いてから。受診や救急への連絡を遅らせないでください。</p><div class="notice"><strong>撮影のめやす</strong><p>明るい場所で、目がはっきり映る距離に。可能なら家族などに撮影を頼んでください。検査のために頭を動かしたり、症状を起こしたりしないでください。</p></div><label class="file-button">${icon('video')} ${d.videoName ? '動画を選び直す' : '動画を撮る・選ぶ'}<input id="videoFile" type="file" accept="video/*" capture="user" aria-label="目の動きの動画を選ぶ"></label><p class="small muted spacer-top">試作では100MBまで。動画はこの端末にのみ保存されます。</p><div id="videoArea">${videoPreview(d)}</div>${selectField('videoQuality','目の写り方の確認',['両目または片目がはっきり映っている','暗い・ぼやけていて見づらい','自分ではわからない'],d.videoQuality)}<p class="quality-label">撮影品質は医療者が確認した結果ではありません。</p></details>`;
}
function videoPreview(d) { return d.videoName ? `<p class="small wrap spacer-top">${esc(d.videoName)}</p>${state.videoUrl ? `<video class="video-preview" src="${state.videoUrl}" controls playsinline preload="metadata"></video>` : '<p class="small muted">動画ファイルは再選択してください（途中保存には動画本体が含まれません）。</p>'}<button type="button" class="text-button" data-action="remove-video">添付を外す</button>` : ''; }
function attackFields(d) {
  return `<div class="notice">わかるところだけで大丈夫。始まった時刻がわからなければ、空欄にできます。</div><label class="field"><span>始まった日時 <small>任意</small></span><input type="datetime-local" name="startedAt" value="${esc(d.startedAt)}"></label><button type="button" class="text-button" data-action="now">現在の日時を入れる</button>${selectField('duration','どれくらい続いた？',['数秒','1分未満','数分','数十分','数時間','まだ続いている','わからない'],d.duration)}${scoreFields(d)}${selectField('sensation','どんな感じ？',['ぐるぐる回る','ふわふわ・ふらふらする','くらっとする','うまく表せない'],d.sensation)}${selectField('trigger','そのとき何をしていた？',['寝返り・頭を動かした','起き上がった・立ち上がった','歩いていた','じっとしていた','その他・わからない'],d.trigger)}<fieldset><legend>一緒に感じたこと <small>任意・複数選べます</small></legend><div class="pill-row">${['吐き気','耳鳴り','聞こえにくさ','頭痛'].map(v => `<label class="chip"><input type="checkbox" name="symptoms" value="${v}" ${(d.symptoms || []).includes(v) ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div></fieldset>${videoFields(d)}<label class="field"><span>メモ <small>任意</small></span><textarea name="note" maxlength="2000" placeholder="そのときのようすを、ひとこと">${esc(d.note)}</textarea></label>${authorFields(d)}`;
}
function renderFlow(error = '') {
  const { draft: d, step } = state.flow; const attack = d.kind === 'attack';
  const title = attack ? ['まず、安全の確認を','発作のようすを残す','この内容で残しますか？'][step] : ['今日の調子を教えてください','気になる症状の確認','この内容で残しますか？'][step];
  let content;
  if (step === 2) content = reviewContent(d);
  else if (attack) content = step === 0 ? safetyFields(d) : attackFields(d);
  else content = step === 0 ? `${scoreFields(d)}<fieldset><legend>生活への影響は？<span class="required">必須</span></legend><div class="choices">${Object.entries(impactLabels).map(([v,l]) => radio('impact',v,l,d.impact)).join('')}</div></fieldset>` : `${safetyFields(d)}${detailFields(d)}${authorFields(d)}`;
  openSheet(`<div class="flow-header"><div><p class="eyebrow">${attack ? '発作の記録' : '今日の記録'} ${sampleBadge()}</p><small class="muted">${fmtDate(d.date)} · ${step + 1} / 3</small></div><button class="icon-button" data-action="close" aria-label="閉じて途中保存">${icon('close')}</button></div><div class="progress" aria-label="3ステップ中${step + 1}">${[0,1,2].map(i => `<span class="${i <= step ? 'active' : ''}"></span>`).join('')}</div><h1 id="sheetTitle" class="sheet-title">${title}</h1><p class="sheet-description">${step === 2 ? '保存後も、ふりかえりから編集できます。' : attack ? '記録は、無理のない範囲で。' : '正確に書こうとしすぎなくて大丈夫。'}</p><form id="recordForm" novalidate>${content}<div id="flowError" class="error" role="alert" ${error ? '' : 'hidden'}>${esc(error)}</div><div class="flow-footer"><button class="button wide" type="submit">${step === 2 ? 'この端末に保存する' : '次へ'}${icon(step === 2 ? 'check' : 'arrow')}</button>${step > 0 ? '<button class="button outline wide" type="button" data-action="previous">前へ戻る</button>' : ''}</div></form><p class="offline-label">医療者への送信は行われません</p>`);
}
function reviewContent(d) {
  const pairs = [['日付',fmtDate(d.date)],['記録の種類',d.kind === 'attack' ? '発作' : '日常'],['めまいの強さ',`${d.score} / 10${Number(d.score) === 0 ? '（症状なし）' : ''}`],['生活への影響',impactLabels[d.impact]],['症状の確認',safetyLabels[d.safety]],['始まった日時',d.startedAt?.replace('T',' ')],['続いた時間',d.duration],['感じ方',d.sensation],['きっかけ',d.trigger],['随伴症状',(d.symptoms || []).join('、')],['睡眠',d.sleep],['ストレス',d.stress],['リハビリ',d.rehab],['服薬',[d.medicationName,d.medicationDose,d.medicationTime].filter(Boolean).join(' / ')],['メモ',d.note],['動画',d.videoName],['動画の写り方',d.videoQuality],['入力者',d.author === 'family' ? '家族・介助者（本人と確認）' : '本人']];
  return `${d.safety === 'yes' ? urgentContent() : d.safety === 'unsure' ? '<div class="notice warn">症状について「わからない」と記録します。気になる変化は医療機関へ相談してください。</div>' : ''}<dl class="review-grid">${pairs.filter(([,v]) => v !== undefined && v !== '').map(([k,v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}
function updateDraft(form = $('#recordForm')) {
  if (!state.flow || !form) return;
  const data = new FormData(form); const d = state.flow.draft;
  for (const element of form.elements) {
    if (!element.name || element.type === 'file' || element.name === 'symptoms' || element.name === 'family') continue;
    d[element.name] = data.get(element.name) ?? '';
  }
  if (form.elements.namedItem('symptoms')) d.symptoms = data.getAll('symptoms');
  if (form.elements.namedItem('family')) d.author = data.has('family') ? 'family' : 'self';
  persistDraft();
}
function showFlowError(message) { const el = $('#flowError'); if (el) { el.textContent = message; el.hidden = false; el.scrollIntoView({ block: 'center' }); } }
async function nextFlow() {
  if (state.saving) return; updateDraft();
  const f = state.flow; const d = f.draft;
  if (f.step === 0) {
    if (d.kind === 'attack' && !d.safety) return showFlowError('気になる症状について、いずれかを選んでください。');
    if (d.kind === 'daily' && (d.score === '' || !d.impact)) return showFlowError('めまいの強さと、生活への影響を選んでください。');
  }
  if (f.step === 1 || f.step === 2) { const message = validateRecord(d); if (message) return showFlowError(message); }
  if (f.step < 2) { if (d.kind === 'attack' && d.startedAt) d.date = d.startedAt.slice(0, 10); f.step++; persistDraft(); renderFlow(); return; }
  state.saving = true; const button = $('#recordForm button[type=submit]'); button.disabled = true; button.textContent = '保存しています…';
  try {
    if (d.videoName && !state.videoFile && !state.videoUrl) throw new Error('Video must be reselected');
    const stamp = new Date().toISOString();
    const generatedId = crypto.randomUUID?.() || `record-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint32Array(3))).join('-')}`;
    const record = { ...d, id: d.id || generatedId, mode: state.mode, score: Number(d.score), createdAt: d.createdAt || stamp, updatedAt: stamp };
    await saveRecord(record, state.videoFile);
    clearDraft(d.kind); state.records = await allRecords(); state.flow = null; state.videoFile = null; revokeVideo();
    openSheet(`${sheetTop('記録できました')}<div class="success"><div class="success-mark">${icon('check')}</div><h1>今日のひとつが、<br>ノートに残りました。</h1><p>${d.kind === 'daily' && Number(d.score) === 0 ? '「症状なし」も、大切な記録です。<br>' : ''}この端末に保存しました。<br>あとからいつでも、ふりかえれます。</p><button class="button wide" data-action="saved-home">今日の画面へ</button><button class="text-button" data-action="saved-history">記録を確認する →</button></div>${storageNote()}`);
    render();
  } catch (error) {
    if (error.message === 'Video must be reselected') showFlowError('動画をもう一度選ぶか、添付を外して保存してください。');
    else throw error;
  } finally { state.saving = false; if (button?.isConnected) { button.disabled = false; button.innerHTML = `この端末に保存する${icon('check')}`; } }
}
async function showDetail(id) {
  const d = records().find(r => r.id === id); if (!d) return;
  state.flow = null; state.detailId = id; revokeVideo();
  if (d.videoName) { const video = await getVideo(id); if (video?.file) state.videoUrl = URL.createObjectURL(video.file); }
  openSheet(`${sheetTop(`${fmtDate(d.date)}の記録`)}<p class="small muted">${d.kind === 'daily' ? '日常の記録' : '発作の記録'} ${sampleBadge()} · この端末に保存済み</p>${reviewContent(d)}${state.videoUrl ? `<video class="video-preview" src="${state.videoUrl}" controls playsinline preload="metadata"></video>` : ''}<div class="flow-footer"><button class="button wide" data-action="edit" data-id="${esc(id)}">内容を編集する</button><button class="button outline wide" data-action="close">閉じる</button><button class="text-button" data-action="delete" data-id="${esc(id)}">この記録を一覧から外す</button></div>`);
}
function showTrash() {
  const removed = state.records.filter(r => r.mode === state.mode && r.deletedAt).sort((a,b) => b.date.localeCompare(a.date));
  openSheet(`${sheetTop('一覧から外した記録')}<p class="sheet-description">ここにある記録は、いつでも一覧に戻せます。${sampleBadge()}</p>${removed.length ? removed.map(r => `<section class="card"><h2>${fmtDate(r.date)} · ${r.kind === 'daily' ? '日常' : '発作'}</h2><p class="small muted">強さ ${r.score} / 10</p><button class="button light wide spacer-top" data-action="restore" data-id="${esc(r.id)}">一覧に戻す</button></section>`).join('') : '<div class="card empty"><p>一覧から外した記録はありません。</p></div>'}<button class="button outline wide" data-action="close">閉じる</button>`);
}
async function setMode(mode) {
  state.mode = mode; await setPreference('mode', mode);
  state.records = await allRecords(); render(); window.scrollTo(0,0);
  toast(mode === 'sample' ? '体験モードです。自分の記録とは分けて保存します。' : '自分の記録に戻りました');
}
function exportRecords() { return summarize(records(), daysEndingToday(state.period)).selected.sort((a,b) => a.date.localeCompare(b.date)); }
function downloadCsv() {
  const blob = new Blob([recordsToCsv(exportRecords())], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `めまいノート${state.mode === 'sample' ? '_サンプル' : ''}_${dateKey()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('CSVを書き出しました。保存先はブラウザで確認してください');
}
function prepareReport() {
  const selected = exportRecords(); if (!selected.length) return;
  openSheet(`${sheetTop('診察用レポート')}<p class="sheet-description">直近${state.period}日分・${selected.length}件 ${sampleBadge()}</p><div class="notice">「印刷・PDFにする」を押すと端末の印刷画面が開きます。PDFで保存できるかは端末によって異なります。印刷先や保存先はご自身で確認してください。</div><p class="small muted">動画本体は含まれません。服薬・メモなどの内容を確認してから、医療者に提示してください。</p><div class="flow-footer"><button class="button wide" data-action="print">${icon('print')}印刷・PDFにする</button><button class="button outline wide" data-action="close">戻る</button></div>`);
  document.querySelector('.report-only')?.remove();
  const report = document.createElement('article'); report.className = 'report-only';
  report.innerHTML = `<h1>めまいノート · 診察用レポート${state.mode === 'sample' ? '（サンプル）' : ''}</h1><p>対象：${fmtDate(daysEndingToday(state.period)[0])}〜${fmtDate(dateKey())} ／ 作成：${esc(new Date().toLocaleString('ja-JP'))}</p><p>本人・家族による自己記録です。診断・医療者の確認結果ではありません。動画本体は別途ご確認ください。</p><table><thead><tr><th>日付・種類</th><th>強さ / 生活</th><th>症状確認</th><th>経過・生活・服薬・メモ</th></tr></thead><tbody>${selected.map(r => `<tr><td>${esc(r.date)}<br>${r.kind === 'daily' ? '日常' : '発作'}<br>${r.author === 'family' ? '家族・介助者入力' : '本人入力'}</td><td>${r.score} / 10<br>${esc(impactLabels[r.impact] || '生活への影響は未記録')}</td><td>${esc(safetyLabels[r.safety] || '未確認')}</td><td>${[r.startedAt && `開始 ${r.startedAt.replace('T',' ')}`, r.duration, r.sensation, r.trigger, ...(r.symptoms || []), r.sleep && `睡眠 ${r.sleep}`, r.stress && `ストレス ${r.stress}`, r.medicationName && `薬 ${r.medicationName} ${r.medicationDose || ''} ${r.medicationTime || ''}`, r.rehab, r.note, r.videoName && `動画 ${r.videoName}`, r.videoQuality].filter(Boolean).map(esc).join('<br>')}</td></tr>`).join('')}</tbody></table><p>診察で話したいこと：${esc(state.settings[`${state.mode}Question`] || '未記入')}</p>`;
  document.body.append(report);
}
async function handleAction(button) {
  const a = button.dataset.action;
  const d = state.flow?.draft;
  switch (a) {
    case 'help': showHelp(); break;
    case 'urgent': showUrgent(); break;
    case 'care': location.hash = 'care'; break;
    case 'daily': await openFlow('daily', dailyToday()); break;
    case 'attack': await openFlow('attack'); break;
    case 'close': closeSheet(); break;
    case 'period': state.period = Number(button.dataset.value); render(); break;
    case 'filter': state.filter = button.dataset.value; render(); break;
    case 'detail': await showDetail(button.dataset.id); break;
    case 'edit': { const r = records().find(item => item.id === button.dataset.id); if (r) await openFlow(r.kind,r); break; }
    case 'previous': updateDraft(); state.flow.step--; persistDraft(); renderFlow(); break;
    case 'now': { const date = new Date(); const local = `${dateKey(date)}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`; $('input[name=startedAt]').value = local; updateDraft(); break; }
    case 'remove-video': d.videoName = ''; d.videoQuality = ''; state.videoFile = null; revokeVideo(); persistDraft(); renderFlow(); break;
    case 'saved-home': closeSheet(); location.hash = 'today'; break;
    case 'saved-history': closeSheet(); location.hash = 'history'; break;
    case 'own-mode': await setMode('own'); break;
    case 'sample-mode': await setMode('sample'); break;
    case 'large-text': state.settings.largeText = !state.settings.largeText; await saveSettings(); render(); break;
    case 'reminder': state.settings.reminder = $('#reminderTime').value; await saveSettings(); toast('記録時刻の目安を保存しました（通知はありません）'); break;
    case 'save-question': state.settings[`${state.mode}Question`] = $('#questionNote').value; await saveSettings(); toast('診察で話したいことを保存しました（未送信）'); break;
    case 'ack': state.settings.sampleAcknowledged = new Date().toISOString(); await saveSettings(); render(); toast('サンプルのお知らせを確認済みにしました'); break;
    case 'install': showInstall(); break;
    case 'install-now': if (state.installEvent) { await state.installEvent.prompt(); await state.installEvent.userChoice; state.installEvent = null; } break;
    case 'csv': downloadCsv(); break;
    case 'report': prepareReport(); break;
    case 'print': window.print(); break;
    case 'delete': {
      const record = records().find(r => r.id === button.dataset.id); if (!record) break;
      await saveRecord({ ...record, deletedAt: new Date().toISOString() }); state.records = await allRecords(); closeSheet();
      toast('記録を一覧から外しました（設定から復元できます）', async () => { await saveRecord({ ...record, deletedAt: null }); state.records = await allRecords(); render(); toast('記録を戻しました'); }); break;
    }
    case 'retry': location.reload(); break;
    case 'trash': showTrash(); break;
    case 'restore': {
      const record = state.records.find(r => r.id === button.dataset.id && r.mode === state.mode && r.deletedAt);
      if (record) { await saveRecord({ ...record, deletedAt: null }); state.records = await allRecords(); showTrash(); render(); toast('記録を一覧に戻しました'); }
      break;
    }
  }
}
async function saveSettings() { await setPreference('settings', state.settings); }
document.addEventListener('click', event => { const button = event.target.closest('[data-action]'); if (button && !button.disabled) { event.preventDefault(); safe(() => handleAction(button)); } });
document.addEventListener('submit', event => { if (event.target.id === 'recordForm') { event.preventDefault(); safe(nextFlow); } });
document.addEventListener('input', event => {
  if (!event.target.closest('#recordForm')) return;
  updateDraft();
  if (event.target.name === 'score') $('#scoreReading').textContent = state.flow.draft.score;
  if (event.target.name === 'safety') {
    const advice = $('#safetyAdvice'); const value = state.flow.draft.safety; advice.hidden = value === 'no';
    advice.innerHTML = value === 'yes' ? urgentContent() : '<div class="notice warn">症状が急に出た場合や判断に迷う場合は、記録を続ける前に医療機関へ相談してください。上のような急な症状がある場合は119へ連絡してください。</div>';
    if (value !== 'no') advice.scrollIntoView({ block: 'nearest' });
  }
});
document.addEventListener('change', event => {
  if (event.target.id !== 'videoFile') return;
  const file = event.target.files?.[0]; if (!file) return;
  if ((!file.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|3gp)$/i.test(file.name)) || file.size > 100 * 1024 * 1024) {
    toast('100MB以下の動画ファイルを選んでください'); event.target.value = ''; return;
  }
  revokeVideo(); state.videoFile = file; state.videoUrl = URL.createObjectURL(file); state.flow.draft.videoName = file.name; state.flow.draft.videoQuality = ''; persistDraft(); $('#videoArea').innerHTML = videoPreview(state.flow.draft);
  const quality = $('select[name=videoQuality]'); if (quality) quality.value = '';
});
sheet.addEventListener('cancel', event => { event.preventDefault(); closeSheet(); });
window.addEventListener('hashchange', () => { render(); window.scrollTo(0,0); $('#main').focus({ preventScroll: true }); });
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.installEvent = event; });
window.addEventListener('pagehide', () => { persistDraft(); });
async function boot() {
  try {
    state.settings = await getPreference('settings') || {};
    state.mode = await getPreference('mode') === 'sample' ? 'sample' : 'own';
    if (!await getPreference('samplesSeeded')) await seedSamples(sampleRecords());
    state.records = await allRecords(); render();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) navigator.serviceWorker.register('/memai-note-prototype/patient-sw.js').catch(() => { /* Online use remains available. */ });
  } catch (error) {
    console.error('Prototype storage unavailable',error);
    $('#main').innerHTML = `<section class="card empty">${icon('lock')}<h1>保存領域を開けませんでした</h1><p>プライベートブラウズなど、端末の設定によって保存できない場合があります。通常のブラウザで開いて、もう一度お試しください。</p><button class="button" data-action="retry">もう一度開く</button></section>`;
  }
}
boot();
