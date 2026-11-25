# CXR-RRG — ML service

Local replacement for the old Colab + ngrok backend. It runs on your laptop and
exposes `POST /predict` for the React dashboard.

## Quick start

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r ml/requirements.txt
python ml/server.py          # http://127.0.0.1:8000
```

On first run, TorchXRayVision downloads its pretrained weights (~27 MB) to
`~/.torchxrayvision`. **No training is required.**

Test it:

```bash
curl -F "image=@some_xray.png" http://127.0.0.1:8000/predict
```

## What is in here

| File | Purpose |
|---|---|
| `server.py` | Flask API: `/predict`, `/health` |
| `ensemble.py` | **Deployed predictor**: 5-model ensemble, calibrated heads, input check, heatmaps |
| `extract_features.py`, `train_heads.py` | Build the ensemble heads (see below) |
| `heads/` | Fitted heads and held-out test report |
| `classifier.py` | **Disease detection**: DenseNet-121 from TorchXRayVision (pretrained on NIH, CheXpert, MIMIC-CXR, PadChest and others). Returns probabilities for 18 pathologies, e.g. Atelectasis, Cardiomegaly, Consolidation, Edema, Effusion, Emphysema, Fibrosis, Hernia, Infiltration, Mass, Nodule, Pleural Thickening, Pneumonia, Pneumothorax, Lung Opacity, Lung Lesion, Fracture, Enlarged Cardiomediastinum |
| `inference.py` | Our fine-tuned **Qwen2-VL-2B + LoRA** report generator (MLX, Apple Silicon). Loads `adapters/adapters.safetensors` |
| `adapters/adapters.safetensors` | LoRA weights from `legacy/train_rapid.py` (500 Indiana image-report pairs, 1 epoch) |
| `evaluate.py` | Quick held-out check on a small Indiana sample |
| `evaluate_full.py` | Full per-disease evaluation of several models on all Indiana frontal X-rays |
| `results/` | Saved evaluation output |
| `legacy/` | Original training and test scripts, kept for reference (their dataset paths point to `~/Downloads/...`, which no longer exists) |

## Deployed model: calibrated 5-model ensemble

`server.py` loads `ensemble.py`, which combines:
- 4 DenseNet-121 models (TorchXRayVision `all`, `pc`, `nih`, `chex`) and ResNet-50 at 512 px.
- Small per-disease logistic "heads" (`heads/heads.npz`) fitted on 2,586 Indiana patients. Training them takes
  under a minute; the big networks are **not** retrained.
- Two alert levels per disease: **Detected** (about 95% specificity) and **Possible** (balanced, Youden).
- An input check: the TorchXRayVision chest X-ray autoencoder plus a colour check reject images that aren't
  chest X-rays (screenshots, photos, icons). Real X-rays reconstruct with error <= 0.069 (800 Indiana images),
  while non-X-rays score >= 0.09; the cutoff is 0.075.

Rebuild it (about 35 min to extract scores, then under 1 min to fit):

```bash
python ml/extract_features.py --csv indiana_reports.csv --images <images_normalized> --cache ../cache
python ml/train_heads.py --csv indiana_reports.csv --cache ../cache --out ml/heads/heads.npz
```

### Held-out results (1,109 patients never used for fitting or tuning)

| | Previous single model | Ensemble |
|---|---|---|
| Mean per-disease AUROC | 0.819 | **0.869** |
| Healthy patients with a false "Detected" flag | 41% | **9%** |
| "Most likely diagnosis" matches the radiologist | 48% | **59%** |
| Sick patients flagged "Detected" | 89% | 66% (the rest show as "Possible") |

Per disease (AUROC, before -> after): hernia 0.99 -> 0.99, edema 0.95 -> 0.95, emphysema 0.90 -> 0.93,
effusion 0.93 -> 0.93, cardiomegaly 0.91 -> 0.93, consolidation 0.87 -> 0.92, infiltration 0.81 -> 0.89,
pneumonia 0.78 -> 0.88, atelectasis 0.81 -> 0.84, lung opacity 0.81 -> 0.83, fracture 0.72 -> 0.82,
nodule 0.70 -> 0.76, pneumothorax 0.48 -> 0.63 (only 21 cases; shown only when strongly detected).
Full output: `results/ensemble_training.txt` and `heads/heads_report.json`.

No chest X-ray AI is 100% accurate. Radiologists themselves often disagree, and these labels come from
routine reports. Every result must be reviewed by a radiologist.

## Earlier evaluation: single models on all 3,695 frontal X-rays

Run with `ml/evaluate_full.py`. Raw output is in `ml/results/`. AUROC: 0.5 = chance, 1.0 = perfect.
Ground truth is each radiologist's coded findings ("Problems" field).

| Model | Sick vs healthy AUROC | Mean per-disease AUROC | Saw Indiana in training? |
|---|---|---|---|
| **DenseNet-121 `all` (deployed)** | **0.852** | **0.827** | partly (OpenI) |
| ResNet-50 512px `all` | 0.805 | 0.828 | no (but uncalibrated: 15% sensitivity at the 0.5 threshold, about 1 s per image) |
| DenseNet-121 PadChest | 0.824 | 0.809 | no |
| DenseNet-121 NIH | 0.798 | 0.734 | no |
| DenseNet-121 CheXpert | 0.759 | 0.754 | no |
| DenseNet-121 MIMIC-CXR | 0.677 | 0.698 | no |
| Fine-tuned Qwen2-VL + LoRA (ours) | ~0.50 (called every image normal) | - | yes |

Deployed model, per disease: hiatal hernia 0.975, effusion 0.928, cardiomegaly 0.918, edema 0.914,
mass 0.906, consolidation 0.890, emphysema 0.863, atelectasis 0.810, lung opacity 0.810,
pneumonia 0.793, infiltration 0.761, fracture 0.698, pneumothorax 0.676, nodule 0.635.
At the 0.5 alert threshold it flags 90% of patients with disease (54% specificity).

Models that never saw this dataset reach about the same mean AUROC (0.81–0.83), so the deployed model's
numbers are not inflated by its partial exposure to OpenI.

**The fine-tuned Qwen2-VL model has collapsed.** It answers "heart normal, lungs
clear, no acute abnormality" for almost every image. Likely causes in `train_rapid.py`:

1. Only 500 samples and 1 epoch. Most Indiana reports are normal, so the cheapest
   way to lower the loss is to memorise the "normal" template.
2. The loss is computed on **every** token, including the prompt and hundreds of
   image placeholder tokens, so the report text gets very little training signal.
3. A high learning rate (2e-4), no validation set, and a bare `except: continue`
   that silently skips failed steps.

To reproduce the numbers (requires `indiana_reports.csv` unzipped):

```bash
cd ml
python evaluate_full.py --csv indiana_reports.csv --images "<path>/images_normalized" \
  --out results/eval.json          # all models, per disease (about 30 min on CPU)
python evaluate.py --mode vlm ...  # fine-tuned Qwen2-VL (small sample)
```

> ⚠️ This is a student or research screening aid, not a medical device. Every
> result must be reviewed by a qualified radiologist.
