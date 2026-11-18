"""
Local ML API for CXR-RRG (replaces the old Colab + ngrok notebook).

    python ml/server.py            # http://127.0.0.1:8000

POST /predict  (multipart form, field "image")
  -> {
       "report": "<plain-text report shown/edited in the dashboard>",
       "findings": ["Effusion", ...],             # pathologies >= threshold
       "probabilities": {"Effusion": 0.71, ...},  # all 18, sorted high -> low
       "heatmaps": {"Effusion": "data:image/jpeg;base64,..."},  # top 4 (CAM)
       "crop": "data:image/jpeg;base64,...",      # region the model analysed
       "risk": "high" | "moderate" | "low",
       "threshold": 0.5,
       "inference_ms": 140,
       "model": "torchxrayvision/densenet121-res224-all",
       "vlm_report": "..."   # only if ENABLE_VLM=1 (fine-tuned Qwen2-VL, experimental)
     }
GET /health
"""
import os
import tempfile
import time

from flask import Flask, jsonify, request
from flask_cors import CORS

from classifier import THRESHOLD, WEIGHTS, CXRClassifier

ALLOWED = {".png", ".jpg", ".jpeg"}
ENABLE_VLM = os.environ.get("ENABLE_VLM") == "1"

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024
app.json.sort_keys = False  # keep probabilities ordered high -> low
CORS(app)

print("Loading classifier...")
classifier = CXRClassifier()
vlm = None
if ENABLE_VLM:
    from inference import CXRModel

    print("Loading fine-tuned Qwen2-VL (experimental)...")
    vlm = CXRModel(use_adapters=True)
print("Ready.")

READABLE = {
    "Effusion": "Pleural effusion",
    "Pleural_Thickening": "Pleural thickening",
    "Enlarged Cardiomediastinum": "Enlarged cardiomediastinum",
    "Lung Opacity": "Lung opacity",
    "Lung Lesion": "Lung lesion",
}


def readable(k):
    return READABLE.get(k, k)


def risk_level(probs):
    top = max(probs.values())
    if top >= 0.6:
        return "high"
    if top >= THRESHOLD:
        return "moderate"
    return "low"


def build_report(probs):
    positives = [(k, v) for k, v in probs.items() if v >= THRESHOLD]
    borderline = [(k, v) for k, v in probs.items() if 0.4 <= v < THRESHOLD]
    lines = ["FINDINGS"]
    if positives:
        lines += [f"- {readable(k)} suspected ({v:.0%} probability)." for k, v in positives]
    else:
        lines.append("- No pathology detected above the alert threshold.")
    if borderline:
        lines.append(
            "- Borderline: "
            + ", ".join(f"{readable(k)} ({v:.0%})" for k, v in borderline)
            + "."
        )
    lines += [
        "",
        "IMPRESSION",
        (
            ", ".join(readable(k) for k, _ in positives)
            + " suspected. Radiologist review recommended."
            if positives
            else "No acute cardiopulmonary abnormality detected by the model."
        ),
    ]
    return "\n".join(lines)


@app.get("/health")
def health():
    return jsonify(status="ok", classifier=WEIGHTS, vlm=bool(vlm), threshold=THRESHOLD)


@app.post("/predict")
def predict():
    f = request.files.get("image")
    if f is None or not f.filename:
        return jsonify(error="Image file is required (form field 'image')"), 400
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ALLOWED:
        return jsonify(error=f"Unsupported file type {ext or '(none)'}. Use PNG or JPG."), 400

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        f.save(tmp.name)
        path = tmp.name
    try:
        t0 = time.time()
        res = classifier.analyze(path)
        probs = res["probabilities"]
        out = {
            "report": build_report(probs),
            "findings": classifier.findings(probs),
            "probabilities": {k: round(v, 4) for k, v in probs.items()},
            "heatmaps": res["heatmaps"],
            "crop": res["crop"],
            "risk": risk_level(probs),
            "threshold": THRESHOLD,
            "model": f"torchxrayvision/{WEIGHTS}",
        }
        if vlm is not None:
            out["vlm_report"] = vlm.generate_report(path)
        out["inference_ms"] = int((time.time() - t0) * 1000)
        return jsonify(out)
    except Exception as e:  # bad/corrupt image etc.
        return jsonify(error=f"Could not analyze image: {e}"), 422
    finally:
        os.unlink(path)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("ML_PORT", 8000)))
