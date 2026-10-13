// Gamifikasi: XP, level, badge. Semuanya diturunkan dari data supaya tidak bisa dobel dihitung.

import { allDays, dayStats, latestWeight, bestStreak, streak, sortedWeights } from './calc.js';
import { dateKey } from './util.js';

export const RANKS = ['Rekrut', 'Kadet', 'Prajurit', 'Petarung', 'Pejuang', 'Gladiator', 'Spartan', 'Titan', 'Juara', 'Legenda'];

// Level L butuh total 100·L·(L-1) XP: L2=200, L3=600, L4=1200, dst.
export const xpForLevel = (L) => 100 * L * (L - 1);
export const levelFromXp = (xp) => Math.max(1, Math.floor((1 + Math.sqrt(1 + xp / 25)) / 2));
export const rankName = (L) => RANKS[Math.min(RANKS.length - 1, Math.floor((L - 1) / 2))];

export function computeXp(state) {
  const today = dateKey();
  let xp = 0;
  const parts = { makan: 0, disiplin: 0, budget: 0, air: 0, olahraga: 0, timbang: 0, turun: 0, badge: 0 };
  for (const key of allDays(state)) {
    const s = dayStats(state, key);
    parts.makan += Math.min(30, s.foods.length * 5);
    if (s.waterDone) parts.air += 15;
    if (s.ex.length) parts.olahraga += 20 + Math.min(30, Math.floor(s.exKcal / 20));
    // Bonus disiplin dan budget hanya untuk hari yang sudah selesai.
    if (key < today) {
      if (s.clean) parts.disiplin += 50;
      if (s.underBudget) parts.budget += 20;
    }
  }
  const weighDays = new Set(state.weights.map((w) => w.date));
  parts.timbang = Math.max(0, weighDays.size - 1) * 20;
  const lost = state.profile.startWeight - Math.min(state.profile.startWeight, ...state.weights.map((w) => w.kg));
  parts.turun = Math.floor(Math.max(0, lost)) * 100;
  parts.badge = earnedBadges(state).length * 50;
  for (const k in parts) xp += parts[k];
  return { xp, parts };
}

export function levelInfo(xp) {
  const level = levelFromXp(xp);
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, rank: rankName(level), into: xp - cur, need: next - cur, pct: (xp - cur) / (next - cur) };
}

const lostKg = (s) => s.profile.startWeight - Math.min(s.profile.startWeight, ...s.weights.map((w) => w.kg));
const minWeight = (s) => Math.min(...s.weights.map((w) => w.kg));
const countDays = (s, pred) => allDays(s).filter((k) => pred(dayStats(s, k))).length;

export const BADGES = [
  { id: 'first_log', icon: '🍽️', name: 'Langkah Pertama', desc: 'Catat makanan pertama', test: (s) => s.foods.length > 0 },
  { id: 'first_photo', icon: '📸', name: 'Mata Elang', desc: 'Catat makanan lewat foto', test: (s) => s.foods.some((f) => f.src === 'photo') },
  { id: 'coach', icon: '🗣️', name: 'Siap Dimarahi', desc: 'Ngobrol pertama dengan Coach', test: (s) => s.chat.some((m) => m.role === 'user') },
  { id: 'clean1', icon: '✅', name: 'Hari Bersih', desc: '1 hari penuh di bawah jatah kalori', test: (s) => bestStreak(s) >= 1 },
  { id: 'streak3', icon: '🔥', name: 'Panas', desc: 'Streak disiplin 3 hari', test: (s) => bestStreak(s) >= 3 },
  { id: 'streak7', icon: '⚔️', name: 'Seminggu Tahan', desc: 'Streak disiplin 7 hari', test: (s) => bestStreak(s) >= 7 },
  { id: 'streak14', icon: '🛡️', name: 'Tembok Baja', desc: 'Streak disiplin 14 hari', test: (s) => bestStreak(s) >= 14 },
  { id: 'streak30', icon: '👑', name: 'Mesin', desc: 'Streak disiplin 30 hari', test: (s) => bestStreak(s) >= 30 },
  { id: 'water7', icon: '💧', name: 'Unta Terbalik', desc: '7 hari capai target air', test: (s) => countDays(s, (d) => d.waterDone) >= 7 },
  { id: 'budget7', icon: '💰', name: 'Dompet Aman', desc: 'Streak 7 hari di bawah budget', test: (s) => bestStreak(s, (d) => d.underBudget) >= 7 },
  { id: 'sweat10', icon: '🏃', name: 'Keringat 10x', desc: '10 sesi olahraga', test: (s) => s.exercises.length >= 10 },
  { id: 'burn5k', icon: '🔆', name: 'Tungku', desc: 'Total 5.000 kkal terbakar dari olahraga', test: (s) => s.exercises.reduce((a, e) => a + e.kcal, 0) >= 5000 },
  { id: 'weigh8', icon: '⚖️', name: 'Jujur Sama Timbangan', desc: 'Timbang 8 kali', test: (s) => new Set(s.weights.map((w) => w.date)).size >= 8 },
  { id: 'lost1', icon: '🥉', name: 'Kilo Pertama', desc: 'Turun 1 kg', test: (s) => lostKg(s) >= 1 },
  { id: 'lost5', icon: '🥈', name: 'Lima Kilo', desc: 'Turun 5 kg', test: (s) => lostKg(s) >= 5 },
  { id: 'lost10', icon: '🥇', name: 'Dua Digit', desc: 'Turun 10 kg', test: (s) => lostKg(s) >= 10 },
  { id: 'sub100', icon: '💯', name: 'Kepala 9', desc: 'BB di bawah 100 kg', test: (s) => minWeight(s) < 100 },
  { id: 'lost20', icon: '🏆', name: 'Dua Puluh', desc: 'Turun 20 kg', test: (s) => lostKg(s) >= 20 },
  { id: 'sub90', icon: '🚀', name: 'Kepala 8', desc: 'BB di bawah 90 kg', test: (s) => minWeight(s) < 90 },
  { id: 'sub80', icon: '🌟', name: 'Kepala 7', desc: 'BB di bawah 80 kg', test: (s) => minWeight(s) < 80 },
  { id: 'goal', icon: '🏁', name: 'TARGET TEMBUS', desc: 'Sampai di BB target', test: (s) => latestWeight(s) <= s.profile.targetWeight },
];

export function earnedBadges(state) {
  return BADGES.filter((b) => b.test(state));
}

// Milestone BB: tiap kelipatan 5 kg antara BB awal dan target, ditambah target itu sendiri.
export function milestones(state) {
  const { startWeight, targetWeight } = state.profile;
  const out = [];
  for (let m = Math.floor((startWeight - 0.01) / 5) * 5; m > targetWeight; m -= 5) out.push(m);
  out.push(targetWeight);
  const best = Math.min(startWeight, ...sortedWeights(state).map((w) => w.kg));
  return out.map((kg) => ({ kg, done: best <= kg }));
}

export function currentStreak(state) {
  return streak(state);
}
