// Helper umum: tanggal, format angka, escape HTML, toast, getaran.

export const pad = (n) => String(n).padStart(2, '0');

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}

export function timeNow() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function fmtDate(key, withDay = true) {
  const d = parseKey(key);
  const s = `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
  return withDay ? `${HARI[d.getDay()]}, ${s}` : s;
}

export function fmtShortDate(key) {
  const d = parseKey(key);
  return `${d.getDate()} ${BULAN[d.getMonth()]}`;
}

export function relDay(key) {
  const t = dateKey();
  if (key === t) return 'Hari ini';
  if (key === addDays(t, -1)) return 'Kemarin';
  return fmtDate(key);
}

const numFmt = new Intl.NumberFormat('id-ID');
export const fmtNum = (n) => numFmt.format(Math.round(n || 0));
export const fmtKg = (n) => (Math.round(n * 10) / 10).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtRp = (n) => 'Rp' + numFmt.format(Math.round(n || 0));

export function fmtRpShort(n) {
  n = Math.round(n || 0);
  if (Math.abs(n) >= 1e6) return 'Rp' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + 'jt';
  if (Math.abs(n) >= 1e3) return 'Rp' + (n / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + 'rb';
  return 'Rp' + n;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function vibrate(p = 12) {
  try { navigator.vibrate && navigator.vibrate(p); } catch { /* tidak didukung */ }
}

let toastTimer;
export function toast(msg, opts = {}) {
  const box = document.getElementById('toast');
  box.innerHTML = `<span>${esc(msg)}</span>` + (opts.action ? `<button type="button">${esc(opts.action)}</button>` : '');
  box.className = 'toast show' + (opts.kind ? ' ' + opts.kind : '');
  if (opts.action) box.querySelector('button').onclick = () => { opts.onAction(); box.className = 'toast'; };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.className = 'toast'; }, opts.duration || 3200);
}

export function mealByTime(d = new Date()) {
  const h = d.getHours();
  if (h >= 4 && h < 10) return 'sarapan';
  if (h >= 10 && h < 15) return 'siang';
  if (h >= 17 && h < 22) return 'malam';
  return 'camilan';
}

export const MEALS = [
  { id: 'sarapan', label: 'Sarapan' },
  { id: 'siang', label: 'Makan siang' },
  { id: 'malam', label: 'Makan malam' },
  { id: 'camilan', label: 'Camilan' },
];
