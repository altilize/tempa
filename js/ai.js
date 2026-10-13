// Integrasi AI lewat endpoint kompatibel OpenAI milik Groq dan Google Gemini.

import { state, save } from './store.js';
import { dayStats, latestWeight, targets, eta, monthSpend, streak, lastNDays, trend } from './calc.js';
import { dateKey, fmtRp, fmtNum, fmtKg } from './util.js';

const ENDPOINTS = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
};

const MODELS_URL = {
  groq: 'https://api.groq.com/openai/v1/models',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/models',
};

export class AiError extends Error {}

async function listModels(provider, key) {
  try {
    const res = await fetch(MODELS_URL[provider], { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map((m) => String(m.id).replace(/^models\//, ''));
  } catch {
    return [];
  }
}

const version = (id) => Number((id.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]);

function bestGemini(ids) {
  if (ids.includes('gemini-flash-latest')) return 'gemini-flash-latest';
  const ok = ids.filter((id) => /^gemini-[\d.]+-flash/.test(id) && !/image|tts|audio|live|embed|native|computer|robotics/.test(id));
  // Utamakan versi terbaru, versi stabil, dan bukan varian lite.
  const score = (id) => version(id) * 10 - (/lite/.test(id) ? 3 : 0) - (/preview|exp/.test(id) ? 1 : 0);
  return ok.sort((a, b) => score(b) - score(a))[0];
}

function bestGroq(ids, vision) {
  const usable = ids.filter((id) => !/guard|whisper|tts|prompt|compound|embed/.test(id));
  if (vision) return usable.find((id) => /llama-4-scout/.test(id)) || usable.find((id) => /llama-4|vision/.test(id));
  return ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'].find((id) => usable.includes(id))
    || usable.find((id) => /versatile|gpt-oss|llama/.test(id));
}

// Cek daftar model milik key ini, ganti model yang sudah tidak tersedia dengan yang terbaik.
export async function resolveModels(provider) {
  const ai = state.ai;
  const key = provider === 'groq' ? ai.groqKey : ai.geminiKey;
  const ids = await listModels(provider, key);
  if (!ids.length) return false;
  let changed = false;
  const fix = (field, pickBest) => {
    if (ids.includes(ai[field])) return;
    const best = pickBest();
    if (best) { ai[field] = best; changed = true; }
  };
  if (provider === 'gemini') fix('geminiModel', () => bestGemini(ids));
  else { fix('groqModel', () => bestGroq(ids, false)); fix('groqVisionModel', () => bestGroq(ids, true)); }
  if (changed) save();
  return changed;
}

function pick(kind) {
  const ai = state.ai;
  let provider = kind === 'vision' ? ai.visionProvider : ai.textProvider;
  const keyOf = (p) => (p === 'groq' ? ai.groqKey : ai.geminiKey);
  // Kalau key provider pilihan kosong, pakai provider lain yang ada key-nya.
  if (!keyOf(provider)) provider = provider === 'groq' ? 'gemini' : 'groq';
  const key = keyOf(provider);
  if (!key) throw new AiError('API key belum diisi. Buka Pengaturan dan masukkan key Groq atau Gemini.');
  const model = provider === 'gemini' ? ai.geminiModel : kind === 'vision' ? ai.groqVisionModel : ai.groqModel;
  return { provider, key, model };
}

export const hasAi = () => Boolean(state.ai.groqKey || state.ai.geminiKey);

async function chat(kind, messages, opts = {}) {
  const { temperature = 0.4, maxTokens = 3000, signal, target, retried } = opts;
  const { provider, key, model } = target || pick(kind);
  let res;
  try {
    res = await fetch(ENDPOINTS[provider], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new AiError('Tidak bisa terhubung ke AI. Cek koneksi internet kamu.');
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* abaikan */ }
    const name = provider === 'groq' ? 'Groq' : 'Gemini';
    if (res.status === 401 || res.status === 403) throw new AiError(`API key ${name} ditolak. Cek lagi di Pengaturan.`);
    if (res.status === 429) throw new AiError(`Kuota gratis ${name} sedang habis. Tunggu sebentar lalu coba lagi.`);
    if (res.status === 404 || (res.status === 400 && /model/i.test(detail))) {
      // Model sudah dipensiunkan: cari pengganti otomatis lalu coba sekali lagi.
      if (!retried && !target && await resolveModels(provider)) return chat(kind, messages, { ...opts, retried: true });
      throw new AiError(`Model "${model}" tidak tersedia di ${name}. (${detail})`);
    }
    throw new AiError(`${name} error ${res.status}. ${detail}`.trim());
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new AiError('AI tidak memberi jawaban. Coba lagi.');
  return text;
}

function extractJson(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new AiError('Jawaban AI tidak bisa dibaca. Coba tulis ulang dengan lebih jelas.');
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new AiError('Jawaban AI tidak bisa dibaca. Coba lagi.');
  }
}

const num = (v) => {
  const n = Number(String(v ?? 0).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const FOOD_PROMPT = `Kamu ahli gizi Indonesia. Tugasmu mengubah deskripsi atau foto makanan menjadi data gizi.

Aturan:
- Pecah menjadi item terpisah (nasi, lauk, sayur, minuman, sambal/kerupuk kalau signifikan).
- Pakai porsi khas warung/restoran Indonesia kalau porsi tidak disebut. Perhitungkan minyak goreng, santan, dan gula pada minuman manis. Jangan meremehkan kalori.
- Harga: kalau pengguna menyebut harga, masukkan ke "price" dalam rupiah (25rb = 25000, 25k = 25000, ceban = 10000, goceng = 5000). Kalau yang disebut harga total untuk beberapa item, bagi ke item-item itu secara wajar sehingga jumlahnya sama persis dengan total. Kalau harga tidak disebut sama sekali, price = 0.
- "comment": 1 sampai 2 kalimat bahasa Indonesia santai, gaya pelatih tegas yang to the point. Nilai pilihan makanan ini berdasarkan konteks sisa kalori. Kalau buruk, tegur dan beri satu saran pengganti yang konkret. Kalau bagus, akui singkat tanpa lebay. Jangan menghina fisik.
- Kalau input sama sekali bukan makanan/minuman, kembalikan items kosong dan jelaskan di comment.

Jawab HANYA dengan JSON valid, tanpa teks lain:
{"items":[{"name":"Nasi putih","portion":"1 piring (200 g)","kcal":260,"protein":5,"carbs":57,"fat":1,"price":0}],"comment":"..."}`;

function foodContext() {
  const s = dayStats(state, dateKey());
  return `Konteks hari ini: jatah ${fmtNum(s.allowance)} kkal, sudah makan ${fmtNum(s.kcal)} kkal, sisa ${fmtNum(s.remaining)} kkal. Budget makan harian ${fmtRp(state.profile.budgetDay)}, sudah terpakai ${fmtRp(s.price)}.`;
}

function normalizeFood(json) {
  const items = (Array.isArray(json.items) ? json.items : [])
    .map((it) => ({
      name: String(it.name || '').trim().slice(0, 80),
      portion: String(it.portion || '').trim().slice(0, 60),
      kcal: Math.round(num(it.kcal)),
      protein: Math.round(num(it.protein)),
      carbs: Math.round(num(it.carbs)),
      fat: Math.round(num(it.fat)),
      price: Math.round(num(it.price)),
    }))
    .filter((it) => it.name);
  return { items, comment: String(json.comment || '').trim() };
}

export async function analyzeFoodText(text, opts) {
  const out = await chat('text', [
    { role: 'system', content: FOOD_PROMPT },
    { role: 'user', content: `${foodContext()}\n\nMakanan: ${text}` },
  ], { temperature: 0.2, ...opts });
  return normalizeFood(extractJson(out));
}

export async function analyzeFoodPhoto(dataUrl, caption, opts) {
  const out = await chat('vision', [
    { role: 'system', content: FOOD_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: `${foodContext()}\n\nIdentifikasi semua makanan/minuman di foto ini dan perkirakan porsinya dari ukuran piring/alat makan.${caption ? ' Catatan dari pengguna: ' + caption : ''}` },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ], { temperature: 0.2, ...opts });
  return normalizeFood(extractJson(out));
}

function coachContext() {
  const p = state.profile;
  const kg = latestWeight(state);
  const t = targets(p, kg);
  const today = dayStats(state, dateKey());
  const e = eta(state);
  const tr = trend(state);
  const week = lastNDays(7).map((k) => dayStats(state, k));
  const weekLines = week.map((d) => `${d.key}: ${d.logged ? `${fmtNum(d.kcal)}/${fmtNum(d.allowance)} kkal, ${fmtRp(d.price)}` : 'tidak mencatat'}${d.exKcal ? `, olahraga ${fmtNum(d.exKcal)} kkal` : ''}`).join('\n');
  const todayFoods = today.foods.map((f) => `- ${f.name} (${f.kcal} kkal${f.price ? ', ' + fmtRp(f.price) : ''})`).join('\n') || '- belum ada';
  return `DATA PENGGUNA (${dateKey()}):
${p.sex === 'f' ? 'Perempuan' : 'Laki-laki'}, ${p.age} th, TB ${p.height} cm, BB awal ${fmtKg(p.startWeight)} kg (mulai ${p.startDate}), BB sekarang ${fmtKg(kg)} kg, target ${fmtKg(p.targetWeight)} kg.
TDEE ${fmtNum(t.tdee)} kkal, target makan ${fmtNum(t.kcal)} kkal/hari, protein ${t.protein} g.
Tren: ${tr ? `${fmtKg(tr.perWeek)} kg/minggu` : 'belum cukup data'}. ${e.done ? 'Target sudah tercapai.' : `Perkiraan sampai target: ${e.date}.`}
Streak disiplin: ${streak(state)} hari. Budget makan ${fmtRp(p.budgetDay)}/hari, bulan ini terpakai ${fmtRp(monthSpend(state))} dari ${fmtRp(p.budgetMonth)}.
Hari ini: makan ${fmtNum(today.kcal)} dari jatah ${fmtNum(today.allowance)} kkal (protein ${today.protein} g), air ${today.water} ml, olahraga ${fmtNum(today.exKcal)} kkal, uang ${fmtRp(today.price)}.
Makanan hari ini:
${todayFoods}
7 hari terakhir:
${weekLines}`;
}

const COACH_PROMPT = `Kamu "Coach", pelatih penurunan berat badan pribadi yang TEGAS, disiplin, dan to the point, seperti personal trainer galak tapi peduli. Bahasa Indonesia santai (pakai "lu/gue" boleh, atau "kamu"), kalimat pendek, tanpa basa-basi.

Prinsip:
- Jujur pada data. Kalau pengguna melenceng, tegur langsung dan sebut angkanya. Kalau dia disiplin, akui singkat lalu naikkan standar.
- Selalu beri langkah konkret yang bisa dilakukan hari ini. Saran makanan harus realistis untuk Indonesia (warung, warteg, minimarket, masak sendiri) dan muat di budget harian.
- Tegas bukan kasar: jangan menghina fisik, jangan body shaming, jangan memaki.
- Keamanan: jangan pernah sarankan makan di bawah batas minimum kalori (1500 kkal laki-laki / 1200 perempuan), puasa ekstrem, obat diet, atau olahraga berlebihan. Untuk keluhan medis (pusing berat, nyeri dada, gula darah, dll) suruh ke dokter.
- Jawaban maksimal sekitar 120 kata kecuali diminta detail. Pakai poin kalau memberi daftar.`;

export async function coachReply(history, opts) {
  const msgs = [
    { role: 'system', content: COACH_PROMPT + '\n\n' + coachContext() },
    ...history.slice(-16).map((m) => ({ role: m.role, content: m.content })),
  ];
  return (await chat('text', msgs, { temperature: 0.7, maxTokens: 2000, ...opts })).trim();
}

// Tes key: cocokkan model dengan yang tersedia, lalu kirim pesan pendek. Mengembalikan nama model yang dipakai.
export async function testProvider(provider) {
  const ai = state.ai;
  const key = provider === 'groq' ? ai.groqKey : ai.geminiKey;
  if (!key) throw new AiError('Key belum diisi.');
  await resolveModels(provider);
  const model = provider === 'groq' ? ai.groqModel : ai.geminiModel;
  await chat('text', [{ role: 'user', content: 'Balas satu kata: siap' }], { maxTokens: 400, target: { provider, key, model } });
  return model;
}

// Kecilkan foto ke sisi terpanjang 1024 px supaya cepat dikirim dan hemat kuota.
export function resizeImage(file, max = 1024) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new AiError('Foto tidak bisa dibuka.')); };
    img.src = url;
  });
}
