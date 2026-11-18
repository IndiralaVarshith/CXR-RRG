"""
Evaluate on held-out Indiana images (no training).

    python ml/evaluate.py --csv indiana_reports.csv --images <images_normalized dir> -n 40 [--mode classifier|vlm|base]

Picks a balanced set of normal / abnormal patients with uid > 1500
(train_rapid.py only used the first 500 report rows, i.e. low uids).
"""
import argparse
import glob
import os
import random
import time

import numpy as np
import pandas as pd

ap = argparse.ArgumentParser()
ap.add_argument("--csv", required=True)
ap.add_argument("--images", required=True)
ap.add_argument("-n", type=int, default=40)
ap.add_argument("--mode", choices=["classifier", "vlm", "base"], default="classifier")
ap.add_argument("--seed", type=int, default=0)
args = ap.parse_args()

df = pd.read_csv(args.csv)
frontal = {}
for f in glob.glob(os.path.join(args.images, "*-1001.dcm.png")):
    uid = int(os.path.basename(f).split("_")[0])
    frontal.setdefault(uid, f)

df = df[(df.uid > 1500) & df.uid.isin(frontal.keys())]
normal = df[df.Problems.str.strip().str.lower() == "normal"]
abnormal = df[df.Problems.str.strip().str.lower() != "normal"]
rng = random.Random(args.seed)
picked = rng.sample(list(normal.uid), args.n // 2) + rng.sample(list(abnormal.uid), args.n // 2)


def auroc(y, s):
    y, s = np.asarray(y), np.asarray(s)
    pos, neg = s[y == 1], s[y == 0]
    return float(np.mean([(p > q) + 0.5 * (p == q) for p in pos for q in neg]))


if args.mode == "classifier":
    from classifier import CXRClassifier, THRESHOLD
    model = CXRClassifier()
else:
    from inference import CXRModel, extract_conditions
    model = CXRModel(use_adapters=args.mode == "vlm")

y, score, pred = [], [], []
outputs = []
t0 = time.time()
for i, uid in enumerate(picked, 1):
    row = df[df.uid == uid].iloc[0]
    truth = int(row.Problems.strip().lower() != "normal")
    if args.mode == "classifier":
        probs = model.predict(frontal[uid])
        s = max(probs.values())
        p = int(s >= THRESHOLD)
        top = ", ".join(f"{k} {v:.2f}" for k, v in list(probs.items())[:3])
    else:
        rep = model.generate_report(frontal[uid])
        cond = extract_conditions(rep)
        p = int(cond != ["No acute abnormality"])
        s = p
        top = ", ".join(cond)
        outputs.append(rep)
    y.append(truth); score.append(s); pred.append(p)
    print(f"[{i}/{len(picked)}] uid={uid} truth={row.Problems!r} -> {top}", flush=True)

y, pred = np.array(y), np.array(pred)
tp = int(((y == 1) & (pred == 1)).sum()); fn = int(((y == 1) & (pred == 0)).sum())
tn = int(((y == 0) & (pred == 0)).sum()); fp = int(((y == 0) & (pred == 1)).sum())
n = len(y)
print(f"\n=== RESULTS (mode={args.mode}) ===")
print(f"images: {n}   avg time/image: {(time.time() - t0) / n:.2f}s")
print(f"accuracy (normal vs abnormal): {(tp + tn) / n:.2%}")
print(f"sensitivity (abnormal caught): {tp / max(tp + fn, 1):.2%}  ({tp}/{tp + fn})")
print(f"specificity (normal correct):  {tn / max(tn + fp, 1):.2%}  ({tn}/{tn + fp})")
if args.mode == "classifier":
    print(f"AUROC (max pathology prob):    {auroc(y, score):.3f}")
else:
    print(f"distinct reports generated:    {len(set(outputs))}/{n}")
