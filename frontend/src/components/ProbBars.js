import { motion } from "framer-motion";
import { label, level, levelColor, PATHOLOGIES } from "../lib/pathologies";
import { THRESHOLD } from "../config";

export default function ProbBars({ probabilities = {}, selected, onSelect, selectable = [], limit }) {
  const rows = Object.entries(probabilities).sort((a, b) => b[1] - a[1]).slice(0, limit || undefined);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {rows.map(([k, v], i) => {
        const lv = level(v, THRESHOLD);
        const can = selectable.includes(k);
        return (
          <div
            key={k}
            className={`prob-row ${lv} ${can ? "clickable" : ""} ${selected === k ? "selected" : ""}`}
            onClick={() => can && onSelect && onSelect(k)}
            title={PATHOLOGIES[k]?.desc}
          >
            <div className="prob-name">
              <span style={{ width: 7, height: 7, borderRadius: 4, flexShrink: 0, background: levelColor(v), boxShadow: lv !== "neg" ? `0 0 10px ${levelColor(v)}` : "none" }} />
              <span>{label(k)}</span>
            </div>
            <div className="prob-track">
              <motion.div
                className="prob-fill"
                style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${levelColor(v)} 30%, transparent), ${levelColor(v)})` }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(2, v * 100)}%` }}
                transition={{ duration: 0.9, delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] }}
              />
              <span className="threshold" />
            </div>
            <div className="prob-val">{(v * 100).toFixed(1)}%</div>
          </div>
        );
      })}
    </div>
  );
}
