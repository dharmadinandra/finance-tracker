import { useState, useEffect, useRef, useCallback } from "react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getTransactions, getCategories, saveTransaction, editTransaction, deleteTransaction, readCache, writeCache, describeError } from "./services/api";

// ── PIN LOCK ───────────────────────────────────────────────────────────────
const CORRECT_PIN = "1402"; // ← GANTI dengan PIN kamu

function PinLock({ onUnlock }) 
{
  const [pin, setPin]             = useState("");
  const [shake, setShake]         = useState(false);
  const [attempts, setAttempts]   = useState(0);
  const [locked, setLocked]       = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => 
  {
    if (locked && countdown > 0) 
      {
      const t = setTimeout(() => 
        {
        if (countdown === 1) setLocked(false);
        else setCountdown(c => c - 1);
        }, 1000);
      return () => clearTimeout(t);
      }
  }, [locked, countdown]);

  const handleKey = (k) => 
  {
    if (locked) return;
    if (k === "del") { setPin(p => p.slice(0, -1)); return; }
    const next = pin + k;
    setPin(next);
    if (next.length === 4) 
    {
      if (next === CORRECT_PIN) {
        onUnlock();
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setShake(true);
        setTimeout(() => { setShake(false); setPin(""); }, 600);
        if (newAttempts >= 3) 
          {
          setLocked(true);
          setCountdown(30);
          setAttempts(0);
          }
      }
    }
  };

  const ps = 
  {
    wrap:  { position:"fixed", inset:0, background:"linear-gradient(165deg,#eef2ff 0%,#f8fafc 100%)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", zIndex:9999 },
    logo:  { fontSize:48, marginBottom:8 },
    title: { fontSize:20, fontWeight:700, color:"#0f172a", marginBottom:4 },
    sub:   { fontSize:13, color:"#64748b", marginBottom:36 },
    dots:  { display:"flex", gap:16, marginBottom:36 },
    dot:   (filled) => ({ width:14, height:14, borderRadius:"50%", background: filled?"#6366f1":"#ffffff", border:"2px solid", borderColor: filled?"#6366f1":"#cbd5e1", boxShadow:"0 1px 2px #0001", transition:"all 0.15s" }),
    grid:  { display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, width:240 },
    key:   (special) => ({ height:64, borderRadius:16, border:"none", background: special?"transparent":"#ffffff", boxShadow: special?"none":"0 1px 3px #00000012, 0 4px 12px #0000000a", color: special?"#94a3b8":"#0f172a", fontSize:22, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }),
    err:   { fontSize:12, color:"#ef4444", marginTop:16, height:18 },
    lock:  { fontSize:13, color:"#f59e0b", marginTop:16, textAlign:"center" },
  };

  const keys = ["1","2","3","4","5","6","7","8","9","","0","del"];

  return (
    <div style={ps.wrap}>
      <div style={ps.logo}>🔒</div>
      <div style={ps.title}>Catatan Keuangan</div>
      <div style={ps.sub}>Masukkan PIN untuk melanjutkan</div>

      <div style={{ ...ps.dots, animation: shake ? "shake 0.4s ease" : "none" }}>
        {[0,1,2,3].map(i => <div key={i} style={ps.dot(i < pin.length)} />)}
      </div>

      <div style={ps.grid}>
        {keys.map((k,i) => (
          k === "" ? <div key={i} /> :
          <button key={i} style={ps.key(k==="del")} onClick={()=>handleKey(k)} disabled={locked}>
            {k === "del" ? "⌫" : k}
          </button>
        ))}
      </div>

      {locked
        ? <div style={ps.lock}>⚠️ Terlalu banyak percobaan<br/>Coba lagi dalam {countdown} detik</div>
        : attempts > 0
          ? <div style={ps.err}>PIN salah · {3 - attempts} percobaan tersisa</div>
          : <div style={ps.err} />
      }

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-8px)}
          80%{transform:translateX(8px)}
        }
      `}</style>
    </div>
  );
}

const TYPES = ["Pengeluaran", "Pemasukan"];
const PIE_COLORS = ["#6366f1","#f59e0b","#ec4899","#10b981","#3b82f6","#8b5cf6","#ef4444","#6b7280","#f97316","#14b8a6","#a855f7","#06b6d4"];
const MONTH_NAMES = ["","Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

const CATEGORIES = ["Transportasi","Makanan","Belanja","Hiburan","Kesehatan","Pendidikan","Tagihan","Lainnya","Pemasukan"];

const COLORS = {
  Transportasi:"#6366f1",Makanan:"#f59e0b",Belanja:"#ec4899",
  Hiburan:"#10b981",Kesehatan:"#3b82f6",Pendidikan:"#8b5cf6",
  Tagihan:"#ef4444",Lainnya:"#6b7280"
};

function formatRp(val) {
  const n = Math.abs(Number(val));
  if (n >= 1000000) return "Rp" + (n/1000000).toFixed(1).replace(".0","") + "jt";
  if (n >= 1000) return "Rp" + (n/1000).toFixed(0) + "rb";
  return "Rp" + n.toLocaleString("id-ID");
}

function formatRpFull(val) {
  const n = Math.abs(Number(val));
  return "Rp" + n.toLocaleString("id-ID");
}

function parseTotal(raw) {
  if (typeof raw === "number") return raw;
  if (!raw) return 0;
  const str = String(raw)
    .replace(/Rp/gi, "")
    .replace(/\./g, "")   // remove thousand separators
    .replace(/,/g, ".")   // normalize decimal
    .replace(/\s/g, "")
    .trim();
  return Number(str) || 0;
}

// Normalisasi tanggal ke "YYYY-MM-DD" (tangani format ISO dengan timezone).
function formatDateStr(raw) {
  const s = String(raw || "");
  if (s.includes("T")) {
    const dt = new Date(s);
    dt.setHours(dt.getHours() + 7);
    return dt.toISOString().slice(0, 10);
  }
  return s.slice(0, 10);
}

const MOCK = [
  { No:2,  Date:"2025-08-01", Year:2025, Month:8, Category:"Transportasi", Type:"Pengeluaran", Remarks:"Service Mobil",   Total:-1000000 },
  { No:21, Date:"2025-08-03", Year:2025, Month:8, Category:"Transportasi", Type:"Pengeluaran", Remarks:"Gojek / Grab",    Total:-80500  },
  { No:5,  Date:"2025-08-02", Year:2025, Month:8, Category:"Makanan",      Type:"Pengeluaran", Remarks:"Makan Siang",     Total:-45000  },
  { No:30, Date:"2025-08-07", Year:2025, Month:8, Category:"Pemasukan",    Type:"Pemasukan",   Remarks:"Gaji Bulanan",    Total:8000000 },
  { No:35, Date:"2025-08-09", Year:2025, Month:8, Category:"Tagihan",      Type:"Pengeluaran", Remarks:"Listrik & Air",   Total:-320000 },
  { No:2,  Date:"2025-07-01", Year:2025, Month:7, Category:"Belanja",      Type:"Pengeluaran", Remarks:"Groceries",       Total:-250000 },
  { No:30, Date:"2025-07-07", Year:2025, Month:7, Category:"Pemasukan",    Type:"Pemasukan",   Remarks:"Gaji Bulanan",    Total:8000000 },
];

export default function App() 
{
  const [unlocked, setUnlocked] = useState(false);
  const [tab, setTab]                     = useState("dashboard");
  const [transactions, setTransactions]   = useState([]);
  const [categories, setCategories]       = useState(() => {
    const c = readCache("categories");
    return (c && Array.isArray(c.data) && c.data.length) ? c.data : CATEGORIES;
  });
  const [loading, setLoading]                 = useState(false);
  const [refreshing, setRefreshing]           = useState(false);
  const [dataState, setDataState]             = useState("loading");
  const [errorMsg, setErrorMsg]               = useState("");
  const [lastUpdated, setLastUpdated]         = useState(null);
  const [submitting, setSubmitting]           = useState(false);
  const [toast, setToast]                     = useState(null);
  const [swipedId,  setSwipedId]              = useState(null);
  const [editModal, setEditModal]             = useState(null);
  const [deleteConfirm, setDeleteConfirm]     = useState(null);
  const [editForm, setEditForm]               = useState({});
  const [search, setSearch]                   = useState("");
  const [catDetail, setCatDetail]             = useState(null);
  const [exitOpen, setExitOpen]               = useState(false);
  const [suggestions, setSuggestions]         = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // ── Filters ──────────────────────────────────────────────────────────────
  const [filterYear,  setFilterYear]  = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterCat,   setFilterCat]   = useState("all");
  const [comparisonCat, setComparisonCat] = useState("all");

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    category: CATEGORIES[0],
    type: TYPES[0],
    remarks: "",
    notes: "",
    total: "",
  });

  const isDemo = false;

  const showToast = useCallback((msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchData = useCallback(async (opts = {}) => {
    if (isDemo) { setTransactions(MOCK); setDataState("loaded"); return; }

    const { background = false } = opts;
    if (background) {
      setRefreshing(true);
    } else {
      const cached = readCache("transactions");
      if (cached && Array.isArray(cached.data)) {
        setTransactions(cached.data);
        setLastUpdated(new Date(cached.savedAt));
        setDataState("loaded");
      } else {
        setLoading(true);
      }
    }

    try {
      const data = await getTransactions();
      if (!Array.isArray(data)) throw new Error("bukan array");
      setTransactions(data);
      writeCache("transactions", data);
      setLastUpdated(new Date());
      setDataState("loaded");
    } catch (err) {
      const detail = describeError(err);
      const cached = readCache("transactions");
      if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
        showToast(`Gagal refresh · ${detail}`, false);
      } else {
        setErrorMsg(`Gagal memuat data dari Google Sheets (${detail}). Cek koneksi internet.`);
        setDataState("error");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDemo, showToast]);

  const loadCategories = useCallback(async () => {
    try {
      const d = await getCategories();
      if (Array.isArray(d) && d.length > 0) {
        setCategories(d);
        writeCache("categories", d);
        setForm(f => {
          const valid = f.category && d.includes(f.category);
          return { ...f, category: valid ? f.category : d[0] };
        });
      }
    } catch {
      // offline / error: pakai CATEGORIES fallback
    }
  }, []);

  useEffect(() => {
    const t1 = setTimeout(fetchData, 0);
    const t2 = setTimeout(loadCategories, 0);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [fetchData, loadCategories]);

  // ── Android back button (PWA) ─────────────────────────────────────────────
  const exitRef = useRef(false);
  const exitStateRef = useRef({ editModal, deleteConfirm, catDetail, swipedId, exitOpen });
  useEffect(() => {
    exitStateRef.current = { editModal, deleteConfirm, catDetail, swipedId, exitOpen };
  }, [editModal, deleteConfirm, catDetail, swipedId, exitOpen]);

  useEffect(() => {
    history.replaceState({ sentinel: true }, "");
    history.pushState({ sentinel: true }, "");

    const handleBack = () => {
      if (exitRef.current) return;
      const st = exitStateRef.current;
      if (st.editModal)          { setEditModal(null);          history.pushState({ sentinel: true }, ""); }
      else if (st.deleteConfirm) { setDeleteConfirm(null);      history.pushState({ sentinel: true }, ""); }
      else if (st.catDetail)     { setCatDetail(null);          history.pushState({ sentinel: true }, ""); }
      else if (st.swipedId)      { setSwipedId(null);           history.pushState({ sentinel: true }, ""); }
      else if (!st.exitOpen)     { setExitOpen(true);           history.pushState({ sentinel: true }, ""); }
      // else: exitOpen already true → don't re-push, let the app close
    };

    window.addEventListener("popstate", handleBack);
    return () => window.removeEventListener("popstate", handleBack);
  }, []);

  const cancelExit = () => {
    setExitOpen(false);
    history.pushState({ sentinel: true }, "");
  };

  const confirmExit = () => {
    exitRef.current = true;
    setExitOpen(false);
    window.close();
    // window.close() is blocked in some installed PWAs. If we're still running
    // after a moment, collapse to the root entry and ask the user to press back,
    // which reliably closes the app.
    setTimeout(() => {
      const n = window.history.length - 1;
      if (n > 0) window.history.go(-n);
      showToast("Tekan tombol kembali lagi untuk menutup aplikasi", false);
    }, 300);
  };

  const handleEdit = (t) => 
    {
      const raw = String(t.Date);
      let dateStr;
      if (raw.includes("T")) {
        const dt = new Date(raw);
        dt.setHours(dt.getHours() + 7);
        dateStr = dt.toISOString().slice(0, 10);
      } else {
        dateStr = raw.slice(0, 10);
      }
      setEditForm({
        UUID:     t.UUID,
        No:       t.No,
        date:     dateStr,
        category: t.Category,
        type:     t.Type,
        remarks:  t.Remarks,
        notes:    t.Notes || "",
        total:    Math.abs(parseTotal(t.Total)),
        });
      setEditModal(true);
      setSwipedId(null);
    };
  
  const handleEditSubmit = async () => 
    {
      if (!editForm.remarks || !editForm.total) { showToast("Lengkapi semua field", false); return; }
      setSubmitting(true);
      const payload = 
      { 
          ...editForm,
          total: editForm.type === "Pengeluaran"
          ? -Math.abs(Number(editForm.total))
          :  Math.abs(Number(editForm.total))
      };
      try 
      {
        await editTransaction(payload);
        showToast("Transaksi berhasil diupdate ✓");
        setEditModal(null);
        setTimeout(() => fetchData(),3000);
      } catch (err) 
        {
        showToast(`Gagal mengupdate · ${describeError(err)}`, false);
        fetchData();
        } finally { setSubmitting(false); }
    };

  const handleDelete = async (UUID) => 
    {
    try {
      await deleteTransaction(UUID);
      showToast("Transaksi dihapus ✓");
      setDeleteConfirm(null);
      setSwipedId(null);
      setTimeout(() => fetchData(), 3000);
      } catch (err) 
      {
      showToast(`Gagal menghapus · ${describeError(err)}`, false);
      fetchData();
      }
    };
  
  // ── Suggestion based on history ───────────────────────────────────────────
  const getSuggestions = useCallback((input, category) => {
  if (!input || input.length < 2) return [];
  const q = input.toLowerCase().trim();
  const seen = new Set();
  const results = [];
  transactions
    .filter(t => t.Category === category && t.Remarks)
    .sort((a, b) => {
      const countA = transactions.filter(x => x.Remarks === a.Remarks).length;
      const countB = transactions.filter(x => x.Remarks === b.Remarks).length;
      return countB - countA;
    })
    .forEach(t => {
      const r = String(t.Remarks).trim();
      if (r.toLowerCase().includes(q) && !seen.has(r)) {
        seen.add(r);
        const count = transactions.filter(x => x.Remarks === r && x.Category === category).length;
        results.push({ text: r, count });
      }
    });
  return results.slice(0, 5);
  }, [transactions]);
    
  const handleSubmit = async () => 
    {
      if (!form.remarks || !form.total) { showToast("Lengkapi semua field", false); return; }
      setSubmitting(true);
      const payload = 
      {
        ...form,
        total: form.type === "Pengeluaran"
        ? -Math.abs(Number(form.total))
        : Math.abs(Number(form.total))
      };
      try 
      {
        await saveTransaction(payload);
        showToast("Berhasil disimpan ke Google Sheets ✓");
        setForm(f => ({ ...f, remarks: "", notes: "",total: "" }));
        setTimeout(() => fetchData(),3000);
      } catch (err) 
        {
        showToast(`Gagal menyimpan · ${describeError(err)}`, false);
        fetchData();
        } finally { setSubmitting(false); }
    };

  // ── Derived: available years & months ────────────────────────────────────
  const years  = [...new Set(transactions.map(t => String(t.Year)))].sort().reverse();
  const months = [...new Set(
    transactions
      .filter(t => filterYear === "all" || String(t.Year) === filterYear)
      .map(t => t.Month)
  )].sort((a,b) => a-b);

  // ── Reset month when year changes ─────────────────────────────────────────
  const handleYearChange = (y) => {
    setFilterYear(y);
    setFilterMonth("all");
  };

  // ── Filtered transactions ─────────────────────────────────────────────────
  const filtered = transactions.filter(t => {
  const matchYear   = filterYear  === "all" || String(t.Year)  === filterYear;
  const matchMonth  = filterMonth === "all" || String(t.Month) === filterMonth;
  const matchCat    = filterCat   === "all" || t.Category      === filterCat;
  const q           = (search || "").toLowerCase().trim();
  const matchSearch = q === ""
    || String(t.Remarks  || "").toLowerCase().includes(q)
    || String(t.Category || "").toLowerCase().includes(q)
    || String(Math.abs(parseTotal(t.Total))).includes(q);
  return matchYear && matchMonth && matchCat && matchSearch;
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalIn  = filtered.filter(t => t.Type === "Pemasukan")
  .reduce((s,t) => s + parseTotal(t.Total), 0);
  const totalOut = Math.abs(filtered.filter(t => t.Type === "Pengeluaran")
  .reduce((s,t) => s + parseTotal(t.Total), 0));
  const balance = filtered.reduce((s, t) => s + parseTotal(t.Total), 0);

  // ── Pie chart: spending by category ──────────────────────────────────────
  const allCats = [...new Set(transactions.map(t => t.Category))];
  const byCat = allCats.map(cat => {
    const sum = filtered
      .filter(t => t.Category === cat && t.Type === "Pengeluaran")
      .reduce((s,t) => s + Math.abs(parseTotal(t.Total)), 0);
    return { name: cat, value: sum };
  }).filter(d => d.value > 0).sort((a,b) => b.value - a.value);

  // ── Detail transaksi per kategori (dari klik pie chart) ──────────────────
  const catTransactions = catDetail
    ? filtered
        .filter(t => t.Category === catDetail && t.Type === "Pengeluaran")
        .slice()
        .sort((a,b) => formatDateStr(b.Date) > formatDateStr(a.Date) ? 1 : -1)
    : [];
  const catTotal = catTransactions.reduce((s,t) => s + Math.abs(parseTotal(t.Total)), 0);

  // ── Bar chart: daily cash flow ────────────────────────────────────────────
  const byDay = {};
  filtered.forEach(t => {
    const raw = String(t.Date);
    let d;
    if (raw.includes("T")) {
      const dt = new Date(raw);
      dt.setHours(dt.getHours() + 7);
      d = dt.toISOString().slice(5, 10);
    } else {
      d = raw.slice(5, 10);
    }
    if (!byDay[d]) byDay[d] = { date: d, Pengeluaran: 0, Pemasukan: 0 };
    if (t.Type === "Pengeluaran") byDay[d].Pengeluaran += Math.abs(parseTotal(t.Total));
    else byDay[d].Pemasukan += parseTotal(t.Total);
  });
  const barData = Object.values(byDay).sort((a,b) => a.date > b.date ? 1 : -1).slice(-20);

  // ── Monthly Comparison Data ───────────────────────────────────────────────
    const comparisonData = (() => 
    {
    if (filterMonth === "all") return null;

    const curMonth = Number(filterMonth);
    const curYear  = filterYear === "all" ? null : Number(filterYear);

    let prevMonth = curMonth - 1;
    let prevYear  = curYear;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear  = prevYear ? prevYear - 1 : null;
    }

    const curTx = transactions.filter(t =>
      Number(t.Month) === curMonth &&
      (curYear === null || Number(t.Year) === curYear)
    );

    const prevTx = transactions.filter(t =>
      Number(t.Month) === prevMonth &&
      (prevYear === null || Number(t.Year) === prevYear)
    );

    const curIn   = curTx.filter(t => t.Type === "Pemasukan").reduce((s,t) => s + parseTotal(t.Total), 0);
    const curOut  = Math.abs(curTx.filter(t => t.Type === "Pengeluaran").reduce((s,t) => s + parseTotal(t.Total), 0));
    const prevIn  = prevTx.filter(t => t.Type === "Pemasukan").reduce((s,t) => s + parseTotal(t.Total), 0);
    const prevOut = Math.abs(prevTx.filter(t => t.Type === "Pengeluaran").reduce((s,t) => s + parseTotal(t.Total), 0));

    const outChange = prevOut > 0 ? (((curOut - prevOut) / prevOut) * 100).toFixed(1) : null;
    const inChange  = prevIn  > 0 ? (((curIn  - prevIn)  / prevIn)  * 100).toFixed(1) : null;

    // ── Per-kategori ──────────────────────────────────────────────────────
    const isAllCat = comparisonCat === "all";
    const curCat = isAllCat ? 0 : Math.abs(curTx.filter(t => t.Category === comparisonCat).reduce((s,t) => s + parseTotal(t.Total), 0));
    const prevCat = isAllCat ? 0 : Math.abs(prevTx.filter(t => t.Category === comparisonCat).reduce((s,t) => s + parseTotal(t.Total), 0));
    const catChange = isAllCat ? null : (prevCat > 0 ? (((curCat - prevCat) / prevCat) * 100).toFixed(1) : null);

    return {
      curMonth, prevMonth, curYear, prevYear,
      curIn, curOut, prevIn, prevOut,
      outChange, inChange,
      comparisonCat, isAllCat, curCat, prevCat, catChange,
      curLabel:  MONTH_NAMES[curMonth],
      prevLabel: MONTH_NAMES[prevMonth],
      chartData: isAllCat
        ? [
            {
              name: "Pengeluaran",
              [MONTH_NAMES[prevMonth]]: prevOut,
              [MONTH_NAMES[curMonth]]:  curOut,
            },
            {
              name: "Pemasukan",
              [MONTH_NAMES[prevMonth]]: prevIn,
              [MONTH_NAMES[curMonth]]:  curIn,
            },
          ]
        : [
            {
              name: comparisonCat,
              [MONTH_NAMES[prevMonth]]: prevCat,
              [MONTH_NAMES[curMonth]]:  curCat,
            },
          ]
    };
  })();

  // ── Label for active filter ───────────────────────────────────────────────
  const filterLabel = [
    filterYear  !== "all" ? filterYear : null,
    filterMonth !== "all" ? MONTH_NAMES[Number(filterMonth)] : null,
  ].filter(Boolean).join(" · ") || "Semua Data";

  // ── Styles ────────────────────────────────────────────────────────────────
  const s = {
    app:        { fontFamily:"'Inter',system-ui,sans-serif", background:"#f4f6fb", minHeight:"100vh", color:"#0f172a", width:"100%", maxWidth:"100%", margin:"0 auto", position:"relative", paddingBottom:80, boxSizing:"border-box" },
    header:     { background:"linear-gradient(135deg,#6366f1,#8b5cf6)", padding:"18px 16px 14px" },
    headerRow:  { display:"flex", alignItems:"center", justifyContent:"space-between" },
    headerTitle:{ fontSize:20, fontWeight:700, color:"#ffffff", margin:0 },
    headerSub:  { fontSize:12, color:"#e0e7ff", marginTop:2 },
    section:    { padding:"14px 14px 8px" },
    card:       { background:"#ffffff", borderRadius:16, padding:"14px 16px", marginBottom:10, boxShadow:"0 1px 2px #0f172a0d, 0 6px 20px #0f172a0a" },

    // Filter bar
    filterBlock:{ background:"#ffffff", padding:"12px 14px", marginBottom:10, borderRadius:16, boxShadow:"0 1px 2px #0f172a0d, 0 6px 20px #0f172a0a" },
    filterTitle:{ fontSize:10, color:"#64748b", fontWeight:700, textTransform:"uppercase", marginBottom:8, letterSpacing:"0.05em" },
    filterRow:  { display:"flex", gap:8, marginBottom:8, overflowX:"auto", paddingBottom:2 },
    filterChip: (active) => ({ padding:"6px 14px", borderRadius:20, border:"none", background: active?"#6366f1":"#f1f5f9", color: active?"#fff":"#64748b", cursor:"pointer", fontSize:12, fontWeight:600, whiteSpace:"nowrap", flexShrink:0, boxShadow: active?"0 2px 8px #6366f155":"none" }),

    // Summary
    summaryLabel:{ fontSize:10, color:"#64748b", fontWeight:700, textTransform:"uppercase", marginBottom:12, display:"flex", alignItems:"center", gap:6 },
    statRow:    { display:"flex", gap:8, marginBottom:8 },
    stat:       (color) => ({ flex:1, background:"#f8fafc", borderRadius:12, padding:"10px 12px", borderLeft:`3px solid ${color}` }),
    statLabel:  { fontSize:9, color:"#64748b", fontWeight:700, textTransform:"uppercase" },
    statVal:    (color) => ({ fontSize:14, fontWeight:800, color, marginTop:2 }),
    balCard:    (pos) => ({ background:"linear-gradient(135deg,#6366f1,#8b5cf6)", borderRadius:12, padding:"12px 14px", borderLeft:`3px solid ${pos?"#a5b4fc":"#fcd34d"}`, marginBottom:0 }),
    balLabel:   { fontSize:9, color:"#c7d2fe", fontWeight:700, textTransform:"uppercase" },
    balVal:     { fontSize:20, fontWeight:900, color:"#ffffff", marginTop:2 },

    chartTitle: { fontSize:12, fontWeight:700, color:"#475569", marginBottom:10 },

    // Input form
    label:      { fontSize:11, color:"#64748b", marginBottom:4, display:"block", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em" },
    input:      { width:"100%", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:"10px 12px", color:"#0f172a", fontSize:15, boxSizing:"border-box", outline:"none" },
    select:     { width:"100%", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:"10px 12px", color:"#0f172a", fontSize:15, boxSizing:"border-box", appearance:"none" },
    row:        { display:"flex", gap:10 },
    typeBtn:    (active, type) => ({ flex:1, padding:"10px 8px", borderRadius:10, border:`2px solid ${active?(type==="Pengeluaran"?"#ef4444":"#10b981"):"#e2e8f0"}`, background: active?(type==="Pengeluaran"?"#fee2e2":"#d1fae5"):"#f8fafc", color: active?(type==="Pengeluaran"?"#b91c1c":"#047857"):"#64748b", cursor:"pointer", fontWeight:700, fontSize:14 }),
    submitBtn:  { width:"100%", padding:"14px", borderRadius:12, background: submitting?"#94a3b8":"linear-gradient(135deg,#6366f1,#8b5cf6)", border:"none", color:"#fff", fontSize:16, fontWeight:700, cursor: submitting?"not-allowed":"pointer", marginTop:4, boxShadow: submitting?"none":"0 4px 14px #6366f144" },

    // History
    txItem:     { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #f1f5f9" },
    txLeft:     { flex:1 },
    txName:     { fontSize:13, fontWeight:600, color:"#0f172a" },
    txMeta:     { fontSize:11, color:"#64748b", marginTop:2 },
    txAmt:      (pos) => ({ fontSize:14, fontWeight:700, color: pos?"#059669":"#dc2626" }),
    catDot:     (cat) => ({ width:7, height:7, borderRadius:"50%", background:COLORS[cat]||"#6366f1", display:"inline-block", marginRight:5 }),

    // Nav
    nav:        { position:"fixed", bottom:0, left:0, right:0, width:"100%", background:"#ffffff", borderTop:"1px solid #e5e9f2", display:"flex", zIndex:100, boxShadow:"0 -2px 12px #0f172a08" },
    navBtn:     (active) => ({ flex:1, padding:"12px 0 8px", background:"none", border:"none", color: active?"#6366f1":"#94a3b8", cursor:"pointer", fontSize:10, fontWeight: active?700:400, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }),

    toast:      (ok) => ({ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", background: ok?"#059669":"#dc2626", color:"#fff", padding:"10px 20px", borderRadius:12, fontWeight:700, fontSize:13, zIndex:999, whiteSpace:"nowrap", boxShadow:"0 8px 24px #0004" }),
    errorBanner:{ display:"flex", alignItems:"center", gap:12, margin:"8px 14px 0", background:"#fee2e2", border:"1px solid #fca5a5", borderRadius:12, padding:"10px 12px" },
  };

  return (
    <div style={s.app}>
      {!unlocked && <PinLock onUnlock={() => setUnlocked(true)} />}
      {toast && <div style={s.toast(toast.ok)}>{toast.msg}</div>}

      {/* ── HEADER ── */}
      <div style={s.header}>
        <div style={s.headerRow}>
          <div>
            <p style={s.headerTitle}>💰 Catatan Keuangan</p>
            <p style={s.headerSub}>Personal Finance Tracker</p>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {lastUpdated && !loading && (
              <div style={{fontSize:10,color:"#c7d2fe"}}>Update {lastUpdated.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}</div>
            )}
            {loading && <div style={{fontSize:11,color:"#e0e7ff"}}>Memuat…</div>}
            {refreshing && <div style={{fontSize:11,color:"#fde68a"}}>Menyegarkan…</div>}
            {!loading && !refreshing && (
              <button
                onClick={() => fetchData({ background: true })}
                title="Muat ulang data"
                style={{background:"none",border:"none",color:"#e0e7ff",fontSize:18,cursor:"pointer",lineHeight:1,padding:4}}
              >🔄</button>
            )}
          </div>
        </div>
      </div>

      {dataState === "error" && (
        <div style={s.errorBanner}>
          <div style={{fontSize:12,color:"#b91c1c",flex:1}}>⚠️ {errorMsg}</div>
          <button
            onClick={() => fetchData()}
            style={{background:"#ef4444",border:"none",color:"#fff",padding:"8px 14px",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer"}}
          >🔄 Coba Lagi</button>
        </div>
      )}

      {/* ── DASHBOARD TAB ── */}
      {tab === "dashboard" && (
        <div style={s.section}>

          {/* ── FILTER BLOCK ── */}
          <div style={s.filterBlock}>
            <div style={s.filterTitle}>🔍 Filter</div>

            {/* Year filter */}
            <div style={{fontSize:10,color:"#64748b",marginBottom:4,fontWeight:600}}>TAHUN</div>
            <div style={s.filterRow}>
              <button style={s.filterChip(filterYear==="all")} onClick={()=>handleYearChange("all")}>Semua</button>
              {years.map(y => (
                <button key={y} style={s.filterChip(filterYear===y)} onClick={()=>handleYearChange(y)}>{y}</button>
              ))}
            </div>

            {/* Month filter */}
            <div style={{fontSize:10,color:"#64748b",marginBottom:4,fontWeight:600}}>BULAN</div>
            <div style={s.filterRow}>
              <button style={s.filterChip(filterMonth==="all")} onClick={()=>setFilterMonth("all")}>Semua</button>
              {months.map(m => (
                <button key={m} style={s.filterChip(filterMonth===String(m))} onClick={()=>setFilterMonth(String(m))}>
                  {MONTH_NAMES[m]}
                </button>
              ))}
            </div>
          </div>

          {/* ── SUMMARY CARD ── */}
          <div style={s.card}>
            <div style={s.summaryLabel}>
              <span>📋</span>
              <span>Ringkasan — {filterLabel}</span>
              <span style={{marginLeft:"auto",color:"#475569",fontSize:10}}>{filtered.length} transaksi</span>
            </div>

            <div style={s.statRow}>
              <div style={s.stat("#10b981")}>
                <div style={s.statLabel}>Pemasukan</div>
                <div style={s.statVal("#10b981")}>{formatRp(totalIn)}</div>
              </div>
              <div style={s.stat("#ef4444")}>
                <div style={s.statLabel}>Pengeluaran</div>
                <div style={s.statVal("#ef4444")}>{formatRp(totalOut)}</div>
              </div>
            </div>

            <div style={s.balCard(balance >= 0)}>
              <div style={s.balLabel}>Saldo Bersih</div>
              <div style={s.balVal}>{balance >= 0 ? "+" : "-"}{formatRpFull(balance)}</div>
            </div>
          </div>

          {/* ── BAR CHART ── */}
          <div style={s.card}>
            <div style={s.chartTitle}>📊 Arus Kas Harian</div>
            {barData.length === 0
              ? <div style={{textAlign:"center",color:"#475569",padding:"20px 0",fontSize:12}}>Tidak ada data untuk filter ini</div>
              : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={barData} margin={{top:0,right:0,left:-20,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{fontSize:8,fill:"#94a3b8"}} />
                    <YAxis tick={{fontSize:8,fill:"#94a3b8"}} tickFormatter={v=>`${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={v=>formatRpFull(v)} contentStyle={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:8,color:"#0f172a",fontSize:12}} />
                    <Bar dataKey="Pengeluaran" fill="#ef4444" radius={[3,3,0,0]} />
                    <Bar dataKey="Pemasukan"   fill="#10b981" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )
            }
          </div>

          {/* ── PIE CHART ── */}
          <div style={s.card}>
            <div style={s.chartTitle}>🥧 Pengeluaran per Kategori — {filterLabel}</div>
            {byCat.length === 0
              ? <div style={{textAlign:"center",color:"#475569",padding:"20px 0",fontSize:12}}>Tidak ada pengeluaran untuk filter ini</div>
              : (
                <>
                  <ResponsiveContainer width="100%" height={210}>
                    <PieChart>
                      <Pie
                        data={byCat}
                        dataKey="value"
                        nameKey="name"
                        cx="50%" cy="50%"
                        outerRadius={80}
                        label={({ percent }) => percent > 0.04 ? `${(percent*100).toFixed(0)}%` : ""}
                        labelLine={false}
                        fontSize={9}
                        onClick={(data) => setCatDetail(data.name)}
                        style={{ cursor:"pointer" }}
                      >
                        {byCat.map((_,i) => <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={v=>formatRpFull(v)} contentStyle={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:8,color:"#0f172a",fontSize:12}} />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Legend with amounts */}
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:4}}>
                    {byCat.map((d,i) => (
                      <div key={d.name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 8px",borderRadius:10,cursor:"pointer"}} onClick={() => setCatDetail(d.name)}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{width:10,height:10,borderRadius:"50%",background:PIE_COLORS[i%PIE_COLORS.length],display:"inline-block",flexShrink:0}} />
                          <span style={{fontSize:12,color:"#334155"}}>{d.name}</span>
                        </div>
                        <div style={{display:"flex",gap:10,alignItems:"center"}}>
                          <span style={{fontSize:10,color:"#64748b"}}>{((d.value/totalOut)*100).toFixed(1)}%</span>
                          <span style={{fontSize:12,fontWeight:700,color:"#ef4444"}}>{formatRp(d.value)}</span>
                          <span style={{fontSize:11,color:"#475569"}}>›</span>
                        </div>
                      </div>
                    ))}
                  </div>
                                </>
              )
            }
          </div>      

          {/* ── MONTHLY COMPARISON CHART ── */}
          {comparisonData && (
            <div style={s.card}>
              <div style={s.chartTitle}>
                📅 Perbandingan — {comparisonData.prevLabel} vs {comparisonData.curLabel}
                {comparisonData.comparisonCat !== "all" && ` · ${comparisonData.comparisonCat}`}
              </div>

              {/* Category selector */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, color:"#64748b", fontWeight:700, textTransform:"uppercase", marginBottom:8, letterSpacing:"0.05em" }}>Kategori</div>
                <div style={s.filterRow}>
                  <button style={s.filterChip(comparisonData.comparisonCat === "all")} onClick={() => setComparisonCat("all")}>Semua</button>
                  {categories.map(c => (
                    <button key={c} style={s.filterChip(comparisonData.comparisonCat === c)} onClick={() => setComparisonCat(c)}>{c}</button>
                  ))}
                </div>
              </div>

              {/* Change indicators */}
              {comparisonData.isAllCat ? (
                <div style={{ display:"flex", gap:10, marginBottom:14 }}>
                  <div style={{ flex:1, background:"#fef2f2", borderRadius:12, padding:"10px 12px", borderLeft:"3px solid #ef4444" }}>
                    <div style={{ fontSize:10, color:"#64748b", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Pengeluaran</div>
                    <div style={{ fontSize:13, fontWeight:800, color:"#dc2626" }}>{formatRp(comparisonData.curOut)}</div>
                    {comparisonData.outChange !== null && (
                      <div style={{ fontSize:11, fontWeight:700, marginTop:4, color: Number(comparisonData.outChange) > 0 ? "#dc2626" : "#059669" }}>
                        {Number(comparisonData.outChange) > 0 ? "▲" : "▼"} {Math.abs(comparisonData.outChange)}%
                        <span style={{ color:"#94a3b8", fontWeight:400 }}> vs {comparisonData.prevLabel}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ flex:1, background:"#f0fdf4", borderRadius:12, padding:"10px 12px", borderLeft:"3px solid #10b981" }}>
                    <div style={{ fontSize:10, color:"#64748b", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>Pemasukan</div>
                    <div style={{ fontSize:13, fontWeight:800, color:"#059669" }}>{formatRp(comparisonData.curIn)}</div>
                    {comparisonData.inChange !== null && (
                      <div style={{ fontSize:11, fontWeight:700, marginTop:4, color: Number(comparisonData.inChange) > 0 ? "#059669" : "#dc2626" }}>
                        {Number(comparisonData.inChange) > 0 ? "▲" : "▼"} {Math.abs(comparisonData.inChange)}%
                        <span style={{ color:"#94a3b8", fontWeight:400 }}> vs {comparisonData.prevLabel}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom:14 }}>
                  {(() => {
                    const isIncome = comparisonData.comparisonCat === "Pemasukan";
                    const catPos = Number(comparisonData.catChange) > 0;
                    const catColor = isIncome ? (catPos ? "#059669" : "#dc2626") : (catPos ? "#dc2626" : "#059669");
                    return (
                      <div style={{ background: isIncome ? "#f0fdf4" : "#fef2f2", borderRadius:12, padding:"10px 12px", borderLeft: isIncome ? "3px solid #10b981" : "3px solid #ef4444" }}>
                        <div style={{ fontSize:10, color:"#64748b", fontWeight:700, textTransform:"uppercase", marginBottom:4 }}>{comparisonData.comparisonCat}</div>
                        <div style={{ fontSize:13, fontWeight:800, color: isIncome ? "#059669" : "#dc2626" }}>{formatRp(comparisonData.curCat)}</div>
                        {comparisonData.catChange !== null && (
                          <div style={{ fontSize:11, fontWeight:700, marginTop:4, color: catColor }}>
                            {catPos ? "▲" : "▼"} {Math.abs(comparisonData.catChange)}%
                            <span style={{ color:"#94a3b8", fontWeight:400 }}> vs {comparisonData.prevLabel}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Bar Chart */}
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={comparisonData.chartData} margin={{ top:0, right:0, left:-10, bottom:0 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize:11, fill:"#64748b" }} />
                  <YAxis tick={{ fontSize:9, fill:"#64748b" }} tickFormatter={v => `${(v/1000000).toFixed(1)}jt`} />
                  <Tooltip formatter={(v, name) => [formatRpFull(v), name]} contentStyle={{ background:"#ffffff", border:"1px solid #e2e8f0", borderRadius:8, color:"#0f172a", fontSize:12 }} />
                  <Bar dataKey={comparisonData.prevLabel} fill="#cbd5e1" radius={[4,4,0,0]} />
                  <Bar dataKey={comparisonData.curLabel}  fill="#6366f1" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>

              {/* Previous month summary */}
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:12, padding:"10px 12px", background:"#f8fafc", borderRadius:10 }}>
                <div style={{ fontSize:11, color:"#64748b" }}>{comparisonData.prevLabel} (pembanding)</div>
                {comparisonData.isAllCat ? (
                  <div style={{ display:"flex", gap:16 }}>
                    <span style={{ fontSize:11, color:"#64748b" }}>Out: <span style={{ color:"#dc2626", fontWeight:700 }}>{formatRp(comparisonData.prevOut)}</span></span>
                    <span style={{ fontSize:11, color:"#64748b" }}>In: <span style={{ color:"#059669", fontWeight:700 }}>{formatRp(comparisonData.prevIn)}</span></span>
                  </div>
                ) : (
                  <span style={{ fontSize:11, color:"#64748b" }}>
                    {comparisonData.comparisonCat}:{" "}
                    <span style={{ color: comparisonData.comparisonCat === "Pemasukan" ? "#059669" : "#dc2626", fontWeight:700 }}>{formatRp(comparisonData.prevCat)}</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {!comparisonData && filterMonth === "all" && (
            <div style={{ ...s.card, textAlign:"center", color:"#94a3b8", fontSize:12, padding:"16px" }}>
              📅 Pilih bulan untuk melihat perbandingan dengan bulan sebelumnya
            </div>
          )}
        </div>      
      )}  

      {/* ── INPUT TAB ── */}
      {tab === "input" && (
        <div style={{padding:"14px 14px 8px"}}>
          <div style={s.card}>
            <div style={{marginBottom:14}}>
              <label style={s.label}>Tanggal</label>
              <input type="date" style={s.input} value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} />
            </div>
            <div style={{marginBottom:14}}>
              <label style={s.label}>Jenis Transaksi</label>
              <div style={s.row}>
                {TYPES.map(t => (
                  <button key={t} style={s.typeBtn(form.type===t,t)} onClick={()=>setForm(f=>({...f,type:t}))}>
                    {t==="Pengeluaran" ? "▼ Keluar" : "▲ Masuk"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <label style={s.label}>Kategori</label>
              <select
                style={s.select}
                value={form.category}
                onChange={e => {
                  setForm(f => ({ ...f, category: e.target.value, remarks: "" }));
                  setShowSuggestions(false);
                  setSuggestions([]);
                }}
              >
                {categories.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            
  <div style={{ marginBottom:14, position:"relative" }}>
    <label style={s.label}>Keterangan</label>
    <input
    type="text"
    placeholder="mis. Bensin Motor, Makan Siang…"
    style={s.input}
    value={form.remarks}
    onChange={e => {
      const val = e.target.value;
      setForm(f => ({ ...f, remarks: val }));
      const sugg = getSuggestions(val, form.category);
      setSuggestions(sugg);
      setShowSuggestions(sugg.length > 0 && val.length >= 2);
    }}
    onFocus={() => {
      if (form.remarks.length >= 2) {
        const sugg = getSuggestions(form.remarks, form.category);
        setSuggestions(sugg);
        setShowSuggestions(sugg.length > 0);
      }
    }}
    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
    autoComplete="off"
  />

  {/* Suggestion Dropdown */}
  {showSuggestions && suggestions.length > 0 && (
    <div style={{
      position:"absolute",
      top:"100%",
      left:0,
      right:0,
      background:"#ffffff",
      border:"1px solid #e2e8f0",
      borderRadius:12,
      boxShadow:"0 8px 24px #0f172a15",
      zIndex:500,
      overflow:"hidden",
      marginTop:4,
      }}>
        {suggestions.map((sg, i) => (
        <div
          key={i}
          onMouseDown={() => {
            setForm(f => ({ ...f, remarks: sg.text }));
            setShowSuggestions(false);
            setSuggestions([]);
          }}
          style={{
            display:"flex",
            justifyContent:"space-between",
            alignItems:"center",
            padding:"10px 14px",
            borderBottom: i < suggestions.length - 1 ? "1px solid #f1f5f9" : "none",
            cursor:"pointer",
            background:"#ffffff",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
          onMouseLeave={e => e.currentTarget.style.background = "#ffffff"}
          >
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:14 }}>🕐</span>
            <span style={{ fontSize:14, color:"#0f172a", fontWeight:500 }}>{sg.text}</span>
          </div>
          <span style={{
            fontSize:10,
            color:"#6366f1",
            fontWeight:700,
            background:"#eef2ff",
            padding:"2px 8px",
            borderRadius:20,
            }}>
            {sg.count}x
          </span>
        </div>
        ))}
        <div style={{
        padding:"6px 14px",
        fontSize:10,
        color:"#94a3b8",
        background:"#f8fafc",
        borderTop:"1px solid #f1f5f9",
        textAlign:"center",
        }}>
              Berdasarkan riwayat {form.category}
          </div>
        </div>
      )}
  </div>

          {/* Notes */}
          <div style={{marginBottom:14}}>
              <label style={s.label}>
                  Catatan
                  <span style={{color:"#94a3b8",fontWeight:400,textTransform:"none",fontSize:10,marginLeft:6}}>(opsional)</span>
              </label>
              <textarea
                  placeholder="mis. Full tank Shell Kelapa Gading, harga naik…"
                  style={{
                      ...s.input,
                      minHeight:68,
                      resize:"none",
                      lineHeight:1.5,
                      fontFamily:"inherit",
                  }}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
          </div>

          {/* Jumlah */}
          <div style={{marginBottom:18}}>
            <label style={s.label}>Jumlah (Rp)</label>
              <input type="number" placeholder="mis. 55000" inputMode="numeric" style={s.input} value={form.total} onChange={e=>setForm(f=>({...f,total:e.target.value}))} />
          </div>
          <button style={s.submitBtn} onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Menyimpan…" : "💾 Simpan ke Google Sheets"}
            </button>
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === "history" && 
        (
          <div style={{padding:"14px 14px 8px"}}>
            {/* Search Bar */}
          <div style={{ marginBottom:10, position:"relative" }}>
            <input
              type="text"
              placeholder="🔍 Cari transaksi, kategori, jumlah..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width:"100%",
                background:"#ffffff",
                border:"1px solid #e2e8f0",
                borderRadius:12,
                padding:"12px 40px 12px 16px",
                color:"#0f172a",
                fontSize:14,
                boxSizing:"border-box",
                outline:"none",
                boxShadow:"0 1px 2px #0f172a0d",
              }}
            />
            {search !== "" && (
              <button
                onClick={() => setSearch("")}
                style={{
                  position:"absolute",
                  right:12,
                  top:"50%",
                  transform:"translateY(-50%)",
                  background:"none",
                  border:"none",
                  color:"#64748b",
                  fontSize:18,
                  cursor:"pointer",
                  lineHeight:1,
                }}
              >✕</button>
            )}
          </div>
            {/* Category filter */}
            <div style={{...s.filterBlock, marginBottom:10}}>
            <div style={s.filterTitle}>🔍 Filter Kategori</div>
            <div style={s.filterRow}>
              <button style={s.filterChip(filterCat==="all")} onClick={()=>setFilterCat("all")}>Semua</button>
              {categories.map(c=>(
                <button key={c} style={s.filterChip(filterCat===c)} onClick={()=>setFilterCat(c)}>{c}</button>
              ))}
            </div>
          </div>

          <div style={s.card}>
            <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>
             {search
              ? `${filtered.length} hasil untuk "${search}"`
              : `${filtered.length} transaksi ditemukan`
            }
            </div>
            {loading && <div style={{textAlign:"center",color:"#64748b",padding:20}}>Memuat…</div>}
            {!loading && filtered.slice().reverse().slice(0,100).map((t,i) => 
              {
                  const amt = parseTotal(t.Total);
                  const raw = String(t.Date);
                  let dateStr;
                  if (raw.includes("T")) 
                    {
                    const dt = new Date(raw);
                    dt.setHours(dt.getHours() + 7);
                    dateStr = dt.toISOString().slice(0, 10);
                    } else 
                      {
                        dateStr = raw.slice(0, 10);
                      }
                  const isOpen = swipedId === t.UUID;

                  return (
                    <div key={i} style={{ position:"relative", overflow:"hidden", borderBottom:"1px solid #f1f5f9" }}>
                      {/* Action buttons revealed when swiped */}
                      <div style={{ position:"absolute", right:0, top:0, bottom:0, display:"flex", alignItems:"stretch" }}>
                        <button
                          onClick={() => handleEdit(t)}
                          style={{ background:"#6366f1", color:"#fff", border:"none", padding:"0 18px", fontSize:12, fontWeight:700, cursor:"pointer" }}
                        >✏️ Edit
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(t)}
                          style={{ background:"#ef4444", color:"#fff", border:"none", padding:"0 18px", fontSize:12, fontWeight:700, cursor:"pointer" }}
                        >🗑️ Hapus
                        </button>
                      </div>

                      {/* Transaction row - slides left on tap */}
                      <div
                        style=
                        {{
                          ...s.txItem,
                          borderBottom:"none",
                          background:"#ffffff",
                          transform: isOpen ? "translateX(-140px)" : "translateX(0)",
                          transition:"transform 0.25s ease",
                          cursor:"pointer"
                        }}
                        onClick={() => setSwipedId(isOpen ? null : t.UUID)}
                        >
                        <div style={s.txLeft}>
                          <div style={s.txName}>
                            <span style={s.catDot(t.Category)} />
                            {t.Remarks}
                          </div>
                          <div style={s.txMeta}>{t.Category} · {dateStr}</div>
                          {t.Notes && (
                              <div style={{
                                  fontSize:10,
                                  color:"#6366f1",
                                  marginTop:3,
                                  fontStyle:"italic",
                                  display:"flex",
                                  alignItems:"center",
                                  gap:4,
                              }}>
                                  <span>📝</span>
                                  <span>{String(t.Notes).length > 40 ? String(t.Notes).slice(0,40) + "…" : t.Notes}</span>
                              </div>
                          )}
                        </div>
                        <div style={s.txAmt(amt > 0)}>{amt > 0 ? "+" : ""}{formatRpFull(amt)}</div>
                        <div style={{ fontSize:11, color:"#475569", marginLeft:8 }}>›</div>
                      </div>
                    </div>
                  );
                } 
              )
            } 
            {!loading && filtered.length === 0 && 
              (
              <div style={{textAlign:"center",color:"#64748b",padding:20}}>Tidak ada transaksi</div>
              )
            }
          </div>
        </div>
        )
      }

      {/* ── NAV ── */}

      {/* ── DELETE CONFIRM ── */}
        {deleteConfirm && 
          (
            <div style={{ position:"fixed", inset:0, background:"#0f172a88", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:24 }}>
              <div style={{ background:"#ffffff", borderRadius:20, padding:24, width:"100%", boxShadow:"0 20px 50px #0f172a33" }}>
                <div style={{ fontSize:16, fontWeight:700, color:"#0f172a", marginBottom:8 }}>🗑️ Hapus Transaksi?</div>
                <div style={{ fontSize:13, color:"#64748b", marginBottom:6 }}>
                  {deleteConfirm.Remarks}
                </div>
                <div style={{ fontSize:13, color:"#dc2626", fontWeight:700, marginBottom:20 }}>
                  {formatRpFull(parseTotal(deleteConfirm.Total))}
                </div>
                <div style={{ display:"flex", gap:10 }}>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    style={{ flex:1, padding:"12px", borderRadius:12, border:"1px solid #e2e8f0", background:"#f8fafc", color:"#64748b", fontSize:14, cursor:"pointer" }}
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => handleDelete(deleteConfirm.UUID)}
                    style={{ flex:1, padding:"12px", borderRadius:12, border:"none", background:"#ef4444", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            </div>
          )
        }

      {/* ── EXIT CONFIRM ── */}
        {exitOpen && 
          (
            <div style={{ position:"fixed", inset:0, background:"#0f172a88", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:24 }}>
              <div style={{ background:"#ffffff", borderRadius:20, padding:24, width:"100%", boxShadow:"0 20px 50px #0f172a33" }}>
                <div style={{ fontSize:16, fontWeight:700, color:"#0f172a", marginBottom:8 }}>👋 Keluar dari Aplikasi?</div>
                <div style={{ fontSize:13, color:"#64748b", marginBottom:20 }}>
                  Yakin ingin menutup Catatan Keuangan?
                </div>
                <div style={{ display:"flex", gap:10 }}>
                  <button
                    onClick={cancelExit}
                    style={{ flex:1, padding:"12px", borderRadius:12, border:"1px solid #e2e8f0", background:"#f8fafc", color:"#64748b", fontSize:14, cursor:"pointer" }}
                  >
                    Batal
                  </button>
                  <button
                    onClick={confirmExit}
                    style={{ flex:1, padding:"12px", borderRadius:12, border:"none", background:"#ef4444", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}
                  >
                    Keluar
                  </button>
                </div>
              </div>
            </div>
          )
        }

      {/* ── EDIT MODAL ── */}
        {editModal && 
          (
          <div style={{ position:"fixed", inset:0, background:"#0f172a88", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:999 }}>
            <div style={{ background:"#ffffff", borderRadius:"20px 20px 0 0", padding:24, width:"100%", maxHeight:"90vh", overflowY:"auto" }}>
              
              {/* Header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                <div style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>✏️ Edit Transaksi</div>
                <button
                  onClick={() => setEditModal(null)}
                  style={{ background:"none", border:"none", color:"#64748b", fontSize:24, cursor:"pointer", lineHeight:1 }}
                >✕</button>
              </div>

              {/* Date */}
              <div style={{ marginBottom:14 }}>
                <label style={s.label}>Tanggal</label>
                <input
                  type="date"
                  style={s.input}
                  value={editForm.date}
                  onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                />
              </div>

              {/* Type */}
              <div style={{ marginBottom:14 }}>
                <label style={s.label}>Jenis Transaksi</label>
                <div style={s.row}>
                  {TYPES.map(t => (
                    <button
                      key={t}
                      style={s.typeBtn(editForm.type === t, t)}
                      onClick={() => setEditForm(f => ({ ...f, type: t }))}
                    >
                      {t === "Pengeluaran" ? "▼ Keluar" : "▲ Masuk"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div style={{ marginBottom:14 }}>
                <label style={s.label}>Kategori</label>
                <select
                  style={s.select}
                  value={editForm.category}
                  onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                >
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              {/* Remarks */}
              <div style={{ marginBottom:14 }}>
                <label style={s.label}>Keterangan</label>
                <input
                  type="text"
                  style={s.input}
                  value={editForm.remarks}
                  onChange={e => setEditForm(f => ({ ...f, remarks: e.target.value }))}
                />
              </div>

              {/* Notes */}
              <div style={{ marginBottom:14 }}>
                  <label style={s.label}>
                      Catatan
                      <span style={{color:"#94a3b8",fontWeight:400,textTransform:"none",fontSize:10,marginLeft:6}}>(opsional)</span>
                  </label>
                  <textarea
                      placeholder="Tambahkan catatan tambahan…"
                      style={{
                          ...s.input,
                          minHeight:68,
                          resize:"none",
                          lineHeight:1.5,
                          fontFamily:"inherit",
                      }}
                      value={editForm.notes || ""}
                      onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  />
              </div>    

              {/* Total */}
              <div style={{ marginBottom:20 }}>
                <label style={s.label}>Jumlah (Rp)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  style={s.input}
                  value={editForm.total}
                  onChange={e => setEditForm(f => ({ ...f, total: e.target.value }))}
                />
              </div>

              {/* Submit */}
              <button
                style={s.submitBtn}
                onClick={handleEditSubmit}
                disabled={submitting}
              >
                {submitting ? "Menyimpan…" : "💾 Simpan Perubahan"}
              </button>

            </div>
          </div>
          )
        }

      {/* ── CATEGORY DETAIL MODAL ── */}
        {catDetail && 
          (
          <div style={{ position:"fixed", inset:0, background:"#0f172a88", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:999 }} onClick={() => setCatDetail(null)}>
            <div style={{ background:"#ffffff", borderRadius:"20px 20px 0 0", padding:24, width:"100%", maxHeight:"85vh", overflowY:"auto", boxSizing:"border-box" }} onClick={e => e.stopPropagation()}>
              
              {/* Header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>{catDetail}</div>
                  <div style={{ fontSize:11, color:"#64748b", marginTop:4 }}>{filterLabel} · {catTransactions.length} transaksi</div>
                </div>
                <button
                  onClick={() => setCatDetail(null)}
                  style={{ background:"none", border:"none", color:"#64748b", fontSize:24, cursor:"pointer", lineHeight:1 }}
                >✕</button>
              </div>

              {/* Total */}
              <div style={{ background:"linear-gradient(135deg,#fee2e2,#fff7ed)", borderRadius:12, padding:"12px 14px", borderLeft:"3px solid #ef4444", marginBottom:16 }}>
                <div style={{ fontSize:9, color:"#b91c1c", fontWeight:700, textTransform:"uppercase" }}>Total Pengeluaran</div>
                <div style={{ fontSize:20, fontWeight:900, color:"#dc2626", marginTop:2 }}>{formatRpFull(catTotal)}</div>
              </div>

              {/* List */}
              {catTransactions.length === 0
                ? <div style={{ textAlign:"center", color:"#64748b", padding:"24px 0", fontSize:12 }}>Tidak ada transaksi untuk filter ini</div>
                : catTransactions.map((t,i) => {
                    const amt = Math.abs(parseTotal(t.Total));
                    return (
                      <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #f1f5f9" }}>
                        <div style={{ flex:1, paddingRight:12 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:"#0f172a" }}>{t.Remarks}</div>
                          <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{formatDateStr(t.Date)}</div>
                          {t.Notes && (
                              <div style={{ fontSize:11, color:"#6366f1", marginTop:3, fontStyle:"italic" }}>
                                  📝 {t.Notes}
                              </div>
                          )}
                        </div>
                        <div style={{ fontSize:14, fontWeight:700, color:"#dc2626", whiteSpace:"nowrap" }}>−{formatRpFull(amt)}</div>
                      </div>
                    );
                  })
              }
            </div>
          </div>
          )
        }

      <nav style={s.nav}>
        {[
          {id:"dashboard",icon:"📊",label:"Dashboard"},
          {id:"input",    icon:"➕",label:"Tambah"},
          {id:"history",  icon:"📋",label:"Riwayat"},
        ].map(n => (
          <button key={n.id} style={s.navBtn(tab===n.id)} onClick={() => { setTab(n.id); setSearch(""); }}>
            <span style={{fontSize:20}}>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}