import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import axios from "axios";
import {
  UploadCloud, ScanLine, User, Hash, NotebookPen, Sparkles, Save, Download, RotateCcw, Sun, Contrast, ZoomIn,
  ZoomOut, Layers, Image as ImageIcon, Cpu, CheckCircle2, AlertTriangle, ShieldAlert, FlaskConical, FileImage,
  History as HistoryIcon, SunMoon, ChevronDown, ChevronUp, ImageOff,
} from "lucide-react";
import Navbar from "../components/Navbar";
import ProbBars from "../components/ProbBars";
import DiagnosisCard from "../components/DiagnosisCard";
import { useToast } from "../components/Toast";
import { BACKEND_URL, ML_URL } from "../config";
import { getUser } from "../lib/auth";
import { label, PATHOLOGIES, riskFrom } from "../lib/pathologies";
import { downloadReportPDF } from "../lib/pdf";
import "./dashboard.css";

const STAGES = ["Preprocessing image", "Running DenseNet-121", "Calibrating probabilities", "Computing attention maps", "Drafting report"];
const ACCEPT = ["image/png", "image/jpeg"];

function useMlHealth() {
  const [status, setStatus] = useState("checking");
  useEffect(() => {
    let alive = true;
    const check = () =>
      axios.get(`${ML_URL}/health`, { timeout: 4000 })
        .then(() => alive && setStatus("online"))
        .catch(() => alive && setStatus("offline"));
    check();
    const t = setInterval(check, 10000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return status;
}

export default function UserDashboard() {
  const toast = useToast();
  const nav = useNavigate();
  const user = getUser();
  const ml = useMlHealth();
  const inputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [drag, setDrag] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [ectNumber, setEctNumber] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState(null);
  const [reportText, setReportText] = useState("");
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState("original");
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const [rejected, setRejected] = useState(null);

  const [bright, setBright] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [invert, setInvert] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const resetView = () => { setBright(100); setContrast(100); setInvert(false); setZoom(1); };

  const pickFile = useCallback((f) => {
    if (!f) return;
    if (!ACCEPT.includes(f.type)) {
      toast("error", "Unsupported file", "Please upload a PNG or JPG chest X-ray.");
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      toast("error", "File too large", "Maximum size is 25 MB.");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setRejected(null);
    setReportText("");
    setSavedId(null);
    setSelected(null);
    setMode("original");
    resetView();
  }, [toast]);

  const loadSample = async () => {
    try {
      const blob = await fetch("/assets/hero-xray.jpg").then((r) => r.blob());
      pickFile(new File([blob], "sample-indiana-1000.jpg", { type: "image/jpeg" }));
      if (!patientName) setPatientName("Sample Patient");
      if (!ectNumber) setEctNumber("IU-1000");
    } catch {
      toast("error", "Could not load the sample image");
    }
  };

  const analyze = async (force = false) => {
    if (!file) return toast("error", "No image", "Upload a chest X-ray first.");
    setLoading(true);
    setResult(null);
    setRejected(null);
    setStage(0);
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 420);
    const started = Date.now();
    try {
      const fd = new FormData();
      fd.append("image", file);
      if (force === true) fd.append("force", "1");
      const { data } = await axios.post(`${ML_URL}/predict`, fd, { timeout: 120000 });
      // let the scan animation breathe so the result doesn't "pop"
      const wait = Math.max(0, 1600 - (Date.now() - started));
      await new Promise((r) => setTimeout(r, wait));
      setResult(data);
      setReportText(data.report || "");
      const first = Object.keys(data.heatmaps || {}).sort((a, b) => data.probabilities[b] - data.probabilities[a])[0] || null;
      setSelected(first);
      // only open the heatmap by default when something was actually flagged
      setMode(first && data.findings?.length ? "heatmap" : "original");
      setSavedId(null);
      const n = data.findings?.length || 0;
      toast(n ? "info" : "success", "Analysis complete", n ? `${n} finding${n > 1 ? "s" : ""} above threshold.` : "No pathology above the alert threshold.");
      (data.warnings || []).forEach((w) => toast("error", "Image warning", w));
    } catch (err) {
      if (err.response?.data?.code === "not_cxr") {
        setRejected(err.response.data);
        return;
      }
      const msg = err.response?.data?.error
        || (err.code === "ECONNABORTED" ? "The request timed out." : `ML server unreachable at ${ML_URL}. Start it with: python ml/server.py`);
      toast("error", "Analysis failed", msg);
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  };

  const save = async () => {
    if (!result) return;
    if (!patientName.trim()) return toast("error", "Patient name required", "Enter a patient name before saving.");
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("patientName", patientName.trim());
      fd.append("ectNumber", ectNumber.trim());
      fd.append("notes", notes);
      fd.append("email", user.email);
      fd.append("userName", user.name);
      fd.append("reportText", reportText);
      fd.append("aiData", JSON.stringify({
        findings: result.findings, probabilities: result.probabilities, risk: result.risk || riskFrom(result), model: result.model,
      }));
      const { data } = await axios.post(`${BACKEND_URL}/api/save-report`, fd);
      setSavedId(data.report?._id || "saved");
      toast("success", "Report saved", "It's now in the patient history.");
    } catch (err) {
      toast("error", "Save failed", err.response?.data?.error || `Backend unreachable at ${BACKEND_URL}.`);
    } finally {
      setSaving(false);
    }
  };

  const pdf = () =>
    downloadReportPDF({
      id: savedId && savedId !== "saved" ? savedId : null,
      patientName, ectNumber, notes, reportText,
      userName: user.name, userEmail: user.email, createdAt: Date.now(),
      probabilities: result?.probabilities, findings: result?.findings, risk: result?.risk || (result ? riskFrom(result) : null), model: result?.model,
      image: file, heatmap: selected ? result?.heatmaps?.[selected] : null, heatmapLabel: selected,
    }).then(() => toast("success", "PDF exported"));

  const newAnalysis = () => {
    setFile(null); setPreview(""); setResult(null); setReportText(""); setSavedId(null);
    setPatientName(""); setEctNumber(""); setNotes(""); setSelected(null); resetView();
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const heatKeys = Object.keys(result?.heatmaps || {}).sort((a, b) => result.probabilities[b] - result.probabilities[a]);
  const viewSrc = mode === "heatmap" && selected && result?.heatmaps?.[selected] ? result.heatmaps[selected] : preview;
  const filter = `brightness(${bright}%) contrast(${contrast}%) ${invert ? "invert(1)" : ""}`;

  return (
    <div className="page">
      <Navbar />
      <main className="container dash">
        {/* header */}
        <div className="dash-head">
          <div>
            <span className="eyebrow">Analysis workspace</span>
            <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {/^(dr|prof)\.?\s/i.test(user.name) ? user.name : user.name.split(" ")[0]}</h1>
          </div>
          <div className="dash-status">
            <span className={`chip ${ml === "online" ? "ok" : ml === "offline" ? "danger" : "neutral"}`}>
              <span className="dot pulse" /> ML engine {ml}
            </span>
            <span className="chip neutral mono"><Cpu size={13} /> 5-model ensemble</span>
            <button className="btn btn-ghost btn-sm" onClick={() => nav("/history")}><HistoryIcon size={15} /> History</button>
          </div>
        </div>

        {ml === "offline" && (
          <motion.div className="offline-banner" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
            <AlertTriangle size={18} />
            <div>
              <b>The ML engine isn't running.</b> Start it in a terminal:
              <code>cd cxr-rrg && ../.venv/bin/python ml/server.py</code>
            </div>
          </motion.div>
        )}

        <div className="dash-grid">
          {/* ===== LEFT: viewer ===== */}
          <section className="panel viewer-panel">
            <div className="panel-title viewer-title">
              <h3><ScanLine size={16} /> Radiograph viewer</h3>
              {file && (
                <div className="seg">
                  <button className={mode === "original" ? "on" : ""} onClick={() => setMode("original")}><ImageIcon size={14} /> Original</button>
                  <button className={mode === "heatmap" ? "on" : ""} disabled={!heatKeys.length} onClick={() => setMode("heatmap")}><Layers size={14} /> Heatmap</button>
                </div>
              )}
            </div>

            {!file ? (
              <div
                className={`dropzone ${drag ? "drag" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
              >
                <div className="drop-rings"><span /><span /><span /></div>
                <div className="drop-icon"><UploadCloud size={34} /></div>
                <h2>Drop a chest X-ray here</h2>
                <p className="muted">or click to browse · PNG or JPG · up to 25 MB</p>
                <div className="drop-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-primary" onClick={() => inputRef.current?.click()}><FileImage size={17} /> Choose file</button>
                  <button className="btn btn-ghost" onClick={loadSample}><FlaskConical size={17} /> Try sample X-ray</button>
                </div>
                <p className="faint drop-hint mono">Frontal (PA/AP) views give the most reliable results</p>
              </div>
            ) : (
              <>
                <div
                  className={`viewer ${drag ? "drag" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={onDrop}
                >
                  <div className="viewer-stage" style={{ transform: `scale(${zoom})` }}>
                    <AnimatePresence mode="wait">
                      <motion.img
                        key={viewSrc}
                        src={viewSrc}
                        alt="Radiograph"
                        style={{ filter }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.35 }}
                        draggable="false"
                      />
                    </AnimatePresence>
                  </div>
                  {loading && (
                    <div className="scan-overlay">
                      <div className="scanline" />
                      <div className="scan-glow" />
                      <div className="scan-grid" />
                    </div>
                  )}
                  <div className="viewer-hud tl mono">{file.name}</div>
                  <div className="viewer-hud tr mono">
                    {mode === "heatmap" && selected ? <><span className="dot" style={{ color: "var(--danger)" }} /> CAM · {label(selected)}</> : "SOURCE"}
                  </div>
                  <div className="viewer-hud bl mono">B {bright}% · C {contrast}% · {zoom.toFixed(1)}×</div>
                  {mode === "heatmap" && (
                    <div className="legend">
                      <span className="mono">LOW</span><i /><span className="mono">HIGH</span>
                    </div>
                  )}
                </div>

                <div className="tools">
                  <label className="tool"><Sun size={15} /><input type="range" min="40" max="180" value={bright} onChange={(e) => setBright(+e.target.value)} aria-label="Brightness" /></label>
                  <label className="tool"><Contrast size={15} /><input type="range" min="40" max="220" value={contrast} onChange={(e) => setContrast(+e.target.value)} aria-label="Contrast" /></label>
                  <div className="tool-btns">
                    <button className={`icon-btn ${invert ? "active" : ""}`} onClick={() => setInvert((v) => !v)} title="Invert"><SunMoon size={16} /></button>
                    <button className="icon-btn" onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))} title="Zoom out"><ZoomOut size={16} /></button>
                    <button className="icon-btn" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} title="Zoom in"><ZoomIn size={16} /></button>
                    <button className="icon-btn" onClick={resetView} title="Reset view"><RotateCcw size={16} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => inputRef.current?.click()}><UploadCloud size={15} /> Replace</button>
                  </div>
                </div>

                {heatKeys.length > 0 && (
                  <div className="thumbs">
                    {heatKeys.map((k) => (
                      <button key={k} className={`thumb ${selected === k && mode === "heatmap" ? "on" : ""}`} onClick={() => { setSelected(k); setMode("heatmap"); }}>
                        <img src={result.heatmaps[k]} alt={label(k)} />
                        <span>{label(k)}<b className="mono">{(result.probabilities[k] * 100).toFixed(0)}%</b></span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <input ref={inputRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
          </section>

          {/* ===== RIGHT: controls & results ===== */}
          <aside className="side">
            <section className="panel panel-pad">
              <div className="panel-title"><h3><User size={16} /> Patient</h3>{savedId && <span className="chip ok"><CheckCircle2 size={13} /> Saved</span>}</div>
              <div className="form-grid">
                <div className="field">
                  <label>Patient name</label>
                  <div className="input-wrap"><User size={16} /><input className="input" value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="Full name" /></div>
                </div>
                <div className="field">
                  <label>Reference no.</label>
                  <div className="input-wrap"><Hash size={16} /><input className="input" value={ectNumber} onChange={(e) => setEctNumber(e.target.value)} placeholder="MRN / ECT" /></div>
                </div>
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label>Clinical notes</label>
                <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Symptoms, history, indication…" />
              </div>
              <button className="btn btn-primary btn-lg btn-block analyze-btn" onClick={() => analyze()} disabled={!file || loading || ml === "offline"}>
                {loading ? <><span className="spinner" /> Analyzing…</> : <><Sparkles size={18} /> {result ? "Re-run analysis" : "Run AI analysis"}</>}
              </button>
              {!file && <p className="faint mono hint">Upload an image to enable analysis</p>}
            </section>

            <AnimatePresence mode="wait">
              {loading && (
                <motion.section key="loading" className="panel panel-pad" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="panel-title"><h3><Cpu size={16} /> Inference</h3></div>
                  <ol className="stages">
                    {STAGES.map((s, i) => (
                      <li key={s} className={i < stage ? "done" : i === stage ? "active" : ""}>
                        <span className="stage-dot">{i < stage ? <CheckCircle2 size={14} /> : i === stage ? <span className="spinner" style={{ width: 12, height: 12 }} /> : null}</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </motion.section>
              )}

              {result && !loading && (
                <motion.div key="result" className="results" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                  <DiagnosisCard result={result} selected={mode === "heatmap" ? selected : null} onSelect={(k) => { setSelected(k); setMode("heatmap"); }} />

                  <section className="panel panel-pad">
                    <button className="all-toggle" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                      <span className="panel-title" style={{ margin: 0 }}><h3><Layers size={16} /> All 18 conditions</h3></span>
                      <span className="chip neutral">{showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {showAll ? "Hide" : "Show"}</span>
                    </button>
                    {showAll && (
                      <div style={{ marginTop: 14 }}>
                        <ProbBars probabilities={result.probabilities} selected={mode === "heatmap" ? selected : null} selectable={heatKeys} onSelect={(k) => { setSelected(k); setMode("heatmap"); }} />
                        {selected && PATHOLOGIES[selected] && (
                          <div className="explain-box">
                            <b>{label(selected)}</b>: <span className="muted">{PATHOLOGIES[selected].desc}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </section>

                  <section className="panel panel-pad">
                    <div className="panel-title"><h3><NotebookPen size={16} /> Draft report</h3><span className="chip neutral mono">editable</span></div>
                    <textarea className="input report-editor mono" value={reportText} onChange={(e) => { setReportText(e.target.value); setSavedId(null); }} rows={9} />
                    <div className="report-actions">
                      <button className="btn btn-primary" onClick={save} disabled={saving || !!savedId}>
                        {saving ? <><span className="spinner" /> Saving…</> : savedId ? <><CheckCircle2 size={17} /> Saved</> : <><Save size={17} /> Save to history</>}
                      </button>
                      <button className="btn btn-ghost" onClick={pdf}><Download size={17} /> PDF</button>
                      <button className="btn btn-ghost" onClick={newAnalysis}><RotateCcw size={17} /> New</button>
                    </div>
                    <p className="faint disclaimer"><ShieldAlert size={13} /> AI-generated screening aid. A qualified radiologist must confirm all findings.</p>
                  </section>
                </motion.div>
              )}

              {rejected && !loading && (
                <motion.section key="rejected" className="panel panel-pad rejected" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="empty-ic" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}><ImageOff size={22} /></div>
                  <h4>This doesn't look like a chest X-ray</h4>
                  <p className="muted">
                    The AI only works on frontal chest radiographs. Results on other images (photos, screenshots, other body parts) would be meaningless,
                    so it stopped here.
                  </p>
                  <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
                    <button className="btn btn-primary" onClick={() => inputRef.current?.click()}><UploadCloud size={16} /> Upload another image</button>
                    <button className="btn btn-ghost" onClick={() => analyze(true)}>Analyze anyway</button>
                  </div>
                </motion.section>
              )}

              {!result && !loading && !rejected && (
                <motion.section key="empty" className="panel panel-pad empty-result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="empty-ic"><Sparkles size={22} /></div>
                  <h4>Results will appear here</h4>
                  <p className="muted">You'll get probabilities for 18 pathologies, attention heatmaps and an editable draft report.</p>
                </motion.section>
              )}
            </AnimatePresence>
          </aside>
        </div>
      </main>
    </div>
  );
}
