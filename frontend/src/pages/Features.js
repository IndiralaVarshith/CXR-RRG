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

// Held-out test: 1,109 Indiana patients never used for fitting or threshold choice (ml/train_heads.py)
const EVAL = [
  { m: "5-model ensemble + calibrated heads (deployed)", auc: "0.853", mean: "0.869", sens: "80%", spec: "70%", t: "\u2248 0.3 s", ok: true },
  { m: "DenseNet-121 \u00b7 all (previous)", auc: "0.810", mean: "0.819", sens: "90%", spec: "54%", t: "0.12 s", ok: true },
  { m: "ResNet-50 \u00b7 512px (alone)", auc: "0.805", mean: "0.828", sens: "15%*", spec: "99%", t: "\u2248 1 s", ok: true },
  { m: "DenseNet-121 \u00b7 PadChest (alone)", auc: "0.824", mean: "0.809", sens: "89%", spec: "52%", t: "0.12 s", ok: true },
  { m: "Fine-tuned Qwen2-VL-2B + LoRA (ours)", auc: "\u22480.50", mean: "-", sens: "0%", spec: "100%", t: "4.8 s", ok: false },
];

// Deployed ensemble, per disease: held-out AUROC, positive patients, before (single model)
const PER_DISEASE = [
  ["Hiatal hernia", 0.989, 43, 0.988], ["Edema", 0.953, 41, 0.947], ["Emphysema", 0.932, 137, 0.895],
  ["Pleural effusion", 0.926, 139, 0.926], ["Cardiomegaly", 0.925, 324, 0.914], ["Consolidation", 0.923, 27, 0.87],
  ["Infiltration", 0.887, 58, 0.812], ["Pneumonia", 0.882, 37, 0.779], ["Atelectasis", 0.838, 299, 0.81],
  ["Lung opacity", 0.828, 471, 0.812], ["Fracture", 0.816, 82, 0.716], ["Nodule", 0.762, 101, 0.698],
  ["Pneumothorax", 0.632, 21, 0.484],
];

// What a user notices (held-out patients)
const USER_VIEW = [
  ["Healthy patients with a false 'Detected' flag", "41%", "9%"],
  ["'Most likely diagnosis' matches the radiologist", "48%", "59%"],
  ["Average per-disease accuracy (AUROC)", "0.819", "0.869"],
];
const grade = (a) => (a >= 0.9 ? ["Excellent", "var(--ok)"] : a >= 0.8 ? ["Good", "var(--accent)"] : a >= 0.75 ? ["Fair", "var(--warn)"] : ["Weak", "var(--danger)"]);

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
                ["Ensemble", "4× DenseNet-121 (all, PadChest, NIH, CheXpert) + ResNet-50 at 512 px"],
                ["Pretraining data", "NIH, CheXpert, MIMIC-CXR, PadChest, RSNA, SIIM, VinDr, OpenI"],
                ["Calibration", "Per-disease logistic heads fitted on 2,586 Indiana patients"],
                ["Outputs", "18 pathology scores + overall abnormality score"],
                ["Alert levels", "Detected ≈ 95% specificity · Possible = balanced (Youden)"],
                ["Input check", "X-ray autoencoder + colour check reject non-chest-X-ray images"],
                ["Explainability", "Class Activation Mapping from the DenseNet-121 final layer"],
                ["Runtime", "PyTorch on CPU, about 0.3 s per image"],
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
          <p>
            Five pretrained chest X-ray networks are combined, and small per-disease layers are fitted to 2,586 Indiana University
            patients. All numbers below come from <b>1,109 other patients</b> that were never used for fitting or tuning.
            AUROC measures how well the score separates patients with a disease from those without it (0.5 = coin flip, 1.0 = perfect).
          </p>
        </motion.div>

        <motion.div className="uv-grid" {...reveal}>
          {USER_VIEW.map(([t, before, after]) => (
            <div key={t} className="panel panel-pad uv">
              <div className="faint" style={{ fontSize: 13 }}>{t}</div>
              <div className="uv-nums"><span className="mono faint">{before}</span><span className="uv-arrow">→</span><b className="gradient-text">{after}</b></div>
            </div>
          ))}
        </motion.div>

        <motion.div className="panel panel-pad" style={{ marginTop: 20 }} {...reveal}>
          <div className="panel-title"><h3><CheckCircle2 size={16} /> Deployed ensemble · accuracy per disease (held-out patients)</h3></div>
          <div className="dz-grid">
            {PER_DISEASE.map(([name, a, n, before], i) => {
              const [g, c] = grade(a);
              return (
                <motion.div key={name} className="dz" initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }}>
                  <div className="dz-top"><span>{name}</span><b className="mono" style={{ color: c }}>{a.toFixed(3)}</b></div>
                  <div className="dz-bar"><motion.span style={{ background: c }} initial={{ width: 0 }} whileInView={{ width: `${((a - 0.5) / 0.5) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9, delay: i * 0.03 }} /></div>
                  <div className="dz-meta mono faint"><span style={{ color: c }}>{g}</span><span>was {before.toFixed(2)} · {n} pts</span></div>
                </motion.div>
              );
            })}
          </div>
          <p className="faint" style={{ fontSize: 12.5, marginTop: 16 }}>Bars run from 0.5 (chance) to 1.0 (perfect). Weakest: pneumothorax (too few cases, shown only when strongly detected) and small nodules. A radiologist must review every result.</p>
        </motion.div>

        <motion.div className="panel table-wrap" style={{ marginTop: 20 }} {...reveal}>
          <table className="eval">
            <thead>
              <tr><th>Model</th><th>Sick vs healthy AUROC</th><th>Mean per-disease AUROC</th><th>Sensitivity</th><th>Specificity</th><th>Latency</th></tr>
            </thead>
            <tbody>
              {EVAL.map((r, i) => (
                <tr key={i} className={r.ok ? "" : "bad"}>
                  <td>{r.ok ? <CheckCircle2 size={16} className="ok-ic" /> : <AlertTriangle size={16} className="bad-ic" />} {r.m}</td>
                  <td className="mono strong">{r.auc}</td>
                  <td className="mono">{r.mean}</td>
                  <td className="mono">{r.sens}</td>
                  <td className="mono">{r.spec}</td>
                  <td className="mono">{r.t}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
        <motion.p className="faint" style={{ fontSize: 13, marginTop: 14, lineHeight: 1.6 }} {...reveal}>
          Honesty notes: no X-ray AI is 100% accurate. Even two expert radiologists often disagree on the same film, and these
          labels come from routine reports. "Detected" is set so that about 95% of patients without the condition are not flagged;
          weaker signals are shown as "Possible". Images that aren't chest X-rays (photos, screenshots) are rejected by a pretrained
          X-ray autoencoder. *ResNet-50 alone is not calibrated to the alert level. Reproduce with <span className="mono">ml/extract_features.py</span>
          and <span className="mono">ml/train_heads.py</span>.
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
