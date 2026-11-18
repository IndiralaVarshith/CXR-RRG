import { motion } from "framer-motion";

const TONE = { danger: "var(--danger)", warn: "var(--warn)", ok: "var(--ok)" };

export default function RiskGauge({ value = 0, tone = "ok", size = 150 }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const arc = c * 0.75;
  const color = TONE[tone];
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg viewBox="0 0 140 140" width={size} height={size} style={{ transform: "rotate(135deg)" }}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="10" strokeDasharray={`${arc} ${c}`} strokeLinecap="round" />
        <motion.circle
          cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${arc} ${c}`}
          initial={{ strokeDashoffset: arc }}
          animate={{ strokeDashoffset: arc * (1 - value) }}
          transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 8px ${color})` }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: size * 0.24, fontWeight: 700, color }}>
            {Math.round(value * 100)}<span style={{ fontSize: size * 0.12 }}>%</span>
          </div>
          <div className="mono faint" style={{ fontSize: 10, letterSpacing: "0.14em" }}>PEAK SIGNAL</div>
        </div>
      </div>
    </div>
  );
}
