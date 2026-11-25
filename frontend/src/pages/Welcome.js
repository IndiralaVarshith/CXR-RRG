import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Upload, BrainCircuit, FileText, ShieldCheck, Zap, Eye, Lock, Layers, Activity, MoveHorizontal,
} from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { PATHOLOGIES } from "../lib/pathologies";
import { getUser } from "../lib/auth";
import "./welcome.css";

const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
};

const DATASETS = ["NIH ChestX-ray14", "CheXpert", "MIMIC-CXR", "PadChest", "RSNA Pneumonia", "OpenI", "Google NIH labels"];

function HeroScanner() {
  return (
    <div className="scanner panel brackets">
      <div className="scanner-hud top">
        <span className="mono"><span className="dot pulse" style={{ color: "var(--danger)" }} /> LIVE INFERENCE</span>
        <span className="mono faint">PA · 224×224 · DenseNet-121</span>
      </div>
      <div className="scanner-view">
        <img src="/assets/hero-xray.jpg" alt="Chest radiograph" className="scanner-img" />
        <img src="/assets/hero-heatmap.jpg" alt="" className="scanner-img heat" />
        <div className="scanline" />
        <div className="scan-glow" />
        <div className="crosshair" style={{ left: "45%", top: "21%" }}><span /></div>
        <motion.div className="float-tag danger" style={{ left: "52%", top: "12%" }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6 }}>
          <span className="dot" /> Mass <b className="mono">51.0%</b>
        </motion.div>
        <motion.div className="float-tag warn" style={{ left: "6%", top: "56%" }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.0 }}>
          <span className="dot" /> Lung Opacity <b className="mono">48.0%</b>
        </motion.div>
        <motion.div className="float-tag ok" style={{ right: "6%", bottom: "9%" }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.4 }}>
          <span className="dot" /> Cardiomegaly <b className="mono">12.9%</b>
        </motion.div>
      </div>
      <div className="scanner-hud bottom">
        {[["18", "pathologies"], ["0.12s", "inference"], ["CAM", "explainable"]].map(([v, l]) => (
          <div key={l}><b>{v}</b><span className="mono faint">{l}</span></div>
        ))}
      </div>
    </div>
  );
}

function CompareSlider() {
  const ref = useRef(null);
  const [pos, setPos] = useState(28);
  const move = (clientX) => {
    const r = ref.current.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <div
      ref={ref}
      className="compare panel brackets"
      onMouseMove={(e) => e.buttons === 1 && move(e.clientX)}
      onMouseDown={(e) => move(e.clientX)}
      onTouchMove={(e) => move(e.touches[0].clientX)}
    >
      <img src="/assets/hero-heatmap.jpg" alt="AI attention map" draggable="false" />
      <div className="compare-top" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src="/assets/hero-xray.jpg" alt="Original radiograph" draggable="false" />
      </div>
      <div className="compare-handle" style={{ left: `${pos}%` }}>
        <span><MoveHorizontal size={16} /></span>
      </div>
      <span className="compare-label l mono">ORIGINAL</span>
      <span className="compare-label r mono">AI ATTENTION</span>
    </div>
  );
}

export default function Welcome() {
  const user = getUser();
  const cta = user ? "/dashboard" : "/register";

  return (
    <div className="page">
      <Navbar />

      {/* HERO */}
      <section className="hero container">
        <div className="hero-copy">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="chip"><span className="dot pulse" /> Explainable chest X-ray AI</span>
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}>
            See what the X-ray<br />is <span className="gradient-text">telling you.</span>
          </motion.h1>
          <motion.p className="hero-sub" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.25 }}>
            CXR-RRG screens a chest radiograph for 18 thoracic pathologies in under a second. It shows
            exactly where it looked and drafts a structured report your radiologist can review, edit and sign off.
          </motion.p>
          <motion.div className="hero-ctas" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.4 }}>
            <Link to={cta} className="btn btn-primary btn-lg">
              {user ? "Open workspace" : "Start analyzing"} <ArrowRight size={18} />
            </Link>
            <Link to="/features" className="btn btn-ghost btn-lg">How it works</Link>
          </motion.div>
          <motion.div className="hero-trust" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
            <span><ShieldCheck size={15} /> Runs on your machine</span>
            <span><Lock size={15} /> No images leave the clinic</span>
            <span><Eye size={15} /> Visual explanations</span>
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.94, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 1.1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <HeroScanner />
        </motion.div>
      </section>

      {/* DATASETS STRIP */}
      <section className="strip">
        <div className="container strip-inner">
          <span className="mono faint">MODEL PRETRAINED ON 7 PUBLIC DATASETS</span>
          <div className="marquee">
            <div className="marquee-track">
              {[...DATASETS, ...DATASETS].map((d, i) => <span key={i}>{d}</span>)}
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section container">
        <motion.div className="section-head" {...reveal}>
          <span className="eyebrow">Workflow</span>
          <h2>From radiograph to report<br />in three steps.</h2>
          <p>A workflow built for clinicians: fast, transparent, and always keeping a human in the loop.</p>
        </motion.div>
        <div className="steps">
          {[
            { icon: Upload, n: "01", t: "Upload", d: "Drop a PA or AP chest X-ray (PNG or JPG). Add patient details and clinical notes." },
            { icon: BrainCircuit, n: "02", t: "Analyze", d: "A DenseNet-121 scores 18 pathologies, and class-activation maps highlight the regions behind each score." },
            { icon: FileText, n: "03", t: "Report", d: "Review and edit the auto-drafted findings, then save to the patient history or export a PDF." },
          ].map(({ icon: Icon, n, t, d }, i) => (
            <motion.div key={n} className="step panel panel-pad" {...reveal} transition={{ ...reveal.transition, delay: i * 0.12 }}>
              <div className="step-top">
                <span className="step-icon"><Icon size={22} /></span>
                <span className="mono faint">{n}</span>
              </div>
              <h3>{t}</h3>
              <p className="muted">{d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* EXPLAINABILITY */}
      <section className="section container explain">
        <motion.div {...reveal}>
          <span className="eyebrow">Explainability</span>
          <h2 className="explain-title">Not a black box.<br /><span className="gradient-text">Every score has a location.</span></h2>
          <p className="muted explain-sub">
            Drag across the image. The heatmap is a class-activation map computed straight from the network's
            final layer. It shows the exact region that pushed the model towards each finding. In this
            held-out case, the radiologist reported a right-upper-lobe opacity with a possible mass, and the model
            highlights exactly that region.
          </p>
          <ul className="explain-list">
            <li><Layers size={18} /> Per-pathology attention maps for the top findings</li>
            <li><Activity size={18} /> Calibrated probabilities with a clear 50% alert threshold</li>
            <li><Zap size={18} /> CPU inference in about 120 ms, with no GPU required</li>
          </ul>
        </motion.div>
        <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.15 }}>
          <CompareSlider />
        </motion.div>
      </section>

      {/* PATHOLOGIES */}
      <section className="section container">
        <motion.div className="section-head center" {...reveal}>
          <span className="eyebrow">Coverage</span>
          <h2>18 thoracic pathologies.<br />One pass.</h2>
          <p>Each one is scored independently, so co-existing conditions are detected together.</p>
        </motion.div>
        <div className="path-grid">
          {Object.entries(PATHOLOGIES).map(([k, p], i) => (
            <motion.div key={k} className="path-card" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: (i % 6) * 0.05 }}>
              <span className="mono path-region">{p.region}</span>
              <h4>{p.label}</h4>
              <p>{p.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* METRICS */}
      <section className="section container">
        <div className="metrics panel">
          {[
            ["0.852", "AUROC", "sick vs healthy, tested on 3,695 Indiana X-rays"],
            ["90%", "Sensitivity", "of patients with disease flagged for review"],
            ["~120ms", "Latency", "per image on a laptop CPU"],
            ["100%", "Local", "no cloud upload of patient data"],
          ].map(([v, t, d], i) => (
            <motion.div key={t} className="metric" {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }}>
              <div className="metric-val gradient-text">{v}</div>
              <div className="metric-title">{t}</div>
              <div className="metric-desc faint">{d}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="section container" style={{ paddingTop: 0 }}>
        <motion.div className="cta-band panel brackets" {...reveal}>
          <div>
            <h2>Ready to read your first study?</h2>
            <p className="muted">Create a free workspace and analyze a chest X-ray in seconds.</p>
          </div>
          <Link to={cta} className="btn btn-primary btn-lg">
            {user ? "Open workspace" : "Create workspace"} <ArrowRight size={18} />
          </Link>
        </motion.div>
      </section>

      <Footer />
    </div>
  );
}
