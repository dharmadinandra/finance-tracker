const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw4DyIXu0RYzZSG1wm434wOFKhNdknyYNEVg7TNC2kq46ptHuno2aGndhnKpmYpSTWSlw/exec";

// ── Cache helpers (localStorage) ──────────────────────────────────────────
const CACHE_PREFIX = "finance-cache:";

export function readCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ savedAt: new Date().toISOString(), data }));
  } catch {
    // storage unavailable (private mode / full): ignore
  }
}

// ── Error description helper ──────────────────────────────────────────────
export function describeError(err) {
  if (!err) return "kesalahan tidak diketahui";
  if (err.name === "AbortError") return "waktu habis";
  if (err instanceof TypeError && err.message.includes("fetch")) return "tidak ada koneksi internet";
  const msg = String(err.message || err).trim();
  if (!msg || msg === "undefined") return "kesalahan tidak diketahui";
  return msg;
}

// ── Retry helper ──────────────────────────────────────────────────────────
async function fetchWithRetry(url, options = {}, retries = 3, delayMs = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      console.warn(`Attempt ${i + 1} failed with status ${res.status}, retrying...`);
    } catch (err) {
      console.warn(`Attempt ${i + 1} network error:`, err);
      if (i === retries - 1) throw err;
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error("All retry attempts failed");
}

// ── GET Transactions ──────────────────────────────────────────────────────
export async function getTransactions() {
  const res  = await fetchWithRetry(`${APPS_SCRIPT_URL}?action=transactions`);
  const data = await res.json();
  return data;
}

// ── GET Categories ────────────────────────────────────────────────────────
export async function getCategories() {
  const res  = await fetchWithRetry(`${APPS_SCRIPT_URL}?action=getCategories`);
  const data = await res.json();
  return data;
}

// ── ADD Transaction ───────────────────────────────────────────────────────
export async function saveTransaction(payload) {
  await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    mode:   "no-cors",
    body:   JSON.stringify({ ...payload, action: "add" }),
  });
  return { success: true };
}

// ── EDIT Transaction ──────────────────────────────────────────────────────
export async function editTransaction(payload) {
  await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    mode:   "no-cors",
    body:   JSON.stringify({ ...payload, action: "edit" }),
  });
  return { success: true };
}

// ── DELETE Transaction ────────────────────────────────────────────────────
export async function deleteTransaction(uuid) {
  await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    mode:   "no-cors",
    body:   JSON.stringify({ action: "delete", UUID: uuid }),
  });
  return { success: true };
}