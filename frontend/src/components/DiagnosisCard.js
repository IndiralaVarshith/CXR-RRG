import { motion } from "framer-motion";
import { Stethoscope, CheckCircle2, AlertTriangle, MapPin, Timer } from "lucide-react";
import { label, levelColor, PATHOLOGIES, summarize } from "../lib/pathologies";
import { THRESHOLD } from "../config";

function Bar({ value, color, height = 10, delay = 0 }) {
  return (
    <div className="dx-track" style={{ height }}>
      <motion.div
        className="dx-fill"
        style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${color} 35%, transparent), ${color})`, boxShadow: `0 0 16px color-mix(in srgb, ${color} 45%, transparent)` }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(2, value * 100)}%` }}
        transition={{ duration: 1.1, delay, ease: [0.22, 1, 0.36, 1] }}
      />
      <span className="dx-threshold" style={{ left: `${THRESHOLD * 100}%` }} />
    </div>
  );
}

export default function DiagnosisCard({ result, selected, onSelect }) {
  const threshold = result.threshold || THRESHOLD;
  const { detected, possible, primary, top } = summarize(result.probabilities, threshold);
  const heat = result.heatmaps || {};
  const clear = !primary;
  const main = primary || top;
  const color = clear ? "var(--ok)" : levelColor(main[1], threshold);
  const conditions = [...detected.map((d) => [...d, "detected"]), ...possible.map((d) => [...d, "possible"])];

  return (
    <section className={`panel panel-pad dx ${clear ? "clear" : "flag"}`}>
      <div className="panel-title">
        <h3><Stethoscope size={16} /> AI diagnosis</h3>
        <span className="faint mono" style={{ fontSize: 11, display: "inline-flex", gap: 5, alignItems: "center" }}>
          {result.inference_ms != null && <><Timer size={12} /> {result.inference_ms} ms</>}
        </span>
      </div>

      {/* primary */}
      <div className="dx-primary">
        <span className="dx-kicker mono">{clear ? "Result" : "Most likely diagnosis"}</span>
        <div className="dx-head">
          <motion.h2 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} style={{ color: clear ? "var(--ok)" : "var(--text)" }}>
            {clear ? "No disease detected" : label(main[0])}
          </motion.h2>
          {!clear && (
            <motion.div className="dx-pct" style={{ color }} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
              {(main[1] * 100).toFixed(0)}<span>%</span>
            </motion.div>
          )}
        </div>
        {!clear ? (
          <>
            <Bar value={main[1]} color={color} height={12} />
            <p className="dx-desc">
              {PATHOLOGIES[main[0]]?.region && <span className="chip neutral"><MapPin size={12} /> {PATHOLOGIES[main[0]].region}</span>}
              <span className="muted">{PATHOLOGIES[main[0]]?.desc}</span>
            </p>
          </>
        ) : (
          <p className="muted dx-desc">
            None of the 18 conditions reached the {Math.round(threshold * 100)}% alert level. Highest score:{" "}
            <b style={{ color: "var(--text)" }}>{label(top[0])} {(top[1] * 100).toFixed(0)}%</b>.
          </p>
        )}
      </div>

      {/* all detected / possible conditions */}
      {conditions.length > 0 && (
        <div className="dx-list">
          <div className="dx-list-head mono">
            <span>Conditions found ({detected.length} detected{possible.length ? `, ${possible.length} possible` : ""})</span>
            <span>AI confidence</span>
          </div>
          {conditions.map(([k, v, status], i) => {
            const c = levelColor(v, threshold);
            const can = !!heat[k];
            return (
              <button
                key={k}
                className={`dx-row ${selected === k ? "on" : ""}`}
                onClick={() => can && onSelect?.(k)}
                disabled={!can}
                title={can ? "Show where the AI found this" : PATHOLOGIES[k]?.desc}
              >
                <div className="dx-row-top">
                  <span className="dx-name">
                    {status === "detected" ? <AlertTriangle size={14} style={{ color: c }} /> : <span className="dot" style={{ color: c }} />}
                    {label(k)}
                    <span className={`chip ${status === "detected" ? "danger" : "warn"}`} style={{ height: 22, fontSize: 11 }}>
                      {status === "detected" ? "Detected" : "Possible"}
                    </span>
                  </span>
                  <span className="dx-val mono" style={{ color: c }}>{(v * 100).toFixed(1)}%</span>
                </div>
                <Bar value={v} color={c} height={7} delay={0.15 + i * 0.07} />
              </button>
            );
          })}
        </div>
      )}

      {clear && (
        <div className="dx-ok"><CheckCircle2 size={16} /> Lungs, heart and pleura look within normal limits to the model.</div>
      )}

      <p className="faint dx-note">
        Scores are calibrated so that {Math.round(threshold * 100)}% is the alert level (marked on each bar). They show how strongly
        the image matches each condition, not a guaranteed chance of disease.
      </p>
    </section>
  );
}
