import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import { X, Download, Pencil, Save, User, Hash, Calendar, Mail, ShieldAlert, CheckCircle2, Layers, NotebookPen } from "lucide-react";
import ProbBars from "./ProbBars";
import { useToast } from "./Toast";
import { BACKEND_URL, imageUrl } from "../config";
import { label, RISK, riskFrom } from "../lib/pathologies";
import { downloadReportPDF } from "../lib/pdf";

export default function ReportModal({ report, onClose, onUpdated }) {
  const toast = useToast();
  const [r, setR] = useState(report);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    patientName: report.patientName || "",
    ectNumber: report.ectNumber || "",
    finding: report.aiReport?.finding || "",
    notes: report.notes || "",
  });

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const risk = riskFrom(r.aiReport);
  const riskInfo = risk ? RISK[risk] : null;
  const probs = r.aiReport?.probabilities || {};
  const hasProbs = Object.keys(probs).length > 0;

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await axios.put(`${BACKEND_URL}/api/history/${r._id}`, form);
      setR(data.report);
      onUpdated?.(data.report);
      setEditing(false);
      toast("success", "Report updated");
    } catch (err) {
      toast("error", "Update failed", err.response?.data?.error || "Could not reach the backend.");
    } finally {
      setSaving(false);
    }
  };

  const pdf = () =>
    downloadReportPDF({
      id: r._id, patientName: r.patientName, ectNumber: r.ectNumber, notes: r.notes,
      reportText: r.aiReport?.finding, userName: r.userName, userEmail: r.userEmail, createdAt: r.createdAt,
      probabilities: probs, findings: r.aiReport?.findings, risk, model: r.aiReport?.model, image: imageUrl(r.imagePath),
    }).then(() => toast("success", "PDF exported"));

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.div
        className="panel modal"
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="rm-head">
          <div>
            <span className="eyebrow">Report · {String(r._id).slice(-8).toUpperCase()}</span>
            <h2>{r.patientName || "Unknown patient"}</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {editing ? (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? <span className="spinner" /> : <Save size={15} />} Save</button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}><Pencil size={15} /> Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={pdf}><Download size={15} /> PDF</button>
              </>
            )}
            <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        <div className="rm-body">
          <div className="rm-left">
            <div className="rm-image">
              <img src={imageUrl(r.imagePath)} alt="Radiograph" onError={(e) => { e.currentTarget.style.opacity = 0.15; }} />
            </div>
            <dl className="rm-meta">
              <div><dt><Calendar size={13} /> Date</dt><dd>{new Date(r.createdAt).toLocaleString()}</dd></div>
              <div><dt><Hash size={13} /> Reference</dt><dd>{r.ectNumber || "-"}</dd></div>
              <div><dt><User size={13} /> Uploaded by</dt><dd>{r.userName || r.userEmail?.split("@")[0]}</dd></div>
              <div><dt><Mail size={13} /> Account</dt><dd>{r.userEmail}</dd></div>
            </dl>
          </div>

          <div className="rm-right">
            {riskInfo && (
              <div className={`rm-risk ${riskInfo.tone}`}>
                <span className={`chip ${riskInfo.tone}`}>{riskInfo.tone === "ok" ? <CheckCircle2 size={13} /> : <ShieldAlert size={13} />} {riskInfo.label}</span>
                <div className="finding-chips">
                  {(r.aiReport?.findings || []).map((f) => <span key={f} className="chip danger">{label(f)}</span>)}
                </div>
              </div>
            )}

            {editing && (
              <div className="form-grid" style={{ marginBottom: 14 }}>
                <div className="field"><label>Patient name</label><input className="input" value={form.patientName} onChange={set("patientName")} /></div>
                <div className="field"><label>Reference no.</label><input className="input" value={form.ectNumber} onChange={set("ectNumber")} /></div>
              </div>
            )}

            <div className="rm-section">
              <h4><NotebookPen size={15} /> Report</h4>
              {editing ? (
                <textarea className="input mono" rows={8} value={form.finding} onChange={set("finding")} style={{ fontSize: 13 }} />
              ) : (
                <pre className="rm-report">{r.aiReport?.finding || "No report text."}</pre>
              )}
            </div>

            <div className="rm-section">
              <h4>Clinical notes</h4>
              {editing ? (
                <textarea className="input" rows={3} value={form.notes} onChange={set("notes")} />
              ) : (
                <p className="muted" style={{ fontSize: 14 }}>{r.notes || "None provided."}</p>
              )}
            </div>

            {hasProbs && (
              <div className="rm-section">
                <h4><Layers size={15} /> Pathology probabilities</h4>
                <ProbBars probabilities={probs} />
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
