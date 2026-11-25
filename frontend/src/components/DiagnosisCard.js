import { motion } from "framer-motion";
import { Stethoscope, CheckCircle2, AlertTriangle, MapPin, Timer, ShieldCheck } from "lucide-react";
import { label, levelColor, PATHOLOGIES, summarize } from "../lib/pathologies";
import { THRESHOLD } from "../config";

const REL = {
  high: { label: "High reliability", short: "High", tone: "ok" },
  medium: { label: "Medium reliability", short: "Medium", tone: "warn" },
  low: { label: "Low reliability", short: "Low", tone: "danger" },
  unvalidated: { label: "Not validated", short: "Unverified", tone: "neutral" },
};

export function Reliability({ info, compact }) {
  if (!info) return null;
  const r = REL[info.level] || REL.unvalidated;
  const tip = info.auroc != null
    ? `Tested on held-out Indiana patients: AUROC ${info.auroc.toFixed(2)} (0.5 = chance, 1.0 = perfect)`
    : "This condition had too few cases in the test data to measure accuracy";
  return (
    <span className={`chip ${r.tone} rel-chip`} title={tip} style={compact ? { height: 22, fontSize: 10.5 } : undefined}>
      <ShieldCheck size={compact ? 11 : 12} /> {compact ? r.short : r.label}
      {!compact && info.auroc != null && <span className="mono" style={{ opacity: 0.8 }}>· {info.auroc.toFixed(2)}</span>}
    </span>
  );
}

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
  const rel = result.reliability || {};
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
              <Reliability info={rel[main[0]]} />
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
                    <Reliability info={rel[k]} compact />
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

      {result.abnormal_score != null && (
        <div className="dx-overall">
          <span className="mono">Overall abnormality score</span>
          <b style={{ color: levelColor(result.abnormal_score, threshold) }}>{(result.abnormal_score * 100).toFixed(0)}%</b>
          <Bar value={result.abnormal_score} color={levelColor(result.abnormal_score, threshold)} height={6} />
        </div>
      )}

      <p className="faint dx-note">
        Each condition has its own alert level, tuned on 3,695 real patients and placed at 50% on every bar. Reliability shows how
        accurate the AI proved for that condition on patients it never saw.
      </p>
    </section>
  );
}
