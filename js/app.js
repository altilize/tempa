// UI utama: tab, sheet, dan semua interaksi.

import { state, load, save, replaceState, exportJson, importJson, defaultState, DEFAULT_MODELS } from './store.js';
import * as C from './calc.js';
import { computeXp, levelInfo, earnedBadges, BADGES, milestones } from './game.js';
import { analyzeFoodText, analyzeFoodPhoto, coachReply, testProvider, resizeImage, hasAi, AiError } from './ai.js';
import { weightChart, kcalChart } from './chart.js';
import {
  dateKey, addDays, fmtDate, relDay, fmtNum, fmtKg, fmtRp, fmtRpShort, esc, uid, clamp,
  vibrate, toast, mealByTime, MEALS, timeNow, fmtShortDate,
} from './util.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const ICON = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  log: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  coach: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  sparkle: '<path d="M12 3l1.9 5.6L19.5 10.5 13.9 12.4 12 18l-1.9-5.6L4.5 10.5l5.6-1.9z"/>',
  scale: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 9a4 4 0 0 1 8 0"/><path d="M12 9l1.5-2"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-3-2-6-4-8 0 3-2 4-3 4 0-3-1-6-4-9 0 4-3 7-3 11 0 5 3 9 7 9z"/>',
  drop: '<path d="M12 2.7l5.7 5.7a8 8 0 1 1-11.4 0z"/>',
  run: '<circle cx="13" cy="4" r="2"/><path d="M4 22l5-6 3 2 1-5 4 3h3M9 9l3-2 4 2-1 4"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
};
const icon = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

let tab = 'home';
let prevTab = 'home';
let logDate = dateKey();
let weightRange = 30;
let coachBusy = false;

const view = () => $('#view');

// ---------- Render ----------

function render() {
  document.body.dataset.tab = tab;
  document.body.classList.toggle('onboarding', !state.onboarded);
  $$('.tabbar [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  renderHeader();
  if (!state.onboarded) return renderOnboarding();
  ({ home: renderHome, log: renderLog, coach: renderCoach, progress: renderProgress, settings: renderSettings })[tab]();
  checkCelebrations();
}

function renderHeader() {
  const box = $('#hdr-stats');
  if (!state.onboarded) { box.innerHTML = ''; return; }
  const { xp } = computeXp(state);
  const lv = levelInfo(xp);
  const st = C.streak(state);
  box.innerHTML = `
    <button class="chip chip-streak ${st ? 'hot' : ''}" data-action="goto" data-tab="progress" aria-label="Streak ${st} hari">${icon('flame')}<b>${st}</b></button>
    <button class="chip chip-level" data-action="goto" data-tab="progress" aria-label="Level ${lv.level}">LV <b>${lv.level}</b><i style="--p:${lv.pct}"></i></button>
    <button class="icon-btn" data-action="goto" data-tab="settings" aria-label="Pengaturan">${icon('settings')}</button>`;
}

function verdict(s) {
  const h = new Date().getHours();
  const p = state.profile;
  const y = C.dayStats(state, addDays(s.key, -1));
  if (s.over) return { tone: 'bad', title: `LEWAT ${fmtNum(s.kcal - s.allowance)} KKAL`, text: 'Dapur tutup. Minum air, jalan kaki 30 menit kalau bisa, tidur cepat. Besok balik ke jalur tanpa drama.' };
  if (!s.logged) {
    if (y.over) return { tone: 'warn', title: 'KEMARIN JEBOL', text: `Kemarin lewat ${fmtNum(y.kcal - y.allowance)} kkal. Tebus dengan disiplin hari ini, bukan dengan nggak makan.` };
    if (h >= 10) return { tone: 'warn', title: 'BELUM ADA CATATAN', text: `Udah jam ${h} dan catatan masih kosong. Makan yang nggak dicatat tetap masuk perut. Catat sekarang.` };
    return { tone: 'info', title: 'HARI BARU', text: `Jatah kamu ${fmtNum(s.allowance)} kkal. Catat semuanya, termasuk gorengan dan teh manis.` };
  }
  if (s.price > p.budgetDay) return { tone: 'warn', title: 'DOMPET BOCOR', text: `Uang makan ${fmtRp(s.price)}, lewat budget ${fmtRp(p.budgetDay)}. Sisa hari ini: air putih dan yang ada di rumah.` };
  if (s.remaining < 300 && h < 17) return { tone: 'warn', title: 'REM SEKARANG', text: `Sisa cuma ${fmtNum(s.remaining)} kkal padahal masih jam ${h}. Makan malam nanti protein + sayur saja.` };
  if (h >= 17 && s.protein < s.t.protein * 0.6) return { tone: 'warn', title: 'PROTEIN KURANG', text: `Protein baru ${fmtNum(s.protein)} g dari ${s.t.protein} g. Tambah telur, dada ayam, tahu, atau tempe. Bukan gorengan.` };
  if (h >= 15 && s.water < p.waterGoal / 2) return { tone: 'warn', title: 'KURANG MINUM', text: `Air baru ${fmtNum(s.water)} ml. Sering "lapar" itu sebenarnya haus. Dua gelas sekarang.` };
  return { tone: 'ok', title: 'MASIH DI JALUR', text: `Sisa ${fmtNum(s.remaining)} kkal. Bagus, tapi hari belum selesai. Jangan kasih kendor.` };
}

function ring(s) {
  const R = 84, Cc = 2 * Math.PI * R;
  const pct = s.allowance ? clamp(s.kcal / s.allowance, 0, 1) : 0;
  return `
  <div class="ring ${s.over ? 'over' : ''}">
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <circle class="ring-track" cx="100" cy="100" r="${R}"/>
      <circle class="ring-fill" cx="100" cy="100" r="${R}" stroke-dasharray="${Cc}" stroke-dashoffset="${Cc * (1 - pct)}" transform="rotate(-90 100 100)"/>
    </svg>
    <div class="ring-center">
      <small>${s.over ? 'LEWAT' : 'SISA'}</small>
      <strong class="num">${fmtNum(Math.abs(s.remaining))}</strong>
      <small>kkal</small>
    </div>
  </div>`;
}

function macroBar(label, val, target, cls) {
  const pct = target ? clamp(val / target, 0, 1) * 100 : 0;
  return `<div class="macro ${cls}"><div class="macro-top"><span>${label}</span><span class="num">${fmtNum(val)}<em>/${target} g</em></span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
}

function foodRow(f) {
  const sub = [f.portion, f.price ? fmtRpShort(f.price) : ''].filter(Boolean).join(' · ');
  return `<button class="food-row" data-action="edit-food" data-id="${f.id}">
    <span class="food-name"><b>${esc(f.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
    <span class="num food-kcal">${fmtNum(f.kcal)}</span></button>`;
}

function mealsList(s) {
  if (!s.foods.length) return `<p class="empty">Belum ada makanan tercatat.</p>`;
  return MEALS.map((m) => {
    const items = s.foods.filter((f) => f.meal === m.id);
    if (!items.length) return '';
    const kcal = items.reduce((a, f) => a + f.kcal, 0);
    return `<div class="meal-group"><div class="meal-head"><span>${m.label}</span><span class="num">${fmtNum(kcal)} kkal</span></div>${items.map(foodRow).join('')}</div>`;
  }).join('');
}

function waterCard(s, key) {
  const p = state.profile;
  const n = Math.ceil(p.waterGoal / p.glass);
  const filled = Math.floor(s.water / p.glass);
  const drops = Array.from({ length: n }, (_, i) => `<button class="drop ${i < filled ? 'on' : ''}" data-action="water-set" data-i="${i}" data-date="${key}" aria-label="${(i + 1) * p.glass} ml">${icon('drop')}</button>`).join('');
  return `<section class="card water">
    <div class="card-head"><h3>${icon('drop')} Air</h3><span class="num">${fmtNum(s.water)} / ${fmtNum(p.waterGoal)} ml</span></div>
    <div class="drops">${drops}</div>
    <div class="row-btns"><button class="btn ghost sm" data-action="water-add" data-ml="-${p.glass}" data-date="${key}">− gelas</button><button class="btn sm water-btn" data-action="water-add" data-ml="${p.glass}" data-date="${key}">+ ${p.glass} ml</button></div>
  </section>`;
}

function exerciseCard(s, key) {
  const list = s.ex.map((e) => `<button class="ex-row" data-action="edit-ex" data-id="${e.id}"><span>${esc(e.name)}${e.minutes ? ` <small>${e.minutes} mnt</small>` : ''}${e.steps ? ` <small>${fmtNum(e.steps)} langkah</small>` : ''}</span><span class="num">−${fmtNum(e.kcal)}</span></button>`).join('');
  return `<section class="card">
    <div class="card-head"><h3>${icon('run')} Olahraga</h3><span class="num">${fmtNum(s.exKcal)} kkal</span></div>
    ${list || '<p class="empty sm">Belum gerak hari ini.</p>'}
    ${s.exKcal ? `<p class="hint">+${fmtNum(s.exCredit)} kkal masuk ke jatah makan (${Math.round(state.profile.exerciseCredit * 100)}%).</p>` : ''}
    <button class="btn ghost sm full" data-action="add-ex" data-date="${key}">+ Catat olahraga</button>
  </section>`;
}

function renderHome() {
  const key = dateKey();
  const s = C.dayStats(state, key);
  const v = verdict(s);
  const p = state.profile;
  const kg = C.latestWeight(state);
  const lost = p.startWeight - kg;
  const month = C.monthSpend(state);
  const moneyPct = clamp(s.price / p.budgetDay, 0, 1) * 100;
  view().innerHTML = `
  <section class="verdict ${v.tone}"><div class="verdict-tag">COACH</div><h2>${v.title}</h2><p>${esc(v.text)}</p></section>

  <section class="card hero">
    ${ring(s)}
    <div class="hero-stats">
      <div><small>Makan</small><b class="num">${fmtNum(s.kcal)}</b></div>
      <div><small>Olahraga</small><b class="num">+${fmtNum(s.exCredit)}</b></div>
      <div><small>Jatah</small><b class="num">${fmtNum(s.allowance)}</b></div>
    </div>
    <div class="macros">
      ${macroBar('Protein', s.protein, s.t.protein, 'm-p')}
      ${macroBar('Karbo', s.carbs, s.t.carbs, 'm-c')}
      ${macroBar('Lemak', s.fat, s.t.fat, 'm-f')}
    </div>
  </section>

  <div class="grid2">
    <section class="card money ${s.price > p.budgetDay ? 'bad' : ''}">
      <h3>Uang makan</h3>
      <strong class="num">${fmtRpShort(s.price)}</strong>
      <div class="bar"><i style="width:${moneyPct}%"></i></div>
      <small>dari ${fmtRpShort(p.budgetDay)} · bulan ini ${fmtRpShort(month)}</small>
    </section>
    <section class="card weight-mini" data-action="add-weight" role="button" tabindex="0">
      <h3>Berat</h3>
      <strong class="num">${fmtKg(kg)}<em> kg</em></strong>
      <small class="${lost > 0 ? 'good' : ''}">${lost > 0 ? `▼ ${fmtKg(lost)} kg dari awal` : 'Belum turun. Ayo.'}</small>
      <span class="btn sm full">Timbang</span>
    </section>
  </div>

  ${waterCard(s, key)}
  ${exerciseCard(s, key)}

  <section class="card">
    <div class="card-head"><h3>Makanan hari ini</h3><button class="btn sm" data-action="add-food" data-date="${key}">+ Tambah</button></div>
    ${mealsList(s)}
  </section>`;
}

function renderLog() {
  const s = C.dayStats(state, logDate);
  const isToday = logDate === dateKey();
  view().innerHTML = `
  <div class="date-nav">
    <button class="icon-btn" data-action="log-prev" aria-label="Hari sebelumnya">${icon('left')}</button>
    <div><b>${esc(relDay(logDate))}</b>${relDay(logDate) !== fmtDate(logDate) ? `<small>${fmtDate(logDate)}</small>` : ''}</div>
    <button class="icon-btn" data-action="log-next" aria-label="Hari berikutnya" ${isToday ? 'disabled' : ''}>${icon('right')}</button>
  </div>
  <section class="card day-sum ${s.over ? 'bad' : s.clean ? 'good' : ''}">
    <div><small>Kalori</small><b class="num">${fmtNum(s.kcal)}<em>/${fmtNum(s.allowance)}</em></b></div>
    <div><small>Protein</small><b class="num">${fmtNum(s.protein)}<em> g</em></b></div>
    <div><small>Uang</small><b class="num">${fmtRpShort(s.price)}</b></div>
    <p class="day-badge">${!s.logged ? 'Tidak ada catatan' : s.over ? `▲ Lewat ${fmtNum(s.kcal - s.allowance)} kkal` : s.clean ? '✓ Hari bersih' : 'Terlalu sedikit tercatat'}</p>
  </section>
  <section class="card">
    <div class="card-head"><h3>Makanan</h3><button class="btn sm" data-action="add-food" data-date="${logDate}">+ Tambah</button></div>
    ${mealsList(s)}
  </section>
  ${waterCard(s, logDate)}
  ${exerciseCard(s, logDate)}`;
}

// Markdown minimal untuk balasan coach: tebal, miring, poin, baris baru.
function md(text) {
  const lines = esc(text).split('\n');
  let html = '', inList = false;
  for (const raw of lines) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>');
    const m = line.match(/^\s*(?:[-•]|\d+\.)\s+(.*)/);
    if (m) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${m[1]}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    if (line.trim()) html += `<p>${line}</p>`;
  }
  return html + (inList ? '</ul>' : '');
}

const QUICK = ['Evaluasi hari ini', 'Sisa kalori gue enaknya makan apa?', 'Menu murah besok di bawah budget', 'Rekap minggu ini', 'Lagi pengen banget makan manis'];

function renderCoach() {
  const msgs = state.chat.map((m) => `<div class="msg ${m.role}">${m.role === 'assistant' ? md(m.content) : `<p>${esc(m.content)}</p>`}</div>`).join('');
  view().innerHTML = `
  <div class="coach">
    <div class="msgs" id="msgs">
      ${state.chat.length ? '' : `<div class="msg assistant intro"><p><b>Gue Coach kamu.</b> Gue lihat semua catatan makan, timbangan, dan uangmu. Jangan harap dimanja. Tanya apa saja soal makan, olahraga, atau kalau lagi goyah.</p></div>`}
      ${msgs}
      ${coachBusy ? '<div class="msg assistant typing"><i></i><i></i><i></i></div>' : ''}
    </div>
    <div class="quick">${QUICK.map((q) => `<button class="chip" data-action="coach-quick">${esc(q)}</button>`).join('')}</div>
    <form class="coach-input" id="coach-form">
      ${state.chat.length ? `<button type="button" class="icon-btn" data-action="coach-clear" aria-label="Hapus percakapan">${icon('trash')}</button>` : ''}
      <textarea id="coach-text" rows="1" placeholder="${hasAi() ? 'Tanya Coach...' : 'Isi API key dulu di Pengaturan'}" ${hasAi() ? '' : 'disabled'}></textarea>
      <button class="icon-btn send" aria-label="Kirim" ${coachBusy || !hasAi() ? 'disabled' : ''}>${icon('send')}</button>
    </form>
  </div>`;
  const box = $('#msgs');
  box.scrollTop = box.scrollHeight;
  const ta = $('#coach-text');
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer:fine)').matches) { e.preventDefault(); $('#coach-form').requestSubmit(); } });
  $('#coach-form').addEventListener('submit', (e) => { e.preventDefault(); sendCoach(ta.value); });
}

async function sendCoach(text) {
  text = text.trim();
  if (!text || coachBusy) return;
  state.chat.push({ role: 'user', content: text, ts: Date.now() });
  coachBusy = true;
  save();
  render();
  try {
    const reply = await coachReply(state.chat);
    state.chat.push({ role: 'assistant', content: reply, ts: Date.now() });
  } catch (e) {
    state.chat.push({ role: 'assistant', content: '⚠️ ' + (e instanceof AiError ? e.message : 'Ada error. Coba lagi.'), ts: Date.now(), error: true });
  }
  state.chat = state.chat.slice(-60);
  coachBusy = false;
  save();
  if (tab === 'coach') render();
  else toast('Coach sudah membalas', { action: 'Buka', onAction: () => go('coach') });
}

function renderProgress() {
  const p = state.profile;
  const { xp, parts } = computeXp(state);
  const lv = levelInfo(xp);
  const kg = C.latestWeight(state);
  const b = C.bmi(kg, p.height);
  const [ilo, ihi] = C.idealRange(p.height);
  const t = C.targets(p, kg);
  const e = C.eta(state);
  const st = C.streak(state), best = C.bestStreak(state);
  const earned = new Set(earnedBadges(state).map((x) => x.id));
  const ws = C.sortedWeights(state).slice().reverse();
  const days30 = C.lastNDays(30).map((k) => C.dayStats(state, k)).filter((d) => d.logged);
  const spend30 = days30.reduce((a, d) => a + d.price, 0);
  const kcal30 = days30.reduce((a, d) => a + d.kcal, 0);
  const ms = milestones(state);
  const partLabels = { makan: 'Catat makan', disiplin: 'Hari bersih', budget: 'Hemat', air: 'Air', olahraga: 'Olahraga', timbang: 'Timbang', turun: 'Kg turun', badge: 'Badge' };

  view().innerHTML = `
  <section class="card level-card">
    <div class="lv-badge"><small>LEVEL</small><b class="num">${lv.level}</b></div>
    <div class="lv-info">
      <h2>${lv.rank}</h2>
      <div class="bar xp"><i style="width:${lv.pct * 100}%"></i></div>
      <small class="num">${fmtNum(lv.into)} / ${fmtNum(lv.need)} XP ke level ${lv.level + 1} · total ${fmtNum(xp)}</small>
    </div>
    <details class="xp-detail"><summary>Dari mana XP-nya?</summary>
      <ul>${Object.entries(parts).map(([k, v]) => `<li><span>${partLabels[k]}</span><b class="num">${fmtNum(v)}</b></li>`).join('')}</ul>
      <p class="hint">Catat makan +5 (maks 30/hari) · hari bersih +50 · di bawah budget +20 · target air +15 · olahraga +20 · timbang +20 · tiap kg turun +100 · badge +50</p>
    </details>
  </section>

  <div class="grid2">
    <section class="card stat"><small>Streak disiplin</small><b class="num">${icon('flame')} ${st}</b><small>terbaik ${best} hari</small></section>
    <section class="card stat"><small>${e.done ? 'Target' : 'Perkiraan sampai'}</small><b class="num sm">${e.done ? 'TERCAPAI 🏁' : fmtShortDate(e.date) + ' ' + e.date.slice(0, 4)}</b><small>${e.done ? '' : `${Math.ceil(e.weeks)} minggu · ${e.usingTrend ? 'dari tren nyata' : 'dari rencana'} ${fmtKg(e.perWeek)} kg/mgg`}</small></section>
  </div>

  <section class="card">
    <div class="card-head"><h3>Berat badan</h3><button class="btn sm" data-action="add-weight">Timbang</button></div>
    <div class="seg" role="tablist">
      ${[[30, '30 hari'], [90, '90 hari'], [0, 'Semua']].map(([v, l]) => `<button class="${weightRange === v ? 'on' : ''}" data-action="wrange" data-v="${v}">${l}</button>`).join('')}
    </div>
    <div class="chart" id="wchart"></div>
    <div class="legend"><span><i class="lg-series"></i>BB aktual</span><span><i class="lg-plan"></i>Rencana ${String(p.rate).replace('.', ',')} kg/mgg</span><span><i class="lg-target"></i>Target</span></div>
    <details class="table-detail"><summary>Riwayat timbang (${ws.length})</summary>
      <table><thead><tr><th>Tanggal</th><th>BB</th><th>Selisih</th><th></th></tr></thead><tbody>
      ${ws.map((w, i) => { const prev = ws[i + 1]; const d = prev ? w.kg - prev.kg : 0; return `<tr><td>${fmtShortDate(w.date)} ${w.date.slice(2, 4)}</td><td class="num">${fmtKg(w.kg)}</td><td class="num ${d < 0 ? 'good' : d > 0 ? 'bad' : ''}">${prev ? (d > 0 ? '+' : '') + fmtKg(d) : '·'}</td><td><button class="icon-btn sm" data-action="del-weight" data-date="${w.date}" aria-label="Hapus">${icon('x')}</button></td></tr>`; }).join('')}
      </tbody></table>
    </details>
  </section>

  <section class="card milestones">
    <h3>Milestone</h3>
    <ol class="ms-track">${ms.map((m) => `<li class="${m.done ? 'done' : ''}"><i></i><span class="num">${m.kg}</span></li>`).join('')}</ol>
  </section>

  <section class="card">
    <h3>Kalori 14 hari</h3>
    <div class="chart" id="kchart"></div>
    <div class="legend"><span><i class="lg-ok"></i>Di bawah jatah</span><span><i class="lg-over"></i>Lewat jatah</span><span><i class="lg-tick"></i>Jatah harian</span></div>
  </section>

  <section class="card">
    <h3>Uang makan (30 hari)</h3>
    <div class="kv">
      <div><small>Bulan ini</small><b class="num">${fmtRpShort(C.monthSpend(state))}</b><small>dari ${fmtRpShort(p.budgetMonth)}</small></div>
      <div><small>Rata-rata/hari</small><b class="num">${fmtRpShort(days30.length ? spend30 / days30.length : 0)}</b><small>${days30.length} hari tercatat</small></div>
      <div><small>Per 1000 kkal</small><b class="num">${fmtRpShort(kcal30 ? (spend30 / kcal30) * 1000 : 0)}</b><small>makin kecil makin hemat</small></div>
    </div>
  </section>

  <section class="card">
    <h3>Badge <small class="num">${earned.size}/${BADGES.length}</small></h3>
    <div class="badges">${BADGES.map((x) => `<div class="badge ${earned.has(x.id) ? 'on' : ''}"><span class="b-ico">${earned.has(x.id) ? x.icon : '🔒'}</span><b>${esc(x.name)}</b><small>${esc(x.desc)}</small></div>`).join('')}</div>
  </section>

  <section class="card">
    <h3>Angka tubuh</h3>
    <div class="kv">
      <div><small>BMI</small><b class="num">${b.toFixed(1)}</b><small>${C.bmiClass(b)}</small></div>
      <div><small>BB ideal</small><b class="num">${Math.round(ilo)}–${Math.round(ihi)}</b><small>kg (BMI normal)</small></div>
      <div><small>Devine</small><b class="num">${fmtKg(C.devine(p.height, p.sex))}</b><small>kg</small></div>
      <div><small>BMR</small><b class="num">${fmtNum(t.bmr)}</b><small>kkal</small></div>
      <div><small>TDEE</small><b class="num">${fmtNum(t.tdee)}</b><small>kkal</small></div>
      <div><small>Jatah makan</small><b class="num">${fmtNum(t.kcal)}</b><small>defisit ${fmtNum(t.deficit)}</small></div>
    </div>
    <p class="hint">Jatah dihitung ulang otomatis dari BB terakhir. Batas minimum ${fmtNum(t.floor)} kkal.</p>
  </section>`;
  drawCharts();
}

function drawCharts() {
  const w = $('#wchart'), k = $('#kchart');
  if (w) weightChart(w, state, weightRange);
  if (k) kcalChart(k, state, 14);
}

// ---------- Pengaturan ----------

function field(label, name, value, attrs = '') {
  return `<label class="field"><span>${label}</span><input name="${name}" value="${esc(value)}" ${attrs}></label>`;
}
function select(label, name, value, opts) {
  return `<label class="field"><span>${label}</span><select name="${name}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
}

function profileFields(p) {
  return `
    ${field('Nama panggilan', 'p.name', p.name, 'autocomplete="nickname"')}
    <div class="grid2">
      ${select('Jenis kelamin', 'p.sex', p.sex, [['m', 'Laki-laki'], ['f', 'Perempuan']])}
      ${field('Umur', 'p.age', p.age, 'inputmode="numeric" required')}
      ${field('Tinggi (cm)', 'p.height', p.height, 'inputmode="decimal" required')}
      ${field('BB awal (kg)', 'p.startWeight', p.startWeight, 'inputmode="decimal" required')}
      ${field('Target BB (kg)', 'p.targetWeight', p.targetWeight, 'inputmode="decimal" required')}
      ${select('Turun per minggu', 'p.rate', p.rate, [[0.25, '0,25 kg'], [0.5, '0,5 kg'], [0.75, '0,75 kg'], [1, '1 kg']])}
    </div>
    ${select('Aktivitas harian', 'p.activity', p.activity, C.ACTIVITY.map((a) => [a.v, a.label]))}
    <div class="grid2">
      ${field('Budget makan/hari', 'p.budgetDay', p.budgetDay, 'inputmode="numeric"')}
      ${field('Budget makan/bulan', 'p.budgetMonth', p.budgetMonth, 'inputmode="numeric"')}
      ${field('Target air (ml)', 'p.waterGoal', p.waterGoal, 'inputmode="numeric"')}
      ${select('Kalori olahraga dihitung', 'p.exerciseCredit', p.exerciseCredit, [[0, '0% (paling ketat)'], [0.5, '50%'], [1, '100%']])}
    </div>`;
}

function aiFields(ai) {
  return `
    <div class="howto">
      <p><b>Groq</b> (cepat, untuk chat dan teks): buka <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a>, login pakai Google, tekan <i>Create API Key</i>, salin.</p>
      <p><b>Gemini</b> (jago baca foto): buka <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>, login, tekan <i>Create API key</i>, salin.</p>
      <p class="hint">Key hanya disimpan di HP ini dan tidak ikut di file backup.</p>
    </div>
    <label class="field"><span>Groq API key</span><span class="pw"><input name="ai.groqKey" type="password" value="${esc(ai.groqKey)}" autocomplete="off" spellcheck="false" placeholder="gsk_..."><button type="button" class="btn ghost sm" data-action="test-ai" data-p="groq">Tes</button></span></label>
    <label class="field"><span>Gemini API key</span><span class="pw"><input name="ai.geminiKey" type="password" value="${esc(ai.geminiKey)}" autocomplete="off" spellcheck="false" placeholder="AIza..."><button type="button" class="btn ghost sm" data-action="test-ai" data-p="gemini">Tes</button></span></label>
    <div class="grid2">
      ${select('AI untuk teks & coach', 'ai.textProvider', ai.textProvider, [['groq', 'Groq'], ['gemini', 'Gemini']])}
      ${select('AI untuk foto', 'ai.visionProvider', ai.visionProvider, [['gemini', 'Gemini'], ['groq', 'Groq']])}
    </div>
    <details><summary>Nama model (lanjutan)</summary>
      <p class="hint">Ganti hanya kalau muncul error "model tidak tersedia". Kosongkan untuk kembali ke default.</p>
      ${field('Groq teks', 'ai.groqModel', ai.groqModel, 'spellcheck="false"')}
      ${field('Groq foto', 'ai.groqVisionModel', ai.groqVisionModel, 'spellcheck="false"')}
      ${field('Gemini', 'ai.geminiModel', ai.geminiModel, 'spellcheck="false"')}
    </details>`;
}

function readForm(form) {
  const p = { ...state.profile }, ai = { ...state.ai };
  for (const [k, raw] of new FormData(form)) {
    const [grp, name] = k.split('.');
    const v = String(raw).trim();
    const target = grp === 'p' ? p : ai;
    if (grp === 'p' && !['name', 'sex', 'startDate'].includes(name)) {
      const n = Number(v.replace(/\./g, '').replace(',', '.'));
      // Budget ditulis dengan titik ribuan, angka tubuh boleh pakai koma desimal.
      const n2 = ['height', 'startWeight', 'targetWeight', 'rate', 'activity', 'exerciseCredit'].includes(name) ? Number(v.replace(',', '.')) : n;
      if (Number.isFinite(n2)) target[name] = n2;
    } else if (grp === 'ai' && name.endsWith('Model')) {
      target[name] = v || DEFAULT_MODELS[name];
    } else target[name] = v;
  }
  return { p, ai };
}

function validProfile(p) {
  if (!(p.age >= 12 && p.age <= 100)) return 'Umur tidak valid';
  if (!(p.height >= 120 && p.height <= 230)) return 'Tinggi badan tidak valid';
  if (!(p.startWeight >= 30 && p.startWeight <= 300)) return 'BB awal tidak valid';
  if (!(p.targetWeight >= 30 && p.targetWeight < p.startWeight)) return 'Target BB harus lebih kecil dari BB awal';
  return '';
}

let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (tab === 'settings') render(); });

function renderSettings() {
  view().innerHTML = `
  <div class="page-head"><button class="icon-btn" data-action="back" aria-label="Kembali">${icon('back')}</button><h2>Pengaturan</h2></div>
  <form id="settings-form" class="card form">
    <h3>Profil & target</h3>
    ${profileFields(state.profile)}
    <h3>AI</h3>
    ${aiFields(state.ai)}
    <button class="btn full">Simpan</button>
  </form>
  ${installEvt ? `<section class="card"><h3>Install</h3><p class="hint">Pasang Tempa di layar utama supaya terasa seperti aplikasi biasa.</p><button class="btn full" data-action="install">Install aplikasi</button></section>` : ''}
  <section class="card">
    <h3>Data</h3>
    <p class="hint">Semua data tersimpan di HP ini saja. Rutin export backup, misalnya seminggu sekali, lalu simpan di Google Drive.</p>
    <div class="row-btns"><button class="btn ghost" data-action="export">Export backup</button><label class="btn ghost">Import<input type="file" accept="application/json,.json" id="import-file" hidden></label></div>
    <button class="btn danger ghost full" data-action="reset">Hapus semua data</button>
  </section>
  <p class="foot">Tempa v1 · rumus Mifflin-St Jeor · MET Compendium</p>`;
  $('#settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const { p, ai } = readForm(e.target);
    const err = validProfile(p);
    if (err) return toast(err, { kind: 'bad' });
    state.profile = p;
    state.ai = ai;
    save();
    vibrate();
    toast('Tersimpan. Jatah harian dihitung ulang.');
    render();
  });
  $('#import-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { importJson(await f.text()); toast('Backup berhasil dipulihkan'); render(); } catch (err) { toast(err.message || 'File tidak valid', { kind: 'bad' }); }
  });
}

// ---------- Onboarding ----------

function renderOnboarding() {
  const p = state.profile;
  view().innerHTML = `
  <section class="onboard">
    <h1>TEMPA</h1>
    <p class="lead">Badan ditempa, bukan ditunggu. Cek data di bawah, ini dasar semua hitungan.</p>
    <form id="ob-form" class="card form">
      ${profileFields(p)}
      <div class="preview" id="ob-preview"></div>
      <h3>AI (bisa diisi nanti)</h3>
      ${aiFields(state.ai)}
      <button class="btn full big">Mulai</button>
    </form>
  </section>`;
  const form = $('#ob-form');
  const upd = () => {
    const { p: np } = readForm(form);
    const err = validProfile(np);
    if (err) { $('#ob-preview').innerHTML = `<p class="bad">${err}</p>`; return; }
    const t = C.targets(np, np.startWeight);
    const b = C.bmi(np.startWeight, np.height);
    const weeks = (np.startWeight - np.targetWeight) / np.rate;
    $('#ob-preview').innerHTML = `
      <div class="kv">
        <div><small>BMI</small><b class="num">${b.toFixed(1)}</b><small>${C.bmiClass(b)}</small></div>
        <div><small>TDEE</small><b class="num">${fmtNum(t.tdee)}</b><small>kkal</small></div>
        <div><small>Jatah makan</small><b class="num">${fmtNum(t.kcal)}</b><small>kkal/hari</small></div>
        <div><small>Protein</small><b class="num">${t.protein}</b><small>g/hari</small></div>
        <div><small>Estimasi</small><b class="num">${Math.ceil(weeks)}</b><small>minggu</small></div>
        <div><small>Air</small><b class="num">${fmtNum(np.waterGoal)}</b><small>ml/hari</small></div>
      </div>`;
  };
  form.addEventListener('input', upd);
  upd();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { p: np, ai } = readForm(form);
    const err = validProfile(np);
    if (err) return toast(err, { kind: 'bad' });
    np.startDate = dateKey();
    state.profile = np;
    state.ai = ai;
    state.weights = [{ date: np.startDate, kg: np.startWeight }];
    state.onboarded = true;
    state.seen = { level: levelInfo(computeXp(state).xp).level, badges: earnedBadges(state).map((b) => b.id) };
    save();
    tab = 'home';
    render();
    toast(`Jatah kamu ${fmtNum(C.targets(np, np.startWeight).kcal)} kkal/hari. Mulai sekarang.`);
  });
}

// ---------- Sheet (bottom sheet) ----------

let sheetOpen = false;
let sheetAbort = null;

function openSheet(html, mount) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  root.classList.add('open');
  if (!sheetOpen) { history.pushState({ sheet: true }, ''); sheetOpen = true; }
  const sheet = $('.sheet', root);
  root.onclick = (e) => { if (e.target.closest('[data-close]')) closeSheet(); };
  mount?.(sheet);
}

function closeSheet() {
  if (sheetOpen) history.back();
}

function teardownSheet() {
  sheetOpen = false;
  sheetAbort?.abort();
  sheetAbort = null;
  const root = $('#sheet-root');
  root.classList.remove('open');
  root.innerHTML = '';
}

window.addEventListener('popstate', () => {
  if (sheetOpen) { teardownSheet(); return; }
  if (tab === 'settings') { tab = prevTab; render(); }
});

const sheetHead = (title) => `<div class="sheet-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="Tutup">${icon('x')}</button></div>`;

function mealChips(meal) {
  return `<div class="chips" id="meal-chips">${MEALS.map((m) => `<button type="button" class="chip ${m.id === meal ? 'on' : ''}" data-meal="${m.id}">${m.label}</button>`).join('')}</div>`;
}

function bindMealChips(sheet, onPick) {
  $$('#meal-chips .chip', sheet).forEach((b) => b.addEventListener('click', () => {
    $$('#meal-chips .chip', sheet).forEach((x) => x.classList.toggle('on', x === b));
    onPick(b.dataset.meal);
  }));
}

function frequentFoods() {
  const m = new Map();
  for (const f of state.foods) {
    const k = f.name.toLowerCase().trim();
    const e = m.get(k);
    if (e) { e.count++; if (f.date >= e.f.date) e.f = f; } else m.set(k, { count: 1, f });
  }
  return [...m.values()].sort((a, b) => b.count - a.count || (b.f.date > a.f.date ? 1 : -1)).slice(0, 40);
}

function sheetAddFood(date, startMode) {
  const ctx = {
    date,
    meal: date === dateKey() ? mealByTime() : 'siang',
    mode: startMode || (hasAi() ? 'text' : state.foods.length ? 'recent' : 'manual'),
    text: '', caption: '', photo: null, busy: false, error: '', search: '',
  };
  draw();

  function draw() {
    const modes = [['text', 'Ketik'], ['photo', 'Foto'], ['recent', 'Sering'], ['manual', 'Manual']];
    let body = '';
    if (ctx.mode === 'text') {
      body = `<textarea id="f-text" rows="4" placeholder="Contoh: nasi padang rendang + sayur nangka + es teh manis, 28rb" ${ctx.busy ? 'disabled' : ''}>${esc(ctx.text)}</textarea>
        <p class="hint">Tulis bebas seperti cerita. Sebut harga kalau ada, AI akan hitung kalori dan uangnya.</p>
        ${aiButton('Hitung kalori')}`;
    } else if (ctx.mode === 'photo') {
      body = `${ctx.photo ? `<img class="photo-prev" src="${ctx.photo}" alt="Foto makanan">` : `<div class="photo-pick">
          <label class="btn big">${icon('camera')} Kamera<input type="file" accept="image/*" capture="environment" id="f-cam" hidden></label>
          <label class="btn ghost big">${icon('image')} Galeri<input type="file" accept="image/*" id="f-gal" hidden></label></div>`}
        <input id="f-caption" placeholder="Catatan opsional: harga 25rb, nasinya setengah" value="${esc(ctx.caption)}" ${ctx.busy ? 'disabled' : ''}>
        ${ctx.photo ? `<div class="row-btns"><button type="button" class="btn ghost" data-act="retake">Ganti foto</button>${aiButton('Analisis foto')}</div>` : ''}`;
    } else if (ctx.mode === 'recent') {
      const list = frequentFoods().filter((x) => !ctx.search || x.f.name.toLowerCase().includes(ctx.search.toLowerCase()));
      body = `<input id="f-search" placeholder="Cari..." value="${esc(ctx.search)}">
        <div class="recent">${list.length ? list.map((x) => `<button type="button" class="food-row" data-act="quick" data-id="${x.f.id}">
          <span class="food-name"><b>${esc(x.f.name)}</b><small>${esc([x.f.portion, x.f.price ? fmtRpShort(x.f.price) : '', x.count + 'x'].filter(Boolean).join(' · '))}</small></span>
          <span class="num food-kcal">${fmtNum(x.f.kcal)}</span></button>`).join('') : '<p class="empty">Belum ada riwayat. Makanan yang pernah dicatat akan muncul di sini, tinggal tap sekali.</p>'}</div>`;
    } else {
      body = foodForm({ name: '', portion: '', kcal: '', protein: '', carbs: '', fat: '', price: '' });
    }
    openSheet(`${sheetHead(`Tambah makanan <small>${esc(relDay(date))}</small>`)}
      ${mealChips(ctx.meal)}
      <div class="seg">${modes.map(([m, l]) => `<button type="button" class="${ctx.mode === m ? 'on' : ''}" data-mode="${m}">${l}</button>`).join('')}</div>
      ${ctx.error ? `<div class="err">${esc(ctx.error)}<button type="button" class="btn ghost sm" data-mode="manual">Isi manual</button></div>` : ''}
      <div class="sheet-body">${body}</div>`, mount);
  }

  function aiButton(label) {
    if (!hasAi()) return `<p class="err">API key belum diisi. <button type="button" class="btn ghost sm" data-act="to-settings">Buka Pengaturan</button></p>`;
    return `<button type="button" class="btn full ai-btn ${ctx.busy ? 'loading' : ''}" data-act="analyze" ${ctx.busy ? 'disabled' : ''}>${icon('sparkle')} ${ctx.busy ? 'Coach lagi ngitung...' : label}</button>`;
  }

  async function analyze() {
    if (ctx.mode === 'text' && !ctx.text.trim()) return toast('Tulis dulu makanannya');
    ctx.busy = true; ctx.error = ''; draw();
    sheetAbort = new AbortController();
    try {
      const res = ctx.mode === 'photo'
        ? await analyzeFoodPhoto(ctx.photo, ctx.caption, { signal: sheetAbort.signal })
        : await analyzeFoodText(ctx.text, { signal: sheetAbort.signal });
      if (!sheetOpen) return;
      if (!res.items.length) { ctx.busy = false; ctx.error = res.comment || 'AI tidak menemukan makanan.'; return draw(); }
      sheetReview({ ...res, date, meal: ctx.meal, src: ctx.mode === 'photo' ? 'photo' : 'ai' });
    } catch (e) {
      if (e.name === 'AbortError') return;
      ctx.busy = false;
      ctx.error = e instanceof AiError ? e.message : 'Gagal menganalisis. Coba lagi.';
      if (sheetOpen) draw();
    }
  }

  async function onFile(file) {
    if (!file) return;
    try { ctx.photo = await resizeImage(file); draw(); } catch (e) { toast(e.message, { kind: 'bad' }); }
  }

  function mount(sheet) {
    bindMealChips(sheet, (m) => { ctx.meal = m; });
    $$('[data-mode]', sheet).forEach((b) => b.addEventListener('click', () => { ctx.mode = b.dataset.mode; ctx.error = ''; draw(); }));
    $('#f-text', sheet)?.addEventListener('input', (e) => { ctx.text = e.target.value; });
    $('#f-caption', sheet)?.addEventListener('input', (e) => { ctx.caption = e.target.value; });
    $('#f-search', sheet)?.addEventListener('input', (e) => {
      ctx.search = e.target.value;
      const pos = e.target.selectionStart;
      draw();
      const s = $('#f-search'); s.focus(); s.setSelectionRange(pos, pos);
    });
    $('#f-cam', sheet)?.addEventListener('change', (e) => onFile(e.target.files[0]));
    $('#f-gal', sheet)?.addEventListener('change', (e) => onFile(e.target.files[0]));
    sheet.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'analyze') analyze();
      if (a.dataset.act === 'retake') { ctx.photo = null; draw(); }
      if (a.dataset.act === 'to-settings') { closeSheet(); setTimeout(() => go('settings'), 50); }
      if (a.dataset.act === 'quick') {
        const src = state.foods.find((f) => f.id === a.dataset.id);
        const entry = { ...src, id: uid(), date, time: timeNow(), meal: ctx.meal, src: 'recent' };
        state.foods.push(entry);
        afterFoodSaved([entry]);
      }
    });
    if (ctx.mode === 'manual') bindFoodForm(sheet, (vals) => {
      const entry = { ...vals, id: uid(), date, time: timeNow(), meal: ctx.meal, src: 'manual' };
      state.foods.push(entry);
      afterFoodSaved([entry]);
    });
    if (ctx.mode === 'text' && !ctx.busy) $('#f-text', sheet)?.focus();
  }
}

function afterFoodSaved(entries) {
  save();
  closeSheet();
  vibrate(20);
  const s = C.dayStats(state, entries[0].date);
  const kcal = entries.reduce((a, f) => a + f.kcal, 0);
  const undo = () => {
    const ids = new Set(entries.map((x) => x.id));
    state.foods = state.foods.filter((f) => !ids.has(f.id));
    save(); render();
  };
  if (s.over) toast(`+${fmtNum(kcal)} kkal. Lewat jatah ${fmtNum(s.kcal - s.allowance)} kkal!`, { kind: 'bad', action: 'Batal', onAction: undo, duration: 5000 });
  else toast(`+${fmtNum(kcal)} kkal tercatat · sisa ${fmtNum(s.remaining)}`, { action: 'Batal', onAction: undo, duration: 4500 });
  render();
}

function foodForm(f) {
  return `<form id="food-form" class="form">
    ${field('Nama makanan', 'name', f.name, 'required')}
    ${field('Porsi', 'portion', f.portion, 'placeholder="1 piring, 2 potong, dst"')}
    <div class="grid2">
      ${field('Kalori (kkal)', 'kcal', f.kcal, 'inputmode="numeric" required')}
      ${field('Harga (Rp)', 'price', f.price, 'inputmode="numeric"')}
    </div>
    <div class="grid3">
      ${field('Protein g', 'protein', f.protein, 'inputmode="numeric"')}
      ${field('Karbo g', 'carbs', f.carbs, 'inputmode="numeric"')}
      ${field('Lemak g', 'fat', f.fat, 'inputmode="numeric"')}
    </div>
    <button class="btn full">Simpan</button>
  </form>`;
}

const toInt = (v) => Math.max(0, Math.round(Number(String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0));

function bindFoodForm(sheet, onSave) {
  $('#food-form', sheet).addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    onSave({
      name: d.name.trim(), portion: d.portion.trim(), kcal: toInt(d.kcal), price: toInt(d.price),
      protein: toInt(d.protein), carbs: toInt(d.carbs), fat: toInt(d.fat),
    });
  });
}

function sheetReview(res) {
  const items = res.items.map((it) => ({ ...it, _base: { ...it } }));
  let meal = res.meal;
  draw();

  function draw() {
    const tk = items.reduce((a, i) => a + i.kcal, 0);
    const tp = items.reduce((a, i) => a + i.price, 0);
    const after = C.dayStats(state, res.date).remaining - tk;
    openSheet(`${sheetHead('Cek dulu')}
      ${mealChips(meal)}
      ${res.comment ? `<div class="coach-say ${after < 0 ? 'bad' : ''}"><b>COACH</b><p>${esc(res.comment)}</p></div>` : ''}
      <div class="sheet-body">
        <div class="review">${items.map((it, i) => `
          <div class="rv-item" data-i="${i}">
            <div class="rv-top"><input class="rv-name" data-k="name" value="${esc(it.name)}" aria-label="Nama"><button type="button" class="icon-btn sm" data-del="${i}" aria-label="Hapus item">${icon('x')}</button></div>
            <small class="rv-portion">${esc(it.portion)} · P ${it.protein} · K ${it.carbs} · L ${it.fat} g</small>
            <div class="rv-nums">
              <label><input data-k="kcal" inputmode="numeric" value="${it.kcal}"><span>kkal</span></label>
              <label><span>Rp</span><input data-k="price" inputmode="numeric" value="${it.price}"></label>
            </div>
          </div>`).join('')}
        </div>
        <div class="rv-total"><span>Total</span><b class="num">${fmtNum(tk)} kkal</b><b class="num">${fmtRp(tp)}</b></div>
        <p class="hint ${after < 0 ? 'bad' : ''}">${after < 0 ? `Setelah ini kamu lewat jatah ${fmtNum(-after)} kkal.` : `Setelah ini sisa ${fmtNum(after)} kkal.`}</p>
        <button type="button" class="btn full big" data-save ${items.length ? '' : 'disabled'}>Simpan</button>
      </div>`, mount);
  }

  function mount(sheet) {
    bindMealChips(sheet, (m) => { meal = m; });
    $$('.rv-item input', sheet).forEach((inp) => inp.addEventListener('change', () => {
      const it = items[inp.closest('.rv-item').dataset.i];
      const k = inp.dataset.k;
      if (k === 'name') { it.name = inp.value.trim() || it.name; return; }
      it[k] = toInt(inp.value);
      // Kalau kalori diubah, makro ikut diskalakan supaya tetap konsisten.
      if (k === 'kcal' && it._base.kcal) {
        const r = it.kcal / it._base.kcal;
        it.protein = Math.round(it._base.protein * r);
        it.carbs = Math.round(it._base.carbs * r);
        it.fat = Math.round(it._base.fat * r);
      }
      draw();
    }));
    $$('[data-del]', sheet).forEach((b) => b.addEventListener('click', () => { items.splice(Number(b.dataset.del), 1); draw(); }));
    $('[data-save]', sheet).addEventListener('click', () => {
      const time = timeNow();
      const entries = items.map(({ _base, ...it }) => ({ ...it, id: uid(), date: res.date, time, meal, src: res.src }));
      state.foods.push(...entries);
      afterFoodSaved(entries);
    });
  }
}

function sheetEditFood(id) {
  const f = state.foods.find((x) => x.id === id);
  if (!f) return;
  let meal = f.meal;
  openSheet(`${sheetHead('Edit makanan')}${mealChips(meal)}<div class="sheet-body">${foodForm(f)}
    <button type="button" class="btn danger ghost full" data-delete>${icon('trash')} Hapus</button></div>`, (sheet) => {
    bindMealChips(sheet, (m) => { meal = m; });
    bindFoodForm(sheet, (vals) => { Object.assign(f, vals, { meal }); save(); closeSheet(); render(); toast('Diperbarui'); });
    $('[data-delete]', sheet).addEventListener('click', () => {
      const idx = state.foods.indexOf(f);
      state.foods.splice(idx, 1);
      save(); closeSheet(); render();
      toast(`${f.name} dihapus`, { action: 'Batal', onAction: () => { state.foods.splice(idx, 0, f); save(); render(); } });
    });
  });
}

function sheetWeight() {
  const today = dateKey();
  let kg = C.latestWeight(state);
  let date = today;
  openSheet(`${sheetHead('Timbang')}
    <div class="sheet-body">
      <p class="hint">Timbang pagi setelah bangun dan ke toilet, sebelum makan. Konsisten itu kuncinya.</p>
      <div class="stepper">
        <button type="button" class="icon-btn big" data-step="-0.1" aria-label="Kurangi">−</button>
        <input id="w-kg" class="num" inputmode="decimal" value="${fmtKg(kg)}" aria-label="Berat (kg)">
        <button type="button" class="icon-btn big" data-step="0.1" aria-label="Tambah">+</button>
      </div>
      <label class="field"><span>Tanggal</span><input type="date" id="w-date" value="${date}" max="${today}"></label>
      <button type="button" class="btn full big" data-save>Simpan</button>
    </div>`, (sheet) => {
    const inp = $('#w-kg', sheet);
    const read = () => Number(inp.value.replace(',', '.'));
    $$('[data-step]', sheet).forEach((b) => b.addEventListener('click', () => { kg = Math.round((read() + Number(b.dataset.step)) * 10) / 10; inp.value = fmtKg(kg); vibrate(5); }));
    $('#w-date', sheet).addEventListener('change', (e) => { date = e.target.value || today; });
    $('[data-save]', sheet).addEventListener('click', () => {
      kg = Math.round(read() * 10) / 10;
      if (!(kg >= 30 && kg <= 300)) return toast('Berat tidak valid', { kind: 'bad' });
      const prevW = C.weightOn(state, addDays(date, -1));
      const prevBest = Math.min(...state.weights.map((w) => w.kg));
      state.weights = state.weights.filter((w) => w.date !== date);
      state.weights.push({ date, kg });
      save(); closeSheet(); render(); vibrate(20);
      const d = kg - prevW;
      if (kg < prevBest && Math.floor(prevBest) > Math.floor(kg)) confetti();
      if (d < -0.05) toast(`Turun ${fmtKg(-d)} kg. Bagus. Jangan puas dulu.`, { kind: 'good' });
      else if (d > 0.05) toast(`Naik ${fmtKg(d)} kg. Bisa air atau garam, tapi cek lagi catatan makanmu.`, { kind: 'bad', duration: 5000 });
      else toast('Stabil. Pertahankan defisit, timbangan akan nyusul.');
    });
  });
}

function sheetExercise(date, editId) {
  const kg = C.weightOn(state, date);
  const existing = editId ? state.exercises.find((e) => e.id === editId) : null;
  const ctx = { type: existing?.type || 'jalan_cepat', minutes: existing?.minutes || 30, steps: existing?.steps || 5000, kcal: existing?.kcal || 0, name: existing?.name || '' };
  draw();

  function calc() {
    if (ctx.type === 'steps') return C.stepsKcal(ctx.steps, kg);
    if (ctx.type === 'custom') return ctx.kcal;
    const x = C.EXERCISES.find((e) => e.id === ctx.type);
    return C.exerciseKcal(x.met, kg, ctx.minutes);
  }

  function draw() {
    const opts = [...C.EXERCISES.map((e) => [e.id, e.label]), ['steps', 'Langkah (dari Samsung Health)'], ['custom', 'Lainnya (isi kalori sendiri)']];
    let inputs = '';
    if (ctx.type === 'steps') inputs = field('Jumlah langkah', 'steps', ctx.steps, 'inputmode="numeric"');
    else if (ctx.type === 'custom') inputs = `<div class="grid2">${field('Nama aktivitas', 'name', ctx.name)}${field('Kalori terbakar', 'kcal', ctx.kcal, 'inputmode="numeric"')}</div>`;
    else inputs = field('Durasi (menit)', 'minutes', ctx.minutes, 'inputmode="numeric"');
    const k = calc();
    openSheet(`${sheetHead(existing ? 'Edit olahraga' : 'Catat olahraga')}
      <div class="sheet-body form">
        ${select('Aktivitas', 'type', ctx.type, opts)}
        ${inputs}
        <div class="ex-preview"><b class="num">${fmtNum(k)}</b> kkal terbakar<small>+${fmtNum(Math.round(k * state.profile.exerciseCredit))} kkal ke jatah makan</small></div>
        <button type="button" class="btn full big" data-save>Simpan</button>
        ${existing ? `<button type="button" class="btn danger ghost full" data-delete>${icon('trash')} Hapus</button>` : ''}
      </div>`, mount);
  }

  function mount(sheet) {
    $('select[name=type]', sheet).addEventListener('change', (e) => { ctx.type = e.target.value; draw(); });
    $$('input', sheet).forEach((inp) => inp.addEventListener('change', () => {
      ctx[inp.name] = inp.name === 'name' ? inp.value : toInt(inp.value);
      draw();
    }));
    $('[data-save]', sheet).addEventListener('click', () => {
      $$('input', sheet).forEach((inp) => { ctx[inp.name] = inp.name === 'name' ? inp.value : toInt(inp.value); });
      const k = calc();
      if (!k) return toast('Kalori masih 0', { kind: 'bad' });
      const label = ctx.type === 'steps' ? 'Jalan (langkah)' : ctx.type === 'custom' ? (ctx.name.trim() || 'Olahraga') : C.EXERCISES.find((e) => e.id === ctx.type).label;
      const entry = { id: existing?.id || uid(), date, type: ctx.type, name: label, kcal: k, minutes: ['steps', 'custom'].includes(ctx.type) ? 0 : ctx.minutes, steps: ctx.type === 'steps' ? ctx.steps : 0 };
      if (existing) Object.assign(existing, entry); else state.exercises.push(entry);
      save(); closeSheet(); render(); vibrate(20);
      toast(`−${fmtNum(k)} kkal. Keringat nggak bohong.`, { kind: 'good' });
    });
    $('[data-delete]', sheet)?.addEventListener('click', () => {
      state.exercises = state.exercises.filter((e) => e.id !== editId);
      save(); closeSheet(); render(); toast('Dihapus');
    });
  }
}

function sheetConfirmReset() {
  openSheet(`${sheetHead('Hapus semua data?')}<div class="sheet-body">
    <p>Semua catatan makan, timbangan, olahraga, chat, dan XP akan hilang permanen. Export backup dulu kalau ragu.</p>
    <label class="field"><span>Ketik HAPUS untuk konfirmasi</span><input id="rs-text" autocomplete="off"></label>
    <button type="button" class="btn danger full" data-go>Hapus permanen</button></div>`, (sheet) => {
    $('[data-go]', sheet).addEventListener('click', () => {
      if ($('#rs-text', sheet).value.trim().toUpperCase() !== 'HAPUS') return toast('Ketik HAPUS dulu');
      const keys = { groqKey: state.ai.groqKey, geminiKey: state.ai.geminiKey };
      const fresh = defaultState();
      Object.assign(fresh.ai, keys);
      replaceState(fresh);
      closeSheet(); tab = 'home'; render();
    });
  });
}

// ---------- Perayaan ----------

function checkCelebrations() {
  if (!state.onboarded) return;
  const lv = levelInfo(computeXp(state).xp).level;
  const earned = earnedBadges(state);
  const fresh = earned.filter((b) => !state.seen.badges.includes(b.id));
  if (lv > state.seen.level) {
    confetti();
    toast(`LEVEL UP! Level ${lv}. Standar naik.`, { kind: 'good', duration: 4500 });
  } else if (fresh.length) {
    confetti();
    toast(`Badge baru: ${fresh[0].icon} ${fresh[0].name}`, { kind: 'good', duration: 4500 });
  }
  if (lv !== state.seen.level || fresh.length) {
    state.seen = { level: Math.max(lv, state.seen.level), badges: earned.map((b) => b.id) };
    save();
  }
}

function confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  vibrate([30, 40, 30]);
  const c = $('#confetti');
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colors = ['#c8ff3d', '#ff5a36', '#4cc9ff', '#ffd23f', '#ffffff'];
  const parts = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2, y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 14, vy: Math.random() * -14 - 4,
    s: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    c: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  c.hidden = false;
  (function frame(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    if (t - t0 < 2600) requestAnimationFrame(frame);
    else { ctx.clearRect(0, 0, innerWidth, innerHeight); c.hidden = true; }
  })(t0);
}

// ---------- Navigasi & aksi ----------

function go(next) {
  if (next === tab) return;
  if (next === 'settings') { prevTab = tab; history.pushState({ settings: true }, ''); }
  else if (tab === 'settings') { history.back(); prevTab = next; return; }
  tab = next;
  window.scrollTo(0, 0);
  render();
}

const ACTIONS = {
  goto: (el) => go(el.dataset.tab),
  back: () => history.back(),
  'add-food': (el) => sheetAddFood(el.dataset.date || (tab === 'log' ? logDate : dateKey())),
  'edit-food': (el) => sheetEditFood(el.dataset.id),
  'add-weight': () => sheetWeight(),
  'del-weight': (el) => {
    if (state.weights.length <= 1) return toast('Minimal harus ada satu data berat');
    const w = state.weights.find((x) => x.date === el.dataset.date);
    state.weights = state.weights.filter((x) => x !== w);
    save(); render();
    toast(`Data ${fmtShortDate(w.date)} dihapus`, { action: 'Batal', onAction: () => { state.weights.push(w); save(); render(); } });
  },
  'add-ex': (el) => sheetExercise(el.dataset.date),
  'edit-ex': (el) => { const e = state.exercises.find((x) => x.id === el.dataset.id); sheetExercise(e.date, e.id); },
  'water-add': (el) => {
    const k = el.dataset.date;
    const before = state.water[k] || 0;
    state.water[k] = Math.max(0, before + Number(el.dataset.ml));
    save(); vibrate(8); render();
    if (before < state.profile.waterGoal && state.water[k] >= state.profile.waterGoal) toast('Target air tercapai. +15 XP', { kind: 'good' });
  },
  'water-set': (el) => {
    const k = el.dataset.date, g = state.profile.glass, i = Number(el.dataset.i);
    const cur = state.water[k] || 0;
    // Tap tetesan terakhir yang terisi untuk mengosongkannya.
    state.water[k] = Math.floor(cur / g) === i + 1 ? i * g : (i + 1) * g;
    save(); vibrate(8); render();
  },
  'log-prev': () => { logDate = addDays(logDate, -1); render(); },
  'log-next': () => { if (logDate < dateKey()) { logDate = addDays(logDate, 1); render(); } },
  'coach-quick': (el) => sendCoach(el.textContent),
  'coach-clear': () => {
    const old = state.chat;
    state.chat = []; save(); render();
    toast('Percakapan dihapus', { action: 'Batal', onAction: () => { state.chat = old; save(); render(); } });
  },
  wrange: (el) => { weightRange = Number(el.dataset.v); render(); },
  'test-ai': async (el) => {
    const form = el.closest('form');
    const { ai } = readForm(form);
    const old = state.ai;
    state.ai = ai;
    el.textContent = '...';
    try { await testProvider(el.dataset.p); el.textContent = '✓ OK'; el.classList.add('ok'); toast(`${el.dataset.p === 'groq' ? 'Groq' : 'Gemini'} tersambung`, { kind: 'good' }); }
    catch (e) { el.textContent = '✗'; toast(e.message, { kind: 'bad', duration: 6000 }); }
    finally { state.ai = old; }
  },
  export: () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tempa-backup-${dateKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  reset: () => sheetConfirmReset(),
  install: async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; render(); },
};

document.addEventListener('click', (e) => {
  if (e.target.closest('#sheet-root')) return;
  const el = e.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el, e);
  const t = e.target.closest('.tabbar [data-tab]');
  if (t) go(t.dataset.tab);
  if (e.target.closest('.tabbar .fab')) {
    if (!state.onboarded) return;
    sheetAddFood(tab === 'log' ? logDate : dateKey());
  }
});

let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (tab === 'progress') drawCharts(); }, 150); });

// Ganti hari otomatis kalau aplikasi dibiarkan terbuka lewat tengah malam.
let lastDay = dateKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && dateKey() !== lastDay) {
    if (logDate === lastDay) logDate = dateKey();
    lastDay = dateKey();
    render();
  }
});

async function boot() {
  $$('.tabbar [data-icon]').forEach((b) => { b.insertAdjacentHTML('afterbegin', icon(b.dataset.icon)); });
  await load();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
