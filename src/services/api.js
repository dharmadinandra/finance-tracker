const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw4DyIXu0RYzZSG1wm434wOFKhNdknyYNEVg7TNC2kq46ptHuno2aGndhnKpmYpSTWSlw/exec";

const TIMEOUT_MS = 20000;

function buildUrl(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, v);
  });
  const qs = q.toString();
  return qs ? `${APPS_SCRIPT_URL}?${qs}` : APPS_SCRIPT_URL;
}

function withTimeout(url, options, timeout = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function parseJson(res) {
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Respons server bukan JSON");
  }
  if (data && data.success === false) {
    throw new Error(data.message || data.error || "Request gagal");
  }
  return data;
}

// ── Client-side cache (localStorage) ───────────────────────────────────────
const CACHE_KEYS = {
  transactions: "ft_v1_transactions",
  categories: "ft_v1_categories",
};
const CACHE_TTL_MS = 5 * 60 * 1000;

export function readCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_KEYS[key]);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || !Array.isArray(entry.data)) return null;
    return entry;
  } catch {
    return null;
  }
}

export function writeCache(key, data) {
  try {
    localStorage.setItem(CACHE_KEYS[key], JSON.stringify({
      data,
      savedAt: Date.now(),
      version: 1,
    }));
  } catch {
    // storage penuh / private mode: abaikan
  }
}

export function isCacheFresh(entry, ttl = CACHE_TTL_MS) {
  return !!(entry && (Date.now() - entry.savedAt) < ttl);
}

// ── Reads ──────────────────────────────────────────────────────────────────
export async function getTransactions(params = {}) {
  const url = buildUrl({ action: "transactions", ...params });
  const res = await withTimeout(url, { method: "GET" });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const data = await parseJson(res);
  if (!Array.isArray(data)) throw new Error("Data bukan array");
  return data;
}

export async function getCategories() {
  const url = buildUrl({ action: "getCategories" });
  const res = await withTimeout(url, { method: "GET" });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const data = await parseJson(res);
  if (data && data.error) throw new Error(data.error);
  if (!Array.isArray(data)) throw new Error("Data bukan array");
  return data;
}

// ── Writes ─────────────────────────────────────────────────────────────────
// POST body dikirim sebagai text/plain (request "simple", tanpa CORS preflight)
// agar Apps Script bisa merespons dan browser bisa membaca hasilnya.
async function postAction(payload) {
  const res = await withTimeout(APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const data = await parseJson(res);
  if (!data || data.success !== true) {
    throw new Error((data && data.error) || "Operasi gagal");
  }
  return data;
}

export async function saveTransaction(payload) {
  await postAction({ ...payload, action: "add" });
  return { success: true };
}

export async function editTransaction(payload) {
  await postAction({ ...payload, action: "edit" });
  return { success: true };
}

export async function deleteTransaction(uuid) {
  await postAction({ action: "delete", UUID: uuid });
  return { success: true };
}
