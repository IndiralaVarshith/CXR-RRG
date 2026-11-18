import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, ImageIcon, Crop, Network, Sigma, Flame, FileText, AlertTriangle, CheckCircle2, Server, Database, Layout, Cpu,
} from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import "./features.css";

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
};

const PIPE = [
  { icon: ImageIcon, t: "Input", d: "PNG / JPG radiograph, converted to grayscale" },
  { icon: Crop, t: "Preprocess", d: "Centre crop, 224×224, intensity normalised to ±1024" },
  { icon: Network, t: "DenseNet-121", d: "121-layer CNN producing a 1024×7×7 feature map" },
  { icon: Sigma, t: "Calibrate", d: "Sigmoid + per-pathology operating-point normalisation" },
  { icon: Flame, t: "Explain", d: "Class-activation map for each top finding" },
  { icon: FileText, t: "Report", d: "Structured findings and impression, editable by a clinician" },
];

const EVAL = [
  { m: "TorchXRayVision DenseNet-121 (deployed)", n: "40", auc: "0.895", sens: "90%", spec: "70%", t: "0.12 s", ok: true },
  { m: "TorchXRayVision DenseNet-121 (deployed)", n: "200", auc: "0.742", sens: "81%", spec: "54%", t: "0.12 s", ok: true },
  { m: "Fine-tuned Qwen2-VL-2B + LoRA (experimental)", n: "40", auc: "≈0.50", sens: "0%", spec: "100%", t: "4.8 s", ok: false },
];

export default function Features() {
  return (
    <div className="page">
      <Navbar />

      <section className="container tech-hero">
        <motion.div {...reveal}>
          <span className="eyebrow">Technology</span>
          <h1>Built to be <span className="gradient-text">inspected</span>,<br />not just trusted.</h1>
          <p className="muted">
            An open, reproducible pipeline: a well-studied pretrained model, exact visual explanations, and
            evaluation numbers we publish honestly, including the experiment that didn't work.
          </p>
        </motion.div>
      </section>

      {/* PIPELINE */}
      <section className="container section" style={{ paddingTop: 40 }}>
        <motion.div className="section-head" {...reveal}>
          <span className="eyebrow">Inference pipeline</span>
          <h2>Six stages. One second.</h2>
        </motion.div>
        <div className="pipe">
          {PIPE.map(({ icon: Icon, t, d }, i) => (
            <motion.div key={t} className="pipe-node panel" {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }}>
              <span className="mono faint">0{i + 1}</span>
              <span className="pipe-icon"><Icon size={20} /></span>
              <h4>{t}</h4>
              <p className="muted">{d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* MODEL CARD */}
      <section className="container section" style={{ paddingTop: 0 }}>
        <div className="card-grid">
          <motion.div className="panel panel-pad brackets" {...reveal}>
            <div className="panel-title"><h3><Cpu size={16} /> Model card</h3></div>
            <dl className="spec">
              {[
                ["Architecture", "DenseNet-121 (7.0 M parameters)"],
                ["Weights", "torchxrayvision · densenet121-res224-all"],
                ["Training data", "NIH, CheXpert, MIMIC-CXR, PadChest, RSNA, OpenI, Google labels"],
                ["Outputs", "18 independent pathology probabilities"],
                ["Explainability", "Class Activation Mapping (exact, from the final linear layer)"],
                ["Alert threshold", "0.50, calibrated per pathology"],
                ["Runtime", "PyTorch on CPU, about 120 ms per image"],
              ].map(([k, v]) => (
                <div key={k}><dt className="mono">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </motion.div>

          <motion.div className="panel panel-pad" {...reveal} transition={{ ...reveal.transition, delay: 0.1 }}>
            <div className="panel-title"><h3><Server size={16} /> System architecture</h3></div>
            <div className="arch">
              {[
                { icon: Layout, t: "React frontend", s: ":3000", d: "Upload, viewer, reports, history" },
                { icon: Cpu, t: "ML service (Flask)", s: ":8000", d: "POST /predict returns probabilities and heatmaps" },
                { icon: Server, t: "API (Express)", s: ":5000", d: "Auth, report storage, history CRUD" },
                { icon: Database, t: "MongoDB", s: ":27017", d: "Users and saved reports (local or Atlas)" },
              ].map(({ icon: Icon, t, s, d }, i, arr) => (
                <div key={t}>
                  <div className="arch-node">
                    <span className="pipe-icon"><Icon size={18} /></span>
                    <div style={{ flex: 1 }}>
                      <div className="arch-t">{t} <span className="mono faint">{s}</span></div>
                      <div className="muted" style={{ fontSize: 13 }}>{d}</div>
                    </div>
                  </div>
                  {i < arr.length - 1 && <div className="arch-link" />}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* EVALUATION */}
      <section className="container section" style={{ paddingTop: 0 }}>
        <motion.div className="section-head" {...reveal}>
          <span className="eyebrow">Evaluation</span>
          <h2>Measured, not marketed.</h2>
          <p>Held-out Indiana University chest X-rays (frontal views, patients never seen in training), balanced normal vs abnormal.</p>
        </motion.div>
        <motion.div className="panel table-wrap" {...reveal}>
          <table className="eval">
            <thead>
              <tr><th>Model</th><th>Images</th><th>AUROC</th><th>Sensitivity</th><th>Specificity</th><th>Latency</th></tr>
            </thead>
            <tbody>
              {EVAL.map((r, i) => (
                <tr key={i} className={r.ok ? "" : "bad"}>
                  <td>{r.ok ? <CheckCircle2 size={16} className="ok-ic" /> : <AlertTriangle size={16} className="bad-ic" />} {r.m}</td>
                  <td className="mono">{r.n}</td>
                  <td className="mono strong">{r.auc}</td>
                  <td className="mono">{r.sens}</td>
                  <td className="mono">{r.spec}</td>
                  <td className="mono">{r.t}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
        <motion.p className="faint" style={{ fontSize: 13, marginTop: 14 }} {...reveal}>
          The experimental report generator collapsed during fine-tuning (500 samples, 1 epoch): it produced a "normal" report for
          every image. It's kept for research but disabled by default. Reproduce with <span className="mono">ml/evaluate.py</span>.
        </motion.p>
      </section>

      {/* LIMITATIONS */}
      <section className="container section" style={{ paddingTop: 0 }}>
        <div className="card-grid">
          <motion.div className="panel panel-pad limit" {...reveal}>
            <div className="panel-title"><h3><AlertTriangle size={16} /> Limitations</h3></div>
            <ul>
              <li>Screening aid only. It is not FDA/CE cleared and not a diagnostic device.</li>
              <li>Trained on frontal (PA/AP) views. Lateral views are less reliable.</li>
              <li>Doesn't model findings outside its 18 labels, e.g. degenerative spine or granulomas.</li>
              <li>Heatmaps are coarse (7×7 grid upsampled) and show influence, not segmentation.</li>
              <li>Performance varies with scanner, population and image quality.</li>
            </ul>
          </motion.div>
          <motion.div className="panel panel-pad cta-mini brackets" {...reveal} transition={{ ...reveal.transition, delay: 0.1 }}>
            <h2>Try it on a real study.</h2>
            <p className="muted">Upload a chest X-ray and see the probabilities, attention maps and draft report.</p>
            <Link to="/dashboard" className="btn btn-primary btn-lg">Open workspace <ArrowRight size={18} /></Link>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
