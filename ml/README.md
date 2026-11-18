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
| `evaluate.py` | Held-out evaluation on the Indiana dataset |
| `legacy/` | Original training and test scripts, kept for reference (their dataset paths point to `~/Downloads/...`, which no longer exists) |

## Evaluation (held-out Indiana University CXR, uid > 1500, frontal views)

| Model | Images | AUROC normal vs abnormal | Sensitivity | Specificity | Time/img |
|---|---|---|---|---|---|
| Fine-tuned Qwen2-VL (ours) | 40 | ~0.50 | **0 %** (0/20) | 100 % | 4.8 s |
| TorchXRayVision DenseNet | 40 | **0.895** | 90 % | 70 % | 0.12 s |
| TorchXRayVision DenseNet | 200 | 0.742 | 81 % | 54 % | 0.12 s |

**The fine-tuned Qwen2-VL model has collapsed.** It answers "heart normal, lungs
clear, no acute abnormality" for almost every image (4 distinct outputs across 40
images). Likely causes in `train_rapid.py`:

1. Only 500 samples and 1 epoch. Most Indiana reports are normal, so the cheapest
   way to lower the loss is to memorise the "normal" template.
2. The loss is computed on **every** token, including the prompt and hundreds of
   image placeholder tokens, so the report text gets very little training signal.
3. A high learning rate (2e-4), no validation set, and a bare `except: continue`
   that silently skips failed steps.

So `/predict` uses the classifier for the diagnosis. The Qwen2-VL report can still
be switched on for experiments with `ENABLE_VLM=1 python ml/server.py`.

To reproduce the numbers (requires `indiana_reports.csv` unzipped):

```bash
cd ml
python evaluate.py --mode classifier --csv indiana_reports.csv \
  --images "<path>/images_normalized" -n 40
python evaluate.py --mode vlm ...   # fine-tuned Qwen2-VL
```

> ⚠️ This is a student or research screening aid, not a medical device. Every
> result must be reviewed by a qualified radiologist.
