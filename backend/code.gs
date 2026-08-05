/**********************************************
 * FINANCE TRACKER — Google Apps Script backend
 *
 * Cara pakai:
 *  1) Deploy sebagai Web App:
 *       - Execute as: "Me"
 *       - Who has access: "Anyone"
 *     (script ini cocok untuk script yang terikat pada spreadsheet
 *      atau standalone — kalau standalone, isi SPREADSHEET_ID di bawah.)
 *  2) Skema sheet "Transactions" (11 kolom):
 *       UUID | CreatedAt | UpdatedAt | No | Date | Year | Month
 *       | Category | Type | Remarks | Total
 *  3) Sheet "Master_Category": kolom A = nama kategori,
 *       kolom B = "Y" berarti aktif.
 *
 * Optimasi dibanding versi sebelumnya:
 *  - Hanya membaca baris yang benar-benar berisi data
 *    (tahan terhadap sel kosong yang "terformat" sehingga
 *     getLastRow()/getDataRange() membengkak dan jadi sangat lambat).
 *  - Hasil baca di-cache 5 menit via CacheService; di-invalidate
 *    setiap ada add/edit/delete.
 *  - Filter/sort siap di sisi server (year/month/category/q).
 *  - Respons JSON resmi + status success/error yang bisa dibaca browser.
 **********************************************/

const SPREADSHEET_ID = "1G9JENcz5KuQDMz6jQdMRS2gisFvd-1yTC3bf9n-VeCU";
const SHEET_NAME = "Transactions";
const CATEGORY_SHEET = "Master_Category";
const COL_COUNT = 11;

const CACHE_TX = "ft_tx_v2";
const CACHE_CAT = "ft_cat_v2";
const CACHE_TTL = 300; // 5 menit

// CacheService limit ~100 KB per key. Data transaksi bisa lebih besar,
// jadi kita pecah ke beberapa key (~80 KB) dan rakit ulang saat baca.
const CACHE_CHUNK = 80000;

function cacheGetBig(key) {
  try {
    const cache = CacheService.getScriptCache();
    const keysRaw = cache.get(key + "::keys");
    if (!keysRaw) return cache.get(key); // kasus kecil: satu key

    const keys = JSON.parse(keysRaw);
    const parts = [];
    for (let i = 0; i < keys.length; i++) {
      const p = cache.get(keys[i]);
      if (!p) return null;
      parts.push(p);
    }
    return parts.join("");
  } catch (e) {
    return null;
  }
}

function cachePutBig(key, obj) {
  try {
    const cache = CacheService.getScriptCache();
    const json = JSON.stringify(obj);
    cache.remove(key + "::keys");
    if (json.length <= CACHE_CHUNK) {
      cache.put(key, json, CACHE_TTL);
      return;
    }
    const chunkKeys = [];
    for (let i = 0; i < json.length; i += CACHE_CHUNK) {
      const k = key + "::" + chunkKeys.length;
      cache.put(k, json.substr(i, CACHE_CHUNK), CACHE_TTL);
      chunkKeys.push(k);
    }
    cache.put(key + "::keys", JSON.stringify(chunkKeys), CACHE_TTL);
    cache.remove(key);
  } catch (e) {
    // Cache gagal (kuota dll) → jangan blokir respons, cukup lewati.
  }
}

function cacheRemoveBig(key) {
  try {
    const cache = CacheService.getScriptCache();
    const keysRaw = cache.get(key + "::keys");
    cache.remove(key);
    cache.remove(key + "::keys");
    if (keysRaw) {
      try { cache.removeAll(JSON.parse(keysRaw)); } catch (e) {}
    }
  } catch (e) {}
}

// ── Dasar ──────────────────────────────────────────────────────────────────
function getSS_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet_() {
  const sheet = getSS_().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("Sheet '" + SHEET_NAME + "' tidak ditemukan");
  return sheet;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseDate(dateStr) {
  const parts = String(dateStr).split("T")[0].split("-");
  return {
    year:  parseInt(parts[0]),
    month: parseInt(parts[1]),
    day:   parseInt(parts[2]),
    dateObj: new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])),
  };
}

// Cari baris terakhir yang benar-benar ada data (kolom A = UUID).
// Scan dari bawah atas; tidak bergantung pada getLastRow() yang bisa
// membengkak karena baris terformat tapi kosong.
function getLastDataRow_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 1;
  const colA = sheet.getRange(1, 1, lastRow, 1).getValues();
  for (let i = lastRow - 1; i >= 0; i--) {
    if (String(colA[i][0]).trim() !== "") return i + 1;
  }
  return 1;
}

// Baca HANYA baris berisi data.
function readRows_() {
  const sheet = getSheet_();
  const lastDataRow = getLastDataRow_();
  if (lastDataRow < 2) return [];
  return sheet.getRange(1, 1, lastDataRow, COL_COUNT).getValues();
}

function rowsToObjects_(rows) {
  const headers = rows[0].map(String);
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const obj = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = rows[i][j];
    out.push(obj);
  }
  return out;
}

// ── Baca data + cache server ───────────────────────────────────────────────
function getTransactionsCached_() {
  const cached = cacheGetBig(CACHE_TX);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* lanjut baca ulang */ }
  }
  const data = rowsToObjects_(readRows_())
    .filter(function (t) {
      return String(t.UUID || "").trim() !== "" && String(t.Date || "").trim() !== "";
    });
  cachePutBig(CACHE_TX, data);
  return data;
}

function getCategoriesCached_() {
  const cached = cacheGetBig(CACHE_CAT);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* lanjut */ }
  }
  const sheet = getSS_().getSheetByName(CATEGORY_SHEET);
  const rows = sheet ? sheet.getDataRange().getValues() : [];
  const cats = rows
    .slice(1)
    .filter(function (r) { return String(r[1]).trim().toUpperCase() === "Y"; })
    .map(function (r) { return String(r[0]).trim(); })
    .filter(function (c) { return c; });
  cachePutBig(CACHE_CAT, cats);
  return cats;
}

// ── GET Router ─────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = params.action || "transactions";

    if (action === "transactions")  return json_(getTransactionsFiltered_(params));
    if (action === "getCategories") return json_(getCategoriesCached_());

    return json_({ success: false, message: "Unknown action: " + action });
  } catch (err) {
    return json_({ success: false, error: err.toString() });
  }
}

// Filter opsional (year/month/category/q) — aplikasi bisa memanfaatkannya
// untuk payload kecil; tanpa param berarti kembalikan semua.
function getTransactionsFiltered_(params) {
  const all = getTransactionsCached_();
  const year = String(params.year || "");
  const month = String(params.month || "");
  const category = String(params.category || "");
  const q = String(params.q || "").toLowerCase();

  if (!year && !month && !category && !q) return all;

  return all.filter(function (t) {
    if (year && String(t.Year) !== year) return false;
    if (month && String(t.Month) !== month) return false;
    if (category && String(t.Category) !== category) return false;
    if (q) {
      const hay = (String(t.Remarks || "") + " " + String(t.Category || "") + " " +
        Math.abs(Number(t.Total))).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}

// ── POST Router ────────────────────────────────────────────────────────────
function doPost(e) {
  let data;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return json_({ success: false, error: "Body bukan JSON" });
  }

  try {
    const action = data.action || "add";
    let result;
    if (action === "add")         result = addTransaction(data);
    else if (action === "edit")   result = editTransaction(data);
    else if (action === "delete") result = deleteTransaction(data);
    else return json_({ success: false, message: "Unknown action: " + action });

    // Data berubah → cache harus dibaca ulang lain kali.
    cacheRemoveBig(CACHE_TX);
    return result;
  } catch (err) {
    return json_({ success: false, error: err.toString() });
  }
}

// ── Operasi tulis ──────────────────────────────────────────────────────────
function getNextNo_() {
  const rows = readRows_();
  let max = 0;
  for (let i = 1; i < rows.length; i++) {
    const n = Number(rows[i][3]);
    if (!isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

function addTransaction(data) {
  const sheet = getSheet_();
  const { year, month } = parseDate(data.date);
  const now = new Date();
  const uuid = data.UUID || Utilities.getUuid();

  sheet.appendRow([
    uuid, now, now, getNextNo_(),
    data.date, year, month,
    data.category, data.type, data.remarks, Number(data.total)
  ]);

  normalizeSheet(sheet);
  return json_({ success: true });
}

function editTransaction(data) {
  const sheet = getSheet_();
  const rows = readRows_();
  const { year, month } = parseDate(data.date);
  const now = new Date();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.UUID)) {
      const rowNum = i + 1;
      sheet.getRange(rowNum, 1, 1, COL_COUNT).setValues([[
        rows[i][0],                 // UUID — tetap
        rows[i][1],                 // CreatedAt — tetap
        now,                        // UpdatedAt — diperbarui
        rows[i][3],                 // No — akan direnumber ulang normalizeSheet
        data.date,
        year,
        month,
        data.category,
        data.type,
        data.remarks,
        Number(data.total)
      ]]);
      normalizeSheet(sheet);
      return json_({ success: true });
    }
  }

  return json_({ success: false, message: "Row not found" });
}

function deleteTransaction(data) {
  const sheet = getSheet_();
  const rows = readRows_();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.UUID)) {
      sheet.deleteRow(i + 1);
      normalizeSheet(sheet);
      return json_({ success: true });
    }
  }

  return json_({ success: false, message: "Row not found" });
}

// ── Normalize Sheet: sort by Date, renumber No ─────────────────────────────
function normalizeSheet(sheet) {
  const lastDataRow = getLastDataRow_();
  if (lastDataRow <= 2) return;

  const range = sheet.getRange(2, 1, lastDataRow - 1, COL_COUNT);
  const values = range.getValues();

  function toComparableDate(raw) {
    const str = String(raw).split("T")[0].trim();

    // Format DD/MM/YYYY
    if (str.indexOf("/") !== -1) {
      const parts = str.split("/");
      if (parts.length === 3) {
        const day = parts[0].padStart(2, "0");
        const month = parts[1].padStart(2, "0");
        const year = parts[2];
        return year + "-" + month + "-" + day;
      }
    }

    // Format YYYY-MM-DD (sudah benar)
    if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;

    // Fallback: parse sebagai Date
    const d = new Date(raw);
    if (!isNaN(d)) {
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }

    return str;
  }

  // Sort ascending by date
  values.sort(function (a, b) {
    const da = toComparableDate(a[4]);
    const db = toComparableDate(b[4]);
    return da > db ? 1 : da < db ? -1 : 0;
  });

  // Renumber No dan perbaiki Year/Month
  values.forEach(function (row, index) {
    row[3] = index + 1; // No
    const normalized = toComparableDate(row[4]);
    const parts = normalized.split("-");
    if (parts.length === 3) {
      row[5] = parseInt(parts[0]); // Year
      row[6] = parseInt(parts[1]); // Month
    }
  });

  range.setValues(values);
}
