// Plain-language reference for the 18 pathologies the classifier outputs.
export const PATHOLOGIES = {
  Atelectasis: { label: "Atelectasis", region: "Lung", desc: "Partial or complete collapse of lung tissue, reducing air volume." },
  Consolidation: { label: "Consolidation", region: "Lung", desc: "Airspaces filled with fluid, pus or cells, often seen in pneumonia." },
  Infiltration: { label: "Infiltration", region: "Lung", desc: "Abnormal substance spreading through lung tissue, such as fluid or cells." },
  Pneumothorax: { label: "Pneumothorax", region: "Pleura", desc: "Air in the pleural space causing lung collapse. Can be an emergency." },
  Edema: { label: "Edema", region: "Lung", desc: "Fluid build-up in the lungs, frequently linked to heart failure." },
  Emphysema: { label: "Emphysema", region: "Lung", desc: "Damaged, over-inflated air sacs, commonly from long-term smoking (COPD)." },
  Fibrosis: { label: "Fibrosis", region: "Lung", desc: "Scarring and stiffening of lung tissue." },
  Effusion: { label: "Pleural Effusion", region: "Pleura", desc: "Excess fluid between the lung and the chest wall." },
  Pneumonia: { label: "Pneumonia", region: "Lung", desc: "Infection inflaming the air sacs, which may fill with fluid." },
  Pleural_Thickening: { label: "Pleural Thickening", region: "Pleura", desc: "Thickened lining of the lungs, often from prior inflammation or asbestos." },
  Cardiomegaly: { label: "Cardiomegaly", region: "Heart", desc: "Enlarged heart silhouette on the X-ray." },
  Nodule: { label: "Nodule", region: "Lung", desc: "Small round spot (< 3 cm) in the lung. Usually benign but needs follow-up." },
  Mass: { label: "Mass", region: "Lung", desc: "Lesion larger than 3 cm. Needs further evaluation, e.g. a CT scan." },
  Hernia: { label: "Hernia", region: "Diaphragm", desc: "Abdominal contents pushing up through the diaphragm." },
  "Lung Lesion": { label: "Lung Lesion", region: "Lung", desc: "Any abnormal area of lung tissue." },
  Fracture: { label: "Fracture", region: "Bone", desc: "Break in a visible bone such as a rib or clavicle." },
  "Lung Opacity": { label: "Lung Opacity", region: "Lung", desc: "Area that appears whiter than normal lung, a non-specific sign of disease." },
  "Enlarged Cardiomediastinum": { label: "Enlarged Cardiomediastinum", region: "Mediastinum", desc: "Widened central chest shadow (heart and great vessels)." },
};

export const label = (k) => PATHOLOGIES[k]?.label || k;

export const level = (p, threshold = 0.5) => (p >= threshold ? "pos" : p >= 0.4 ? "border" : "neg");

export const levelColor = (p, threshold = 0.5) =>
  p >= threshold ? "var(--danger)" : p >= 0.4 ? "var(--warn)" : "var(--accent)";

export const RISK = {
  high: { label: "High attention", tone: "danger", text: "Significant findings detected. Prioritise radiologist review." },
  moderate: { label: "Review advised", tone: "warn", text: "Findings near the alert threshold. Radiologist review recommended." },
  low: { label: "No acute findings", tone: "ok", text: "No pathology above the alert threshold." },
};

export const riskFrom = (aiReport) => {
  if (aiReport?.risk) return aiReport.risk;
  const probs = aiReport?.probabilities;
  if (probs && Object.keys(probs).length) {
    const top = Math.max(...Object.values(probs));
    return top >= 0.6 ? "high" : top >= 0.5 ? "moderate" : "low";
  }
  return null;
};

// Radiographic signs that describe *what is seen* rather than a disease.
// When a specific disease is also flagged, it is shown as the primary diagnosis.
const SIGNS = new Set(["Lung Opacity", "Infiltration", "Lung Lesion", "Enlarged Cardiomediastinum"]);
const BORDERLINE = 0.4;

export function summarize(probabilities = {}, threshold = 0.5) {
  const rows = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  const detected = rows.filter(([, v]) => v >= threshold);
  const possible = rows.filter(([, v]) => v >= BORDERLINE && v < threshold);
  const specific = detected.filter(([k]) => !SIGNS.has(k));
  const primary = specific[0] || detected[0] || null;
  return { rows, detected, possible, primary, top: rows[0] };
}
