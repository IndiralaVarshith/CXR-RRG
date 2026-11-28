import { motion } from "framer-motion";
import { ShieldCheck, Zap, Eye } from "lucide-react";
import Logo from "./Logo";
import "./auth.css";

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <div className="auth-form-side">
        <div className="auth-top">
          <Logo />
        </div>
        <motion.div
          className="auth-card"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1>{title}</h1>
          <p className="muted auth-sub">{subtitle}</p>
          {children}
          <div className="auth-footer muted">{footer}</div>
        </motion.div>
        <p className="faint auth-legal">Screening aid only. Not a medical diagnosis.</p>
      </div>

      <div className="auth-visual">
        <div className="auth-visual-inner">
          <div className="auth-xray panel brackets">
            <img src="/assets/hero-xray.jpg" alt="" />
            <img src="/assets/hero-heatmap.jpg" alt="" className="heat" />
            <div className="scanline" />
            <span className="auth-xray-tag mono"><span className="dot pulse" style={{ color: "var(--danger)" }} /> RUL · MASS 51%</span>
          </div>
          <blockquote>
            “Every probability comes with a picture of <span className="gradient-text">where</span> the model looked.”
          </blockquote>
          <div className="auth-points">
            <span><Zap size={15} /> Results in seconds</span>
            <span><Eye size={15} /> Attention heatmaps</span>
            <span><ShieldCheck size={15} /> Reports private to your account</span>
          </div>
        </div>
      </div>
    </div>
  );
}
