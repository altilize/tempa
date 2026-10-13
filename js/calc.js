// Rumus gizi dan statistik harian. Semua angka dihitung dari data, tidak disimpan.

import { dateKey, addDays, daysBetween, parseKey } from './util.js';
import { rev } from './store.js';

let cacheRev = -1;
const cache = new Map();

export const KCAL_PER_KG = 7700;

export const ACTIVITY = [
  { v: 1.2, label: 'Banyak duduk' },
  { v: 1.375, label: 'Ringan' },
  { v: 1.55, label: 'Sedang' },
  { v: 1.725, label: 'Berat' },
];

// MET (Compendium of Physical Activities), kalori = MET x BB x jam.
export const EXERCISES = [
  { id: 'jalan', label: 'Jalan kaki santai', met: 3.0 },
  { id: 'jalan_cepat', label: 'Jalan cepat', met: 4.3 },
  { id: 'lari', label: 'Lari pelan (jogging)', met: 7.0 },
  { id: 'sepeda', label: 'Bersepeda santai', met: 5.8 },
  { id: 'renang', label: 'Renang', met: 6.0 },
  { id: 'gym', label: 'Angkat beban / gym', met: 5.0 },
  { id: 'futsal', label: 'Futsal / sepak bola', met: 7.0 },
  { id: 'badminton', label: 'Badminton', met: 5.5 },
  { id: 'hiit', label: 'HIIT / senam intens', met: 8.0 },
  { id: 'yoga', label: 'Yoga / stretching', met: 2.5 },
  { id: 'tangga', label: 'Naik tangga', met: 8.8 },
];

export function weightOn(state, key = dateKey()) {
  let w = state.profile.startWeight;
  for (const e of sortedWeights(state)) {
    if (e.date <= key) w = e.kg; else break;
  }
  return w;
}

export function sortedWeights(state) {
  return [...state.weights].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export const latestWeight = (state) => weightOn(state, '9999-12-31');

export function bmi(kg, cm) {
  const m = cm / 100;
  return kg / (m * m);
}

export function bmiClass(v) {
  if (v < 18.5) return 'Kurus';
  if (v < 25) return 'Normal';
  if (v < 30) return 'Overweight';
  if (v < 35) return 'Obesitas I';
  if (v < 40) return 'Obesitas II';
  return 'Obesitas III';
}

export function idealRange(cm) {
  const m = cm / 100;
  return [18.5 * m * m, 24.9 * m * m];
}

// Rumus Devine, tinggi dalam inci di atas 5 kaki.
export function devine(cm, sex) {
  const inch = cm / 2.54 - 60;
  return (sex === 'f' ? 45.5 : 50) + 2.3 * inch;
}

export function bmr(p, kg) {
  return 10 * kg + 6.25 * p.height - 5 * p.age + (p.sex === 'f' ? -161 : 5);
}

export function targets(p, kg) {
  const b = bmr(p, kg);
  const tdee = b * p.activity;
  const deficit = (p.rate * KCAL_PER_KG) / 7;
  const floor = p.sex === 'f' ? 1200 : 1500;
  const reached = kg <= p.targetWeight;
  // Sudah di target: makan sebanyak TDEE untuk mempertahankan.
  const kcal = reached ? Math.round(tdee / 10) * 10 : Math.max(floor, Math.round((tdee - deficit) / 10) * 10);
  const protein = Math.round(1.6 * p.targetWeight);
  const fat = Math.round((kcal * 0.27) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { bmr: b, tdee, deficit: tdee - kcal, kcal, protein, fat, carbs, floor, reached };
}

export function exerciseKcal(met, kg, minutes) {
  return Math.round(met * kg * (minutes / 60));
}

// Sekitar 0,57 kkal per langkah per kg x 0,001 (patokan 0,04 kkal/langkah untuk BB 70 kg).
export const stepsKcal = (steps, kg) => Math.round(steps * 0.00057 * kg);

export function dayStats(state, key) {
  if (cacheRev !== rev) { cache.clear(); cacheRev = rev; }
  if (cache.has(key)) return cache.get(key);
  const out = computeDay(state, key);
  cache.set(key, out);
  return out;
}

function computeDay(state, key) {
  const p = state.profile;
  const kg = weightOn(state, key);
  const t = targets(p, kg);
  const foods = state.foods.filter((f) => f.date === key);
  const sum = (k) => foods.reduce((a, f) => a + (Number(f[k]) || 0), 0);
  const ex = state.exercises.filter((e) => e.date === key);
  const exKcal = ex.reduce((a, e) => a + (Number(e.kcal) || 0), 0);
  const exCredit = Math.round(exKcal * p.exerciseCredit);
  const allowance = t.kcal + exCredit;
  const kcal = sum('kcal');
  const price = sum('price');
  const water = state.water[key] || 0;
  return {
    key, kg, t, foods, ex,
    kcal, protein: sum('protein'), carbs: sum('carbs'), fat: sum('fat'), price,
    exKcal, exCredit, allowance,
    remaining: allowance - kcal,
    over: kcal > allowance,
    logged: foods.length > 0,
    // Hari "bersih": ada catatan makan, tidak lewat jatah, dan tidak terlalu sedikit (menghindari catatan asal-asalan).
    clean: foods.length > 0 && kcal <= allowance && kcal >= t.floor * 0.6,
    underBudget: foods.length > 0 && price <= p.budgetDay,
    water,
    waterDone: water >= p.waterGoal,
  };
}

// Streak = hari bersih berturut-turut. Hari ini ikut dihitung kalau sudah bersih, tapi belum memutus streak kalau belum.
export function streak(state, pred = (s) => s.clean) {
  const today = dateKey();
  let n = pred(dayStats(state, today)) ? 1 : 0;
  let key = addDays(today, -1);
  const first = firstDay(state);
  while (key >= first) {
    if (!pred(dayStats(state, key))) break;
    n++;
    key = addDays(key, -1);
  }
  return n;
}

export function bestStreak(state, pred = (s) => s.clean) {
  let best = 0, cur = 0;
  for (const key of allDays(state)) {
    if (pred(dayStats(state, key))) { cur++; best = Math.max(best, cur); } else cur = 0;
  }
  return best;
}

export function firstDay(state) {
  let first = state.profile.startDate;
  for (const f of state.foods) if (f.date < first) first = f.date;
  for (const w of state.weights) if (w.date < first) first = w.date;
  return first;
}

export function allDays(state) {
  const out = [];
  const today = dateKey();
  for (let k = firstDay(state); k <= today; k = addDays(k, 1)) out.push(k);
  return out;
}

export function monthSpend(state, key = dateKey()) {
  const ym = key.slice(0, 7);
  return state.foods.filter((f) => f.date.startsWith(ym)).reduce((a, f) => a + (Number(f.price) || 0), 0);
}

// Tren penurunan dari regresi linier BB 28 hari terakhir. Butuh rentang minimal 7 hari.
export function trend(state) {
  const ws = sortedWeights(state);
  if (ws.length < 2) return null;
  const last = ws[ws.length - 1].date;
  const pts = ws.filter((w) => daysBetween(w.date, last) <= 28);
  if (pts.length < 2 || daysBetween(pts[0].date, last) < 7) return null;
  const xs = pts.map((w) => daysBetween(pts[0].date, w.date));
  const ys = pts.map((w) => w.kg);
  const mx = xs.reduce((a, b) => a + b) / xs.length;
  const my = ys.reduce((a, b) => a + b) / ys.length;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  const slope = den ? num / den : 0;
  return { perWeek: slope * 7 };
}

export function eta(state) {
  const kg = latestWeight(state);
  const p = state.profile;
  const toGo = kg - p.targetWeight;
  if (toGo <= 0) return { done: true };
  const tr = trend(state);
  const usingTrend = tr && tr.perWeek < -0.05;
  const perWeek = usingTrend ? -tr.perWeek : p.rate;
  const weeks = toGo / perWeek;
  const d = new Date();
  d.setDate(d.getDate() + Math.round(weeks * 7));
  return { done: false, weeks, date: dateKey(d), perWeek, usingTrend };
}

export function lastNDays(n, end = dateKey()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(end, -i));
  return out;
}

export const isFuture = (key) => key > dateKey();
export const weekday = (key) => parseKey(key).getDay();
