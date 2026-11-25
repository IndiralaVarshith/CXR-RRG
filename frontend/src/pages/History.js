import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import axios from "axios";
import {
  Search, Trash2, Download, Eye, Calendar, Hash, FileStack, ShieldAlert, CheckCircle2, CalendarDays, Plus, RefreshCw, ImageOff, Inbox,
} from "lucide-react";
import Navbar from "../components/Navbar";
import ReportModal from "../components/ReportModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { BACKEND_URL, imageUrl } from "../config";
import { getUser } from "../lib/auth";
import { label, levelColor, RISK, riskFrom, summarize } from "../lib/pathologies";
import { downloadReportPDF } from "../lib/pdf";
import "./history.css";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "flagged", label: "Flagged" },
  { id: "clear", label: "No findings" },
];

function Thumb({ src }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="h-thumb missing"><ImageOff size={22} /></div>
  ) : (
    <div className="h-thumb"><img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /></div>
  );
}

export default function History() {
  const toast = useToast();
  const nav = useNavigate();
  const user = getUser();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("new");
  const [open, setOpen] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get(`${BACKEND_URL}/api/history`, { params: { email: user.email } });
      setReports(data);
    } catch (err) {
      setError(err.response?.data?.error || `Can't reach the backend at ${BACKEND_URL}.`);
    } finally {
      setLoading(false);
    }
  }, [user.email]);

  useEffect(() => { load(); }, [load]);

  const isFlagged = (r) => {
    const risk = riskFrom(r.aiReport);
    return risk ? risk !== "low" : /suspected|abnormal/i.test(r.aiReport?.finding || "");
  };

  const stats = useMemo(() => {
    const week = Date.now() - 7 * 864e5;
    const flagged = reports.filter(isFlagged).length;
    return {
      total: reports.length,
      flagged,
      clear: reports.length - flagged,
      week: reports.filter((r) => new Date(r.createdAt).getTime() > week).length,
    };
  }, [reports]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = reports.filter((r) => {
      if (filter === "flagged" && !isFlagged(r)) return false;
      if (filter === "clear" && isFlagged(r)) return false;
      if (!s) return true;
      return [r.patientName, r.ectNumber, r.notes, r.aiReport?.finding, ...(r.aiReport?.findings || []).map(label)]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(s));
    });
    list = [...list].sort((a, b) => (sort === "new" ? -1 : 1) * (new Date(a.createdAt) - new Date(b.createdAt)));
    return list;
  }, [reports, q, filter, sort]);

  const doDelete = async () => {
    setBusy(true);
    try {
      if (confirm.type === "all") {
        await axios.delete(`${BACKEND_URL}/api/history/clear/all`, { params: { email: user.email } });
        setReports([]);
        toast("success", "History cleared");
      } else {
        await axios.delete(`${BACKEND_URL}/api/history/${confirm.report._id}`);
        setReports((rs) => rs.filter((x) => x._id !== confirm.report._id));
        toast("success", "Report deleted");
      }
      setConfirm(null);
    } catch {
      toast("error", "Delete failed", "Could not reach the backend.");
    } finally {
      setBusy(false);
    }
  };

  const pdf = (r) =>
    downloadReportPDF({
      id: r._id, patientName: r.patientName, ectNumber: r.ectNumber, notes: r.notes, reportText: r.aiReport?.finding,
      userName: r.userName, userEmail: r.userEmail, createdAt: r.createdAt, probabilities: r.aiReport?.probabilities,
      findings: r.aiReport?.findings, risk: riskFrom(r.aiReport), model: r.aiReport?.model, image: imageUrl(r.imagePath),
    }).then(() => toast("success", "PDF exported"));

  return (
    <div className="page">
      <Navbar />
      <main className="container hist">
        <div className="dash-head">
          <div>
            <span className="eyebrow">Patient history</span>
            <h1>Saved reports</h1>
          </div>
          <div className="dash-status">
            <button className="icon-btn" onClick={load} title="Refresh"><RefreshCw size={16} /></button>
            {reports.length > 0 && (
              <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ type: "all" })}><Trash2 size={15} /> Clear all</button>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => nav("/dashboard")}><Plus size={15} /> New analysis</button>
          </div>
        </div>

        <div className="stats">
          {[
            { icon: FileStack, v: stats.total, l: "Total studies", tone: "" },
            { icon: ShieldAlert, v: stats.flagged, l: "Flagged for review", tone: "danger" },
            { icon: CheckCircle2, v: stats.clear, l: "No acute findings", tone: "ok" },
            { icon: CalendarDays, v: stats.week, l: "Last 7 days", tone: "" },
          ].map(({ icon: Icon, v, l, tone }, i) => (
            <motion.div key={l} className={`panel stat ${tone}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <span className="stat-ic"><Icon size={18} /></span>
              <div className="stat-v">{loading ? "–" : v}</div>
              <div className="stat-l faint">{l}</div>
            </motion.div>
          ))}
        </div>

        <div className="h-controls">
          <div className="input-wrap h-search">
            <Search size={17} />
            <input className="input" placeholder="Search patient, reference, finding or notes…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="seg">
            {FILTERS.map((f) => (
              <button key={f.id} className={filter === f.id ? "on" : ""} onClick={() => setFilter(f.id)}>{f.label}</button>
            ))}
          </div>
          <div className="seg">
            <button className={sort === "new" ? "on" : ""} onClick={() => setSort("new")}>Newest</button>
            <button className={sort === "old" ? "on" : ""} onClick={() => setSort("old")}>Oldest</button>
          </div>
        </div>

        {loading ? (
          <div className="h-grid">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ height: 300 }} />)}</div>
        ) : error ? (
          <div className="panel panel-pad h-empty">
            <ShieldAlert size={30} style={{ color: "var(--danger)" }} />
            <h3>Couldn't load history</h3>
            <p className="muted">{error}</p>
            <button className="btn btn-ghost" onClick={load}><RefreshCw size={16} /> Retry</button>
          </div>
        ) : shown.length === 0 ? (
          <div className="panel panel-pad h-empty">
            <Inbox size={34} style={{ color: "var(--accent)" }} />
            <h3>{reports.length ? "No matching reports" : "No reports yet"}</h3>
            <p className="muted">{reports.length ? "Try a different search or filter." : "Analyze your first chest X-ray and save it to see it here."}</p>
            {!reports.length && <button className="btn btn-primary" onClick={() => nav("/dashboard")}><Plus size={16} /> New analysis</button>}
          </div>
        ) : (
          <div className="h-grid">
              {shown.map((r, i) => {
                const risk = riskFrom(r.aiReport);
                const info = risk ? RISK[risk] : null;
                const findings = r.aiReport?.findings || [];
                return (
                  <motion.article
                    key={r._id}
                    className="panel h-card"
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 8) * 0.04 }}
                  >
                    <button className="h-media" onClick={() => setOpen(r)} aria-label="Open report">
                      <Thumb src={imageUrl(r.imagePath)} />
                      {info && <span className={`chip ${info.tone} h-risk`}><span className="dot" /> {info.label}</span>}
                      <span className="h-view"><Eye size={16} /> View report</span>
                    </button>
                    <div className="h-body">
                      <h3 title={r.patientName}>{r.patientName || "Unknown patient"}</h3>
                      <div className="h-meta mono faint">
                        <span><Calendar size={12} /> {new Date(r.createdAt).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</span>
                        {r.ectNumber && <span><Hash size={12} /> {r.ectNumber}</span>}
                      </div>
                      {(() => {
                        const p = r.aiReport?.probabilities && summarize(r.aiReport.probabilities).primary;
                        return p ? (
                          <div className="h-dx">
                            <span className="mono faint">Most likely</span>
                            <b>{label(p[0])}</b>
                            <span className="mono" style={{ color: levelColor(p[1]) }}>{(p[1] * 100).toFixed(0)}%</span>
                            <div className="h-dx-bar"><span style={{ width: `${p[1] * 100}%`, background: levelColor(p[1]) }} /></div>
                          </div>
                        ) : null;
                      })()}
                      <div className="finding-chips h-findings">
                        {findings.length ? findings.slice(0, 3).map((f) => <span key={f} className="chip danger">{label(f)}</span>)
                          : risk === "low" ? <span className="chip ok">No acute findings</span>
                          : <span className="chip neutral">Legacy report</span>}
                        {findings.length > 3 && <span className="chip neutral">+{findings.length - 3}</span>}
                      </div>
                    </div>
                    <div className="h-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(r)}><Eye size={15} /> Open</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => pdf(r)}><Download size={15} /> PDF</button>
                      <button className="icon-btn danger" onClick={() => setConfirm({ type: "one", report: r })} title="Delete"><Trash2 size={15} /></button>
                    </div>
                  </motion.article>
                );
              })}
          </div>
        )}
      </main>

      <AnimatePresence>
        {open && (
          <ReportModal
            key={open._id}
            report={open}
            onClose={() => setOpen(null)}
            onUpdated={(u) => setReports((rs) => rs.map((x) => (x._id === u._id ? u : x)))}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!confirm}
        busy={busy}
        title={confirm?.type === "all" ? "Clear all history?" : "Delete this report?"}
        message={confirm?.type === "all"
          ? `This permanently deletes all ${reports.length} saved reports. This cannot be undone.`
          : `The report for ${confirm?.report?.patientName || "this patient"} will be permanently deleted.`}
        confirmLabel={confirm?.type === "all" ? "Clear all" : "Delete"}
        onConfirm={doDelete}
        onCancel={() => !busy && setConfirm(null)}
      />
    </div>
  );
}
