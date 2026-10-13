// Grafik SVG ringan tanpa library: tren BB dan kalori harian. Warna diatur lewat class di CSS.

import { sortedWeights, dayStats, lastNDays } from './calc.js';
import { addDays, daysBetween, dateKey, fmtKg, fmtNum, fmtShortDate, fmtDate, esc } from './util.js';

const ns = 'http://www.w3.org/2000/svg';

function niceTicks(lo, hi, count = 4) {
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

function attachTooltip(wrap, svg, points, render) {
  const tip = wrap.querySelector('.chart-tip');
  const cross = svg.querySelector('.crosshair');
  const dot = svg.querySelector('.hover-dot');
  const hide = () => { tip.hidden = true; cross?.setAttribute('opacity', 0); dot?.setAttribute('opacity', 0); };
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const x = ev.clientX - r.left;
    let best = null;
    for (const p of points) if (!best || Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    if (!best) return hide();
    tip.innerHTML = render(best);
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(4, best.x - tw / 2), r.width - tw - 4) + 'px';
    tip.style.top = Math.max(0, best.y - tip.offsetHeight - 14) + 'px';
    if (cross) { cross.setAttribute('x1', best.x); cross.setAttribute('x2', best.x); cross.setAttribute('opacity', 1); }
    if (dot) { dot.setAttribute('cx', best.x); dot.setAttribute('cy', best.y); dot.setAttribute('opacity', 1); }
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', hide);
}

export function weightChart(wrap, state, rangeDays) {
  const W = wrap.clientWidth || 340;
  const H = 220;
  const pad = { l: 36, r: 12, t: 16, b: 26 };
  const today = dateKey();
  const all = sortedWeights(state);
  const p = state.profile;
  const from = rangeDays ? addDays(today, -rangeDays + 1) : (all[0]?.date < p.startDate ? all[0].date : p.startDate);
  let pts = all.filter((w) => w.date >= from);
  // Sertakan titik terakhir sebelum rentang supaya garis tidak terputus di kiri.
  const before = all.filter((w) => w.date < from).pop();
  if (before) pts = [{ date: from, kg: before.kg, carried: true }, ...pts];
  const span = Math.max(1, daysBetween(from, today));

  // Garis rencana: dari BB awal turun sesuai kecepatan target per minggu.
  const planAt = (key) => Math.max(p.targetWeight, p.startWeight - (daysBetween(p.startDate, key) / 7) * p.rate);
  const planFrom = from < p.startDate ? p.startDate : from;

  const ys = pts.map((w) => w.kg).concat([planAt(planFrom), planAt(today)]);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 4) { const m = (hi + lo) / 2; lo = m - 2; hi = m + 2; }
  lo = Math.floor(lo - 0.5); hi = Math.ceil(hi + 0.5);

  const x = (key) => pad.l + (daysBetween(from, key) / span) * (W - pad.l - pad.r);
  const y = (kg) => pad.t + (1 - (kg - lo) / (hi - lo)) * (H - pad.t - pad.b);

  let g = '';
  for (const v of niceTicks(lo, hi, 4)) {
    g += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>`;
    g += `<text class="axis" x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  const xt = [from, addDays(from, Math.round(span / 2)), today];
  xt.forEach((k, i) => {
    g += `<text class="axis" x="${x(k)}" y="${H - 6}" text-anchor="${['start', 'middle', 'end'][i]}">${fmtShortDate(k)}</text>`;
  });
  if (p.targetWeight >= lo && p.targetWeight <= hi) {
    g += `<line class="target-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y(p.targetWeight)}" y2="${y(p.targetWeight)}"/>`;
    g += `<text class="axis strong" x="${W - pad.r}" y="${y(p.targetWeight) - 5}" text-anchor="end">Target ${fmtKg(p.targetWeight)}</text>`;
  }
  if (planFrom <= today) {
    g += `<line class="plan-line" x1="${x(planFrom)}" x2="${x(today)}" y1="${y(planAt(planFrom))}" y2="${y(planAt(today))}"/>`;
  }
  const real = pts.map((w) => ({ ...w, x: x(w.date), y: y(w.kg) }));
  if (real.length > 1) g += `<polyline class="series" points="${real.map((q) => `${q.x},${q.y}`).join(' ')}"/>`;
  const shown = real.filter((q) => !q.carried);
  if (shown.length <= 40) for (const q of shown) g += `<circle class="marker" cx="${q.x}" cy="${q.y}" r="4"/>`;
  const last = shown[shown.length - 1];
  if (last) g += `<text class="label" x="${Math.min(last.x, W - pad.r - 4)}" y="${last.y - 10}" text-anchor="end">${fmtKg(last.kg)}</text>`;
  g += `<line class="crosshair" opacity="0" y1="${pad.t}" y2="${H - pad.b}"/><circle class="hover-dot" r="6" opacity="0"/>`;

  wrap.innerHTML = `<svg xmlns="${ns}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik berat badan">${g}</svg><div class="chart-tip" hidden></div>`;
  attachTooltip(wrap, wrap.querySelector('svg'), shown, (q) =>
    `<b>${fmtKg(q.kg)} kg</b><span>${esc(fmtDate(q.date))}</span><span>Rencana: ${fmtKg(planAt(q.date))} kg</span>`);
}

export function kcalChart(wrap, state, n = 14) {
  const W = wrap.clientWidth || 340;
  const H = 180;
  const pad = { l: 36, r: 8, t: 14, b: 24 };
  const days = lastNDays(n).map((k) => dayStats(state, k));
  const hi = Math.max(...days.map((d) => Math.max(d.kcal, d.allowance))) * 1.1 || 2500;
  const bw = (W - pad.l - pad.r) / n;
  const y = (v) => pad.t + (1 - v / hi) * (H - pad.t - pad.b);
  let g = '';
  for (const v of niceTicks(0, hi, 3)) {
    g += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>`;
    g += `<text class="axis" x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? v / 1000 + 'k' : v}</text>`;
  }
  const pts = [];
  days.forEach((d, i) => {
    const cx = pad.l + bw * i + bw / 2;
    const w = Math.max(4, bw - 6);
    if (d.kcal > 0) {
      const top = y(d.kcal);
      const h = y(0) - top;
      const r = Math.min(4, w / 2, h);
      // Bar dengan sudut membulat hanya di atas, menempel ke garis dasar.
      g += `<path class="bar ${d.over ? 'over' : 'ok'}" d="M${cx - w / 2},${y(0)} V${top + r} Q${cx - w / 2},${top} ${cx - w / 2 + r},${top} H${cx + w / 2 - r} Q${cx + w / 2},${top} ${cx + w / 2},${top + r} V${y(0)} Z"/>`;
    }
    g += `<line class="allow-tick" x1="${cx - bw / 2 + 2}" x2="${cx + bw / 2 - 2}" y1="${y(d.allowance)}" y2="${y(d.allowance)}"/>`;
    if (i % Math.ceil(n / 7) === 0 || i === n - 1) {
      g += `<text class="axis" x="${cx}" y="${H - 6}" text-anchor="middle">${fmtShortDate(d.key).split(' ')[0]}</text>`;
    }
    pts.push({ x: cx, y: y(Math.max(d.kcal, d.allowance)), d });
  });
  g += `<line class="baseline" x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  wrap.innerHTML = `<svg xmlns="${ns}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kalori 14 hari terakhir">${g}</svg><div class="chart-tip" hidden></div>`;
  attachTooltip(wrap, wrap.querySelector('svg'), pts, ({ d }) => {
    const status = !d.logged ? 'Tidak mencatat' : d.over ? `▲ Lewat ${fmtNum(d.kcal - d.allowance)} kkal` : `✓ Sisa ${fmtNum(d.allowance - d.kcal)} kkal`;
    return `<b>${fmtNum(d.kcal)} kkal</b><span>${esc(fmtDate(d.key))}</span><span>Jatah ${fmtNum(d.allowance)}</span><span>${status}</span>`;
  });
}
