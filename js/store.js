// Penyimpanan lokal: seluruh state disimpan sebagai satu record di IndexedDB.

import { dateKey } from './util.js';

const DB_NAME = 'tempa';
const STORE = 'kv';
const KEY = 'state';

export const DEFAULT_MODELS = {
  groqModel: 'llama-3.3-70b-versatile',
  groqVisionModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
  geminiModel: 'gemini-flash-latest',
};

export function defaultState() {
  const today = dateKey();
  return {
    version: 1,
    onboarded: false,
    profile: {
      name: '',
      sex: 'm',
      age: 22,
      height: 171,
      startWeight: 112,
      targetWeight: 75,
      rate: 0.75,
      activity: 1.2,
      budgetDay: 50000,
      budgetMonth: 1500000,
      waterGoal: 3000,
      glass: 250,
      exerciseCredit: 0.5,
      startDate: today,
    },
    ai: {
      groqKey: '',
      geminiKey: '',
      textProvider: 'groq',
      visionProvider: 'gemini',
      ...DEFAULT_MODELS,
    },
    foods: [],
    weights: [{ date: today, kg: 112 }],
    water: {},
    exercises: [],
    chat: [],
    seen: { level: 1, badges: [] },
  };
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbp;
const db = () => (dbp ||= openDb());

async function idbGet(key) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, val) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Gabungkan data tersimpan dengan default supaya field baru di versi berikutnya selalu ada.
function migrate(saved) {
  const base = defaultState();
  // Model lama yang sudah dibatasi Google diganti alias yang selalu menunjuk Flash terbaru.
  if (saved.ai?.geminiModel === 'gemini-2.5-flash') saved.ai.geminiModel = DEFAULT_MODELS.geminiModel;
  return {
    ...base,
    ...saved,
    profile: { ...base.profile, ...saved.profile },
    ai: { ...base.ai, ...saved.ai },
    seen: { ...base.seen, ...saved.seen },
  };
}

export let state = defaultState();
// Naik setiap ada perubahan, dipakai calc.js untuk membuang cache statistik.
export let rev = 0;

export async function load() {
  try {
    const saved = await idbGet(KEY);
    if (saved) { state = migrate(saved); rev++; }
  } catch (e) {
    console.error('Gagal membaca data', e);
  }
  // Minta browser tidak menghapus data saat memori HP penuh.
  try { await navigator.storage?.persist?.(); } catch { /* abaikan */ }
  return state;
}

// Beberapa perubahan dalam satu tick digabung jadi satu tulisan, tapi tetap langsung disimpan.
let pending = false;
export function save() {
  rev++;
  if (pending) return;
  pending = true;
  queueMicrotask(() => {
    pending = false;
    idbSet(KEY, state).catch((e) => console.error('Gagal menyimpan', e));
  });
}

export function replaceState(next) {
  state = migrate(next);
  save();
}

export function exportJson() {
  const copy = JSON.parse(JSON.stringify(state));
  // API key tidak ikut di-export supaya file backup aman dibagikan.
  copy.ai.groqKey = '';
  copy.ai.geminiKey = '';
  return JSON.stringify(copy, null, 2);
}

export function importJson(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.foods) || !data.profile) throw new Error('File bukan backup Tempa');
  const keys = { groqKey: state.ai.groqKey, geminiKey: state.ai.geminiKey };
  replaceState(data);
  if (!state.ai.groqKey) state.ai.groqKey = keys.groqKey;
  if (!state.ai.geminiKey) state.ai.geminiKey = keys.geminiKey;
  save();
}
