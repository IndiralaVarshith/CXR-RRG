import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { label, RISK } from "./pathologies";

const TEAL = [10, 159, 154];
const INK = [11, 22, 34];
const GREY = [98, 116, 138];

const toDataUrl = (src) =>
  new Promise((resolve) => {
    if (!src) return resolve(null);
    if (src instanceof Blob) {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(src);
      return;
    }
    if (String(src).startsWith("data:")) return resolve(src);
    fetch(src)
      .then((res) => (res.ok ? res.blob() : null))
      .then((b) => (b ? toDataUrl(b).then(resolve) : resolve(null)))
      .catch(() => resolve(null));
  });

/**
 * data: {
 *   id, patientName, ectNumber, userName, userEmail, createdAt, notes,
 *   reportText, probabilities, findings, risk, model,
 *   image (File | Blob | url | dataURL), heatmap (dataURL, optional), heatmapLabel
 * }
 */
export async function downloadReportPDF(data) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;

  // header band
  doc.setFillColor(5, 8, 13);
  doc.rect(0, 0, W, 30, "F");
  doc.setFillColor(...TEAL);
  doc.rect(0, 30, W, 1.2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("CXR-RRG", M, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(160, 200, 210);
  doc.text("AI CHEST X-RAY SCREENING REPORT", M, 21);
  doc.setTextColor(255, 255, 255);
  doc.text(`Report ID: ${data.id || "UNSAVED"}`, W - M, 14, { align: "right" });
  doc.text(new Date(data.createdAt || Date.now()).toLocaleString(), W - M, 21, { align: "right" });

  // patient table
  autoTable(doc, {
    startY: 38,
    theme: "plain",
    styles: { fontSize: 9.5, cellPadding: 2.4, textColor: INK },
    columnStyles: { 0: { textColor: GREY, cellWidth: 34 }, 2: { textColor: GREY, cellWidth: 30 } },
    body: [
      ["Patient", data.patientName || "-", "Reference no.", data.ectNumber || "-"],
      ["Requested by", data.userName || "-", "Account", data.userEmail || "-"],
      ["Model", data.model || "torchxrayvision/densenet121-res224-all", "Risk level", RISK[data.risk]?.label || "-"],
    ],
    margin: { left: M, right: M },
  });

  let y = doc.lastAutoTable.finalY + 6;

  // images
  const img = await toDataUrl(data.image);
  const heat = await toDataUrl(data.heatmap);
  const boxW = heat ? (W - 2 * M - 6) / 2 : 80;
  const drawImg = (src, x, caption) => {
    try {
      const p = doc.getImageProperties(src);
      const r = Math.min(boxW / p.width, 78 / p.height);
      const w = p.width * r;
      const h = p.height * r;
      doc.setFillColor(5, 8, 13);
      doc.roundedRect(x, y, boxW, 78, 2, 2, "F");
      doc.addImage(src, x + (boxW - w) / 2, y + (78 - h) / 2, w, h);
      doc.setFontSize(8);
      doc.setTextColor(...GREY);
      doc.text(caption, x, y + 83);
    } catch (e) {
      /* unsupported image: skip */
    }
  };
  if (img || heat) {
    if (img) drawImg(img, M, "Source radiograph");
    if (heat) drawImg(heat, img ? M + boxW + 6 : M, `AI attention map: ${label(data.heatmapLabel || "")}`);
    y += 90;
  }

  // findings table
  const probs = Object.entries(data.probabilities || {}).sort((a, b) => b[1] - a[1]);
  if (probs.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text("Pathology probabilities", M, y);
    autoTable(doc, {
      startY: y + 3,
      head: [["Pathology", "Probability", "Status"]],
      body: probs.map(([k, v]) => [label(k), `${(v * 100).toFixed(1)}%`, v >= 0.5 ? "POSITIVE" : v >= 0.4 ? "Borderline" : "-"]),
      theme: "striped",
      headStyles: { fillColor: TEAL, textColor: 255, fontSize: 9 },
      styles: { fontSize: 8.6, cellPadding: 1.8 },
      didParseCell: (h) => {
        if (h.section === "body" && h.column.index === 2 && h.cell.raw === "POSITIVE") {
          h.cell.styles.textColor = [224, 57, 63];
          h.cell.styles.fontStyle = "bold";
        }
      },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  const writeBlock = (title, text) => {
    if (!text) return;
    if (y > H - 40) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(title, M, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40, 52, 66);
    doc.splitTextToSize(text, W - 2 * M).forEach((line) => {
      if (y > H - 22) { doc.addPage(); y = 20; }
      doc.text(line, M, y);
      y += 5;
    });
    y += 4;
  };
  writeBlock("Report", data.reportText);
  writeBlock("Clinical notes", data.notes);

  // footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(220, 226, 232);
    doc.line(M, H - 14, W - M, H - 14);
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY);
    doc.text(
      "AI-generated screening aid. Not a medical diagnosis. Must be reviewed and confirmed by a qualified radiologist.",
      M, H - 9
    );
    doc.text(`Page ${i} / ${pages}`, W - M, H - 9, { align: "right" });
  }

  const name = (data.patientName || "report").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`cxr-rrg-${name}-${String(data.id || Date.now()).slice(-6)}.pdf`);
}
