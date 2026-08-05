import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getTransactions, getCategories, saveTransaction, editTransaction, deleteTransaction } from "./services/api";

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
      const t = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
      }
    if (locked && countdown === 0) setLocked(false);
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
    wrap:  { position:"fixed", inset:0, background:"#0f172a", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", zIndex:9999 },
    logo:  { fontSize:48, marginBottom:8 },
    title: { fontSize:20, fontWeight:700, color:"#f8fafc", marginBottom:4 },
    sub:   { fontSize:13, color:"#64748b", marginBottom:36 },
    dots:  { display:"flex", gap:16, marginBottom:36 },
    dot:   (filled) => ({ width:14, height:14, borderRadius:"50%", background: filled?"#6366f1":"#1e293b", border:"2px solid", borderColor: filled?"#6366f1":"#334155", transition:"all 0.15s" }),
    grid:  { display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, width:240 },
    key:   (special) => ({ height:64, borderRadius:16, border:"none", background: special?"#0f172a":"#1e293b", color: special?"#64748b":"#f1f5f9", fontSize:22, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }),
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
  const [categories, setCategories]       = useState([]);
  const [loading, setLoading]             = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [toast, setToast]                 = useState(null);
  const [swipedId,  setSwipedId]          = useState(null);
  const [editModal, setEditModal]         = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editForm, setEditForm]           = useState({});
  const [search, setSearch]               = useState("");

  // ── Filters ──────────────────────────────────────────────────────────────
  const [filterYear,  setFilterYear]  = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterCat,   setFilterCat]   = useState("all");

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    category: "",
    type: TYPES[0],
    remarks: "",
    total: "",
  });

  const isDemo = false;

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = useCallback(async () => {
    if (isDemo) { setTransactions(MOCK); return; }
    setLoading(true);
    try {
      const data = await getTransactions();
      if (!Array.isArray(data)) throw new Error("bukan array");
      setTransactions(data);
      window.__transactions = data; 
    } catch {
      showToast("Gagal memuat data", false);
      setTransactions(MOCK);
    } finally { setLoading(false); }
  }, [isDemo]);

  useEffect(() => {
    fetchData();
    async function loadCats() {
      try {
        const data = await getCategories();
        setCategories(data);
        if (data.length > 0) setForm(f => ({ ...f, category: data[0] }));
      } catch(err) { console.error(err); }
    }
    loadCats();
  }, [fetchData]);

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
      setEditForm
        ({
        UUID:     t.UUID,
        No:       t.No,
        date:     dateStr,
        category: t.Category,
        type:     t.Type,
        remarks:  t.Remarks,
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
        fetchData();
      } catch 
        {
        showToast("Gagal mengupdate", false);
        } finally { setSubmitting(false); }
    };

  const handleDelete = async (UUID) => 
    {
    try {
      await deleteTransaction(UUID);
      showToast("Transaksi dihapus ✓");
      setDeleteConfirm(null);
      setSwipedId(null);
      fetchData();
      } catch 
      {
      showToast("Gagal menghapus", false);
      }
    };

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
      setForm(f => ({ ...f, remarks: "", total: "" }));
      fetchData();
      } catch 
        {
        showToast("Gagal menyimpan", false);
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

  // ── Label for active filter ───────────────────────────────────────────────
  const filterLabel = [
    filterYear  !== "all" ? filterYear : null,
    filterMonth !== "all" ? MONTH_NAMES[Number(filterMonth)] : null,
  ].filter(Boolean).join(" · ") || "Semua Data";

  // ── Styles ────────────────────────────────────────────────────────────────
  const s = {
    app:        { fontFamily:"'Inter',system-ui,sans-serif", background:"#0f172a", minHeight:"100vh", color:"#f1f5f9", width:"100%", maxWidth:"100%", margin:"0 auto", position:"relative", paddingBottom:80, boxSizing:"border-box" },
    header:     { background:"linear-gradient(135deg,#1e293b,#0f172a)", padding:"18px 16px 14px", borderBottom:"1px solid #1e293b" },
    headerRow:  { display:"flex", alignItems:"center", justifyContent:"space-between" },
    headerTitle:{ fontSize:20, fontWeight:700, color:"#f8fafc", margin:0 },
    headerSub:  { fontSize:12, color:"#64748b", marginTop:2 },
    section:    { padding:"14px 14px 8px" },
    card:       { background:"#1e293b", borderRadius:16, padding:"14px 16px", marginBottom:10 },

    // Filter bar
    filterBlock:{ background:"#1e293b", padding:"12px 14px", marginBottom:10, borderRadius:16 },
    filterTitle:{ fontSize:10, color:"#64748b", fontWeight:700, textTransform:"uppercase", marginBottom:8, letterSpacing:"0.05em" },
    filterRow:  { display:"flex", gap:8, marginBottom:8, overflowX:"auto", paddingBottom:2 },
    filterChip: (active) => ({ padding:"6px 14px", borderRadius:20, border:"none", background: active?"#6366f1":"#0f172a", color: active?"#fff":"#94a3b8", cursor:"pointer", fontSize:12, fontWeight:600, whiteSpace:"nowrap", flexShrink:0 }),

    // Summary
    summaryLabel:{ fontSize:10, color:"#64748b", fontWeight:700, textTransform:"uppercase", marginBottom:12, display:"flex", alignItems:"center", gap:6 },
    statRow:    { display:"flex", gap:8, marginBottom:8 },
    stat:       (color) => ({ flex:1, background:"#0f172a", borderRadius:12, padding:"10px 12px", borderLeft:`3px solid ${color}` }),
    statLabel:  { fontSize:9, color:"#64748b", fontWeight:700, textTransform:"uppercase" },
    statVal:    (color) => ({ fontSize:14, fontWeight:800, color, marginTop:2 }),
    balCard:    (pos) => ({ background:"#0f172a", borderRadius:12, padding:"12px 14px", borderLeft:`3px solid ${pos?"#6366f1":"#f59e0b"}`, marginBottom:0 }),
    balLabel:   { fontSize:9, color:"#64748b", fontWeight:700, textTransform:"uppercase" },
    balVal:     (pos) => ({ fontSize:20, fontWeight:900, color: pos?"#6366f1":"#f59e0b", marginTop:2 }),

    chartTitle: { fontSize:12, fontWeight:700, color:"#94a3b8", marginBottom:10 },

    // Input form
    label:      { fontSize:11, color:"#94a3b8", marginBottom:4, display:"block", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em" },
    input:      { width:"100%", background:"#0f172a", border:"1px solid #334155", borderRadius:10, padding:"10px 12px", color:"#f1f5f9", fontSize:15, boxSizing:"border-box", outline:"none" },
    select:     { width:"100%", background:"#0f172a", border:"1px solid #334155", borderRadius:10, padding:"10px 12px", color:"#f1f5f9", fontSize:15, boxSizing:"border-box", appearance:"none" },
    row:        { display:"flex", gap:10 },
    typeBtn:    (active, type) => ({ flex:1, padding:"10px 8px", borderRadius:10, border:`2px solid ${active?(type==="Pengeluaran"?"#ef4444":"#10b981"):"#334155"}`, background: active?(type==="Pengeluaran"?"#ef444422":"#10b98122"):"#0f172a", color: active?(type==="Pengeluaran"?"#ef4444":"#10b981"):"#64748b", cursor:"pointer", fontWeight:700, fontSize:14 }),
    submitBtn:  { width:"100%", padding:"14px", borderRadius:12, background: submitting?"#334155":"linear-gradient(135deg,#6366f1,#8b5cf6)", border:"none", color:"#fff", fontSize:16, fontWeight:700, cursor: submitting?"not-allowed":"pointer", marginTop:4 },

    // History
    txItem:     { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #0f172a" },
    txLeft:     { flex:1 },
    txName:     { fontSize:13, fontWeight:600, color:"#f1f5f9" },
    txMeta:     { fontSize:11, color:"#64748b", marginTop:2 },
    txAmt:      (pos) => ({ fontSize:14, fontWeight:700, color: pos?"#10b981":"#ef4444" }),
    catDot:     (cat) => ({ width:7, height:7, borderRadius:"50%", background:COLORS[cat]||"#6366f1", display:"inline-block", marginRight:5 }),

    // Nav
    nav:        { position:"fixed", bottom:0, left:0, right:0, width:"100%", background:"#1e293b", borderTop:"1px solid #334155", display:"flex", zIndex:100 },
    navBtn:     (active) => ({ flex:1, padding:"12px 0 8px", background:"none", border:"none", color: active?"#6366f1":"#64748b", cursor:"pointer", fontSize:10, fontWeight: active?700:400, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }),

    toast:      (ok) => ({ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", background: ok?"#10b981":"#ef4444", color:"#fff", padding:"10px 20px", borderRadius:12, fontWeight:700, fontSize:13, zIndex:999, whiteSpace:"nowrap", boxShadow:"0 4px 20px #0008" }),
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
          {loading && <div style={{fontSize:11,color:"#64748b"}}>Memuat…</div>}
        </div>
      </div>

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
              <div style={s.balVal(balance >= 0)}>{balance >= 0 ? "+" : "-"}{formatRpFull(balance)}</div>
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
                    <XAxis dataKey="date" tick={{fontSize:8,fill:"#64748b"}} />
                    <YAxis tick={{fontSize:8,fill:"#64748b"}} tickFormatter={v=>`${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={v=>formatRpFull(v)} contentStyle={{background:"#1e293b",border:"none",borderRadius:8,color:"#f1f5f9",fontSize:12}} />
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
                        label={({name,percent}) => percent > 0.04 ? `${(percent*100).toFixed(0)}%` : ""}
                        labelLine={false}
                        fontSize={9}
                      >
                        {byCat.map((_,i) => <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={v=>formatRpFull(v)} contentStyle={{background:"#1e293b",border:"none",borderRadius:8,color:"#f1f5f9",fontSize:12}} />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Legend with amounts */}
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:4}}>
                    {byCat.map((d,i) => (
                      <div key={d.name} style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{width:10,height:10,borderRadius:"50%",background:PIE_COLORS[i%PIE_COLORS.length],display:"inline-block",flexShrink:0}} />
                          <span style={{fontSize:12,color:"#cbd5e1"}}>{d.name}</span>
                        </div>
                        <div style={{display:"flex",gap:10,alignItems:"center"}}>
                          <span style={{fontSize:10,color:"#64748b"}}>{((d.value/totalOut)*100).toFixed(1)}%</span>
                          <span style={{fontSize:12,fontWeight:700,color:"#ef4444"}}>{formatRp(d.value)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )
            }
          </div>

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
              <select style={s.select} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                {categories.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{marginBottom:14}}>
              <label style={s.label}>Keterangan</label>
              <input type="text" placeholder="mis. Bensin Motor, Makan Siang…" style={s.input} value={form.remarks} onChange={e=>setForm(f=>({...f,remarks:e.target.value}))} />
            </div>
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
                background:"#1e293b",
                border:"1px solid #334155",
                borderRadius:12,
                padding:"12px 40px 12px 16px",
                color:"#f1f5f9",
                fontSize:14,
                boxSizing:"border-box",
                outline:"none",
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
            {!loading && filtered.slice().reverse().slice(0,100).map
              ((t,i) => 
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
                    <div key={i} style={{ position:"relative", overflow:"hidden", borderBottom:"1px solid #334155" }}>
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
                          background:"#0f172a",
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
            <div style={{ position:"fixed", inset:0, background:"#000000aa", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:24 }}>
              <div style={{ background:"#1e293b", borderRadius:20, padding:24, width:"100%" }}>
                <div style={{ fontSize:16, fontWeight:700, color:"#f1f5f9", marginBottom:8 }}>🗑️ Hapus Transaksi?</div>
                <div style={{ fontSize:13, color:"#94a3b8", marginBottom:6 }}>
                  {deleteConfirm.Remarks}
                </div>
                <div style={{ fontSize:13, color:"#ef4444", fontWeight:700, marginBottom:20 }}>
                  {formatRpFull(parseTotal(deleteConfirm.Total))}
                </div>
                <div style={{ display:"flex", gap:10 }}>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    style={{ flex:1, padding:"12px", borderRadius:12, border:"1px solid #334155", background:"none", color:"#94a3b8", fontSize:14, cursor:"pointer" }}
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

      {/* ── EDIT MODAL ── */}
        {editModal && 
          (
          <div style={{ position:"fixed", inset:0, background:"#000000aa", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:999 }}>
            <div style={{ background:"#1e293b", borderRadius:"20px 20px 0 0", padding:24, width:"100%", maxHeight:"90vh", overflowY:"auto" }}>
              
              {/* Header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                <div style={{ fontSize:16, fontWeight:700, color:"#f1f5f9" }}>✏️ Edit Transaksi</div>
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