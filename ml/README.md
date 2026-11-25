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
| `classifier.py` | **Disease detection**: DenseNet-121 from TorchXRayVision (pretrained on NIH, CheXpert, MIMIC-CXR, PadChest and others). Returns probabilities for 18 pathologies, e.g. Atelectasis, Cardiomegaly, Consolidation, Edema, Effusion, Emphysema, Fibrosis, Hernia, Infiltration, Mass, Nodule, Pleural Thickening, Pneumonia, Pneumothorax, Lung Opacity, Lung Lesion, Fracture, Enlarged Cardiomediastinum |
| `inference.py` | Our fine-tuned **Qwen2-VL-2B + LoRA** report generator (MLX, Apple Silicon). Loads `adapters/adapters.safetensors` |
| `adapters/adapters.safetensors` | LoRA weights from `legacy/train_rapid.py` (500 Indiana image-report pairs, 1 epoch) |
| `evaluate.py` | Quick held-out check on a small Indiana sample |
| `evaluate_full.py` | Full per-disease evaluation of several models on all Indiana frontal X-rays |
| `results/` | Saved evaluation output |
| `legacy/` | Original training and test scripts, kept for reference (their dataset paths point to `~/Downloads/...`, which no longer exists) |

## Evaluation: full Indiana University set (3,695 frontal X-rays)

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
