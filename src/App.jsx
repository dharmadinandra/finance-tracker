import { useState, useEffect, useCallback } from "react";
import 
{
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend
} from "recharts";
import 
{
  getTransactions,
  getCategories,
  saveTransaction,
} from "./services/api";

const DEFAULT_CATEGORIES = [];
const TYPES = ["Pengeluaran", "Pemasukan"];

const COLORS = {
  Transportasi: "#6366f1", Makanan: "#f59e0b", Belanja: "#ec4899",
  Hiburan: "#10b981", Kesehatan: "#3b82f6", Pendidikan: "#8b5cf6",
  Tagihan: "#ef4444", Lainnya: "#6b7280",
  Pengeluaran: "#ef4444", Pemasukan: "#10b981"
};

const PIE_COLORS = ["#6366f1","#f59e0b","#ec4899","#10b981","#3b82f6","#8b5cf6","#ef4444","#6b7280"];

function formatRp(val) {
  const n = Math.abs(Number(val));
  return "Rp" + n.toLocaleString("id-ID");
}

function parseTotal(raw) {
  if (typeof raw === "number") return raw;
  return Number(String(raw).replace(/[^0-9\-]/g, "")) || 0;
}

// ── MOCK DATA for demo when no URL is set ──────────────────────────────────
const MOCK = [
  { No:2,  Date:"2025-08-01", Year:2025, Month:8, Category:"Transportasi", Type:"Pengeluaran", Remarks:"Service Mobil",      Total:-1000000 },
  { No:21, Date:"2025-08-03", Year:2025, Month:8, Category:"Transportasi", Type:"Pengeluaran", Remarks:"Gojek / Grab",       Total:-80500  },
  { No:25, Date:"2025-08-04", Year:2025, Month:8, Category:"Transportasi", Type:"Pengeluaran", Remarks:"Bensin Motor",       Total:-55000  },
  { No:5,  Date:"2025-08-02", Year:2025, Month:8, Category:"Makanan",      Type:"Pengeluaran", Remarks:"Makan Siang",        Total:-45000  },
  { No:10, Date:"2025-08-05", Year:2025, Month:8, Category:"Makanan",      Type:"Pengeluaran", Remarks:"Kopi + Snack",       Total:-32000  },
  { No:15, Date:"2025-08-06", Year:2025, Month:8, Category:"Belanja",      Type:"Pengeluaran", Remarks:"Groceries",          Total:-250000 },
  { No:30, Date:"2025-08-07", Year:2025, Month:8, Category:"Pemasukan",    Type:"Pemasukan",   Remarks:"Gaji Bulanan",       Total:8000000 },
  { No:32, Date:"2025-08-08", Year:2025, Month:8, Category:"Hiburan",      Type:"Pengeluaran", Remarks:"Netflix",            Total:-54000  },
  { No:35, Date:"2025-08-09", Year:2025, Month:8, Category:"Tagihan",      Type:"Pengeluaran", Remarks:"Listrik & Air",      Total:-320000 },
  { No:40, Date:"2025-08-10", Year:2025, Month:8, Category:"Kesehatan",    Type:"Pengeluaran", Remarks:"Vitamin",            Total:-120000 },
];

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterCat, setFilterCat] = useState("all");

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    category: "",
    type: TYPES[0],
    remarks: "",
    total: "",
  });

  const APPS_SCRIPT_URL = "set"; // dummy, real URL is in api.js
  const isDemo = false;          // always live mode now

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };
  
const fetchData = useCallback(async () => {

  if (isDemo) {
    setTransactions(MOCK);
    return;
  }

  setLoading(true);

  try {

    const data = await getTransactions();

    if (!Array.isArray(data)) {
      throw new Error("Response bukan berupa Array");
    }

    setTransactions(data);

  } catch (error) {

    console.error(error);

    showToast(
      "Tidak dapat terhubung ke Google Sheets.",
      false
    );

    setTransactions(MOCK);

  } finally {

    setLoading(false);

  }

}, [isDemo]);


  useEffect(() => {

  fetchData();

  async function loadCategories() {

    try 
    {
      const data = await getCategories();
      setCategories(data);
      if (data.length > 0) {
        setForm(prev => ({
          ...prev,
          category: data[0]
        }));
      }
    } catch (err) 
    {
      console.error(err);
    }
  }

  loadCategories();

}, [fetchData]);

  const handleSubmit = async () => {
    if (!form.remarks || !form.total) { showToast("Lengkapi semua field", false); return; }
    setSubmitting(true);
    const payload = {
      ...form,
      total: form.type === "Pengeluaran"
        ? -Math.abs(Number(form.total))
        : Math.abs(Number(form.total))
    };
    if (isDemo) {
      setTransactions(p => [{ No: p.length + 1, Date: form.date, Year: new Date(form.date).getFullYear(), Month: new Date(form.date).getMonth()+1, Category: form.category, Type: form.type, Remarks: form.remarks, Total: payload.total }, ...p]);
      showToast("Tersimpan (demo mode)");
      setForm(f => ({ ...f, remarks: "", total: "" }));
      setSubmitting(false);
      return;
    }
    try {
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showToast("Berhasil disimpan ke Google Sheets ✓");
      setForm(f => ({ ...f, remarks: "", total: "" }));
      fetchData();
    } catch {
      showToast("Gagal menyimpan", false);
    } finally { setSubmitting(false); }
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const months = [...new Set(transactions.map(t => t.Month))].sort();

  const filtered = transactions.filter(t =>
    (filterMonth === "all" || String(t.Month) === filterMonth) &&
    (filterCat === "all" || t.Category === filterCat)
  );

  const totalIn  = filtered.filter(t => t.Type === "Pemasukan").reduce((s,t) => s + parseTotal(t.Total), 0);
  const totalOut = filtered.filter(t => t.Type === "Pengeluaran").reduce((s,t) => s + Math.abs(parseTotal(t.Total)), 0);
  const balance  = totalIn - totalOut;

  // Spending by category (pie)
  const byCat = categories.map(cat => {
    const sum = filtered.filter(t => t.Category === cat && t.Type === "Pengeluaran")
      .reduce((s,t) => s + Math.abs(parseTotal(t.Total)), 0);
    return { name: cat, value: sum };
  }).filter(d => d.value > 0);

  // Spending by day (bar)
  const byDay = {};
  filtered.forEach(t => {
    const d = String(t.Date).slice(5);
    if (!byDay[d]) byDay[d] = { date: d, Pengeluaran: 0, Pemasukan: 0 };
    if (t.Type === "Pengeluaran") byDay[d].Pengeluaran += Math.abs(parseTotal(t.Total));
    else byDay[d].Pemasukan += parseTotal(t.Total);
  });
  const barData = Object.values(byDay).sort((a,b) => a.date > b.date ? 1 : -1).slice(-14);

  // ── Styles ─────────────────────────────────────────────────────────────────
  const s = {
    app: { fontFamily: "'Inter', system-ui, sans-serif", background: "#0f172a", minHeight: "100vh", color: "#f1f5f9", maxWidth: 430, margin: "0 auto", position: "relative", paddingBottom: 80 },
    header: { background: "linear-gradient(135deg,#1e293b,#0f172a)", padding: "20px 16px 14px", borderBottom: "1px solid #1e293b" },
    headerTitle: { fontSize: 20, fontWeight: 700, color: "#f8fafc", margin: 0 },
    headerSub: { fontSize: 12, color: "#64748b", marginTop: 2 },
    demoChip: { background:"#f59e0b22", color:"#f59e0b", borderRadius:8, padding:"2px 8px", fontSize:10, display:"inline-block", marginTop:4 },
    nav: { position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:"#1e293b", borderTop:"1px solid #334155", display:"flex", zIndex:100 },
    navBtn: (active) => ({ flex:1, padding:"12px 0 8px", background:"none", border:"none", color: active ? "#6366f1":"#64748b", cursor:"pointer", fontSize:10, fontWeight: active ? 700:400, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }),
    section: { padding:"16px 16px 8px" },
    card: { background:"#1e293b", borderRadius:16, padding:"14px 16px", marginBottom:12 },
    label: { fontSize:11, color:"#94a3b8", marginBottom:4, display:"block", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em" },
    input: { width:"100%", background:"#0f172a", border:"1px solid #334155", borderRadius:10, padding:"10px 12px", color:"#f1f5f9", fontSize:15, boxSizing:"border-box", outline:"none" },
    select: { width:"100%", background:"#0f172a", border:"1px solid #334155", borderRadius:10, padding:"10px 12px", color:"#f1f5f9", fontSize:15, boxSizing:"border-box", appearance:"none" },
    row: { display:"flex", gap:10 },
    half: { flex:1 },
    typeBtn: (active, type) => ({ flex:1, padding:"10px 8px", borderRadius:10, border:`2px solid ${active ? (type==="Pengeluaran"?"#ef4444":"#10b981") : "#334155"}`, background: active ? (type==="Pengeluaran"?"#ef444422":"#10b98122") : "#0f172a", color: active ? (type==="Pengeluaran"?"#ef4444":"#10b981") : "#64748b", cursor:"pointer", fontWeight:700, fontSize:14 }),
    submitBtn: { width:"100%", padding:"14px", borderRadius:12, background: submitting ? "#334155":"linear-gradient(135deg,#6366f1,#8b5cf6)", border:"none", color:"#fff", fontSize:16, fontWeight:700, cursor: submitting?"not-allowed":"pointer", marginTop:4 },
    statRow: { display:"flex", gap:10, marginBottom:12 },
    stat: (color) => ({ flex:1, background:"#1e293b", borderRadius:14, padding:"12px", borderLeft:`3px solid ${color}` }),
    statLabel: { fontSize:10, color:"#64748b", fontWeight:600, textTransform:"uppercase" },
    statVal: (color) => ({ fontSize:16, fontWeight:800, color, marginTop:2 }),
    chartTitle: { fontSize:13, fontWeight:700, color:"#94a3b8", marginBottom:10 },
    txItem: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #1e293b" },
    txLeft: { flex:1 },
    txName: { fontSize:14, fontWeight:600, color:"#f1f5f9" },
    txMeta: { fontSize:11, color:"#64748b", marginTop:2 },
    txAmt: (positive) => ({ fontSize:15, fontWeight:700, color: positive ? "#10b981":"#ef4444" }),
    catDot: (cat) => ({ width:8, height:8, borderRadius:"50%", background: COLORS[cat]||"#6366f1", display:"inline-block", marginRight:6 }),
    toast: (ok) => ({ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", background: ok?"#10b981":"#ef4444", color:"#fff", padding:"10px 20px", borderRadius:12, fontWeight:700, fontSize:14, zIndex:999, whiteSpace:"nowrap", boxShadow:"0 4px 20px #0008" }),
    filterRow: { display:"flex", gap:8, marginBottom:12, overflowX:"auto", paddingBottom:4 },
    filterChip: (active) => ({ padding:"6px 14px", borderRadius:20, border:"none", background: active?"#6366f1":"#1e293b", color: active?"#fff":"#94a3b8", cursor:"pointer", fontSize:12, fontWeight:600, whiteSpace:"nowrap" }),
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={s.app}>
      {toast && <div style={s.toast(toast.ok)}>{toast.msg}</div>}

      <div style={s.header}>
        <p style={s.headerTitle}>💰 Catatan Keuangan</p>
        <p style={s.headerSub}>Personal Finance Tracker</p>
        {isDemo && <span style={s.demoChip}>DEMO MODE — Paste Apps Script URL untuk integrasi nyata</span>}
      </div>

      {/* ── DASHBOARD TAB ── */}
      {tab === "dashboard" && (
        <div>
          <div style={s.section}>
            {/* Month filter */}
            <div style={s.filterRow}>
              <button style={s.filterChip(filterMonth==="all")} onClick={()=>setFilterMonth("all")}>Semua</button>
              {months.map(m => <button key={m} style={s.filterChip(filterMonth===String(m))} onClick={()=>setFilterMonth(String(m))}>Bulan {m}</button>)}
            </div>

            {/* Stats */}
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
            <div style={{ ...s.card, borderLeft:`3px solid ${balance>=0?"#6366f1":"#f59e0b"}`, marginBottom:16 }}>
              <div style={s.statLabel}>Saldo Bersih</div>
              <div style={{ fontSize:22, fontWeight:900, color: balance>=0?"#6366f1":"#f59e0b" }}>{formatRp(balance)}</div>
            </div>

            {/* Bar chart */}
            <div style={s.card}>
              <div style={s.chartTitle}>📊 Arus Kas Harian</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={barData} margin={{top:0,right:0,left:-20,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{fontSize:9,fill:"#64748b"}} />
                  <YAxis tick={{fontSize:9,fill:"#64748b"}} tickFormatter={v=>`${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v=>formatRp(v)} contentStyle={{background:"#1e293b",border:"none",borderRadius:8,color:"#f1f5f9"}} />
                  <Bar dataKey="Pengeluaran" fill="#ef4444" radius={[4,4,0,0]} />
                  <Bar dataKey="Pemasukan" fill="#10b981" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pie chart */}
            {byCat.length > 0 && (
              <div style={s.card}>
                <div style={s.chartTitle}>🥧 Pengeluaran per Kategori</div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={byCat} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={9}>
                      {byCat.map((entry,i) => <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v=>formatRp(v)} contentStyle={{background:"#1e293b",border:"none",borderRadius:8,color:"#f1f5f9"}} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{display:"flex",flexWrap:"wrap",gap:"6px 12px",marginTop:4}}>
                  {byCat.map((d,i)=>(
                    <div key={d.name} style={{display:"flex",alignItems:"center",fontSize:11,color:"#94a3b8"}}>
                      <span style={{width:8,height:8,borderRadius:"50%",background:PIE_COLORS[i%PIE_COLORS.length],display:"inline-block",marginRight:5}} />
                      {d.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── INPUT TAB ── */}
      {tab === "input" && (
        <div style={s.section}>
          <div style={s.card}>
            <div style={{marginBottom:14}}>
              <label style={s.label}>Tanggal</label>
              <input type="date" style={s.input} value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} />
            </div>

            <div style={{marginBottom:14}}>
              <label style={s.label}>Jenis Transaksi</label>
              <div style={s.row}>
                {TYPES.map(t => (
                  <button key={t} style={s.typeBtn(form.type===t, t)} onClick={()=>setForm(f=>({...f,type:t}))}>
                    {t === "Pengeluaran" ? "▼ Keluar" : "▲ Masuk"}
                  </button>
                ))}
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={s.label}>Kategori</label>
              <select
                style={s.select}
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    category: e.target.value,
                  }))
                }
                >
                {categories.map((c) => (
                  <option
                    key={c}
                    value={c}
                  >
                    {c}
                  </option>
                ))}
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
      {tab === "history" && (
        <div style={s.section}>
          {/* Filters */}
          <div style={s.filterRow}>
            <button style={s.filterChip(filterCat==="all")} onClick={()=>setFilterCat("all")}>Semua</button>
            {categories.map(c=><button key={c} style={s.filterChip(filterCat===c)} onClick={()=>setFilterCat(c)}>{c}</button>)}
          </div>

          <div style={s.card}>
            {loading && <div style={{textAlign:"center",color:"#64748b",padding:20}}>Memuat…</div>}
            {!loading && filtered.slice().reverse().slice(0,50).map((t,i) => {
              const amt = parseTotal(t.Total);
              return (
                <div key={i} style={s.txItem}>
                  <div style={s.txLeft}>
                    <div style={s.txName}>
                      <span style={s.catDot(t.Category)} />
                      {t.Remarks}
                    </div>
                    <div style={s.txMeta}>{t.Category} · {String(t.Date).slice(0,10)}</div>
                  </div>
                  <div style={s.txAmt(amt > 0)}>{amt > 0 ? "+" : ""}{formatRp(amt)}</div>
                </div>
              );
            })}
            {!loading && filtered.length === 0 && <div style={{textAlign:"center",color:"#64748b",padding:20}}>Tidak ada transaksi</div>}
          </div>
        </div>
      )}

      {/* ── NAV BAR ── */}
      <nav style={s.nav}>
        {[
          { id:"dashboard", icon:"📊", label:"Dashboard" },
          { id:"input",     icon:"➕", label:"Tambah" },
          { id:"history",   icon:"📋", label:"Riwayat" },
        ].map(n => (
          <button key={n.id} style={s.navBtn(tab===n.id)} onClick={()=>setTab(n.id)}>
            <span style={{fontSize:20}}>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}