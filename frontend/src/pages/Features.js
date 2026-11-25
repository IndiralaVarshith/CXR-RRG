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

// Full Indiana University set: 3,695 frontal X-rays (ml/evaluate_full.py, ml/results/)
const EVAL = [
  { m: "DenseNet-121 \u00b7 all (deployed)", seen: true, auc: "0.852", mean: "0.827", sens: "90%", spec: "54%", t: "0.12 s", ok: true },
  { m: "ResNet-50 \u00b7 512px (never saw Indiana)", seen: false, auc: "0.805", mean: "0.828", sens: "15%*", spec: "99%", t: "\u2248 1 s", ok: true },
  { m: "DenseNet-121 \u00b7 PadChest (never saw Indiana)", seen: false, auc: "0.824", mean: "0.809", sens: "89%", spec: "52%", t: "0.12 s", ok: true },
  { m: "DenseNet-121 \u00b7 CheXpert", seen: false, auc: "0.759", mean: "0.754", sens: "77%", spec: "59%", t: "0.12 s", ok: true },
  { m: "DenseNet-121 \u00b7 NIH", seen: false, auc: "0.798", mean: "0.734", sens: "92%", spec: "38%", t: "0.12 s", ok: true },
  { m: "Fine-tuned Qwen2-VL-2B + LoRA (ours)", seen: false, auc: "\u22480.50", mean: "-", sens: "0%", spec: "100%", t: "4.8 s", ok: false },
];

// Deployed model, per disease (AUROC, number of positive patients)
const PER_DISEASE = [
  ["Hiatal hernia", 0.975, 43], ["Pleural effusion", 0.928, 139], ["Cardiomegaly", 0.918, 324], ["Edema", 0.914, 41],
  ["Mass", 0.906, 15], ["Consolidation", 0.89, 27], ["Emphysema", 0.863, 137], ["Atelectasis", 0.81, 299],
  ["Lung opacity", 0.81, 471], ["Pneumonia", 0.793, 37], ["Infiltration", 0.761, 58], ["Fracture", 0.698, 82],
  ["Pneumothorax", 0.676, 21], ["Nodule", 0.635, 101],
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
          <p>
            Tested on every frontal chest X-ray in the Indiana University dataset: <b>3,695 patients</b>, with each radiologist's coded
            findings used as ground truth. AUROC measures how well the score separates patients with a disease from those without it
            (0.5 = coin flip, 1.0 = perfect).
          </p>
        </motion.div>

        <motion.div className="panel panel-pad" {...reveal}>
          <div className="panel-title"><h3><CheckCircle2 size={16} /> Deployed model · accuracy per disease</h3></div>
          <div className="dz-grid">
            {PER_DISEASE.map(([name, a, n], i) => {
              const [g, c] = grade(a);
              return (
                <motion.div key={name} className="dz" initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }}>
                  <div className="dz-top"><span>{name}</span><b className="mono" style={{ color: c }}>{a.toFixed(3)}</b></div>
                  <div className="dz-bar"><motion.span style={{ background: c }} initial={{ width: 0 }} whileInView={{ width: `${((a - 0.5) / 0.5) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9, delay: i * 0.03 }} /></div>
                  <div className="dz-meta mono faint"><span style={{ color: c }}>{g}</span><span>{n} patients</span></div>
                </motion.div>
              );
            })}
          </div>
          <p className="faint" style={{ fontSize: 12.5, marginTop: 16 }}>Bars run from 0.5 (chance) to 1.0 (perfect). Weak areas: small nodules, pneumothorax and fractures. Don't rely on the AI for these.</p>
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
          Honesty notes: the deployed model's training data included part of this dataset (OpenI), so its scores are slightly
          optimistic. Models that never saw it score about the same (0.81–0.83 mean AUROC), which confirms the accuracy holds up.
          *ResNet-50 is not calibrated to the 50% alert level, hence its low sensitivity. Our fine-tuned report generator collapsed
          (it called every X-ray normal) and is disabled. Reproduce with <span className="mono">ml/evaluate_full.py</span>.
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
