"""
Per-disease accuracy on the full Indiana University (OpenI) chest X-ray set.

    python ml/evaluate_full.py --csv indiana_reports.csv --images <images_normalized> \
        [--models densenet121-res224-all,densenet121-res224-chex,...] [--limit N]

For every model and every disease it reports AUROC (how well the score separates
patients WITH the disease from patients WITHOUT it; 0.5 = coin flip, 1.0 = perfect),
plus sensitivity / specificity at the app's 0.5 alert threshold.

Ground truth comes from the radiologist-coded "Problems" field of each report.
Only frontal views are used (detected by left-right symmetry, see is_frontal()).

IMPORTANT: "densenet121-res224-all" was partly trained on OpenI (= this dataset),
so its numbers here are optimistic. The other models never saw it.
"""
import argparse
import glob
import json
import os
import time

import numpy as np
import pandas as pd
import torch
import torchxrayvision as xrv
from multiprocessing import Pool
from PIL import Image

# Indiana "Problems" terms -> classifier pathology names
LABEL_MAP = {
    "Cardiomegaly": ["Cardiomegaly"],
    "Effusion": ["Pleural Effusion"],
    "Atelectasis": ["Pulmonary Atelectasis"],
    "Lung Opacity": ["Opacity", "Airspace Disease"],
    "Pneumonia": ["Pneumonia"],
    "Consolidation": ["Consolidation"],
    "Edema": ["Pulmonary Edema"],
    "Emphysema": ["Emphysema", "Pulmonary Emphysema", "Pulmonary Disease, Chronic Obstructive"],
    "Nodule": ["Nodule"],
    "Mass": ["Mass"],
    "Fracture": ["Fractures, Bone"],
    "Hernia": ["Hernia, Hiatal"],
    "Infiltration": ["Infiltrate"],
    "Pneumothorax": ["Pneumothorax"],
    "Fibrosis": ["Fibrosis"],
}
MIN_POS = 15  # skip diseases with too few positive cases for a stable AUROC


def auroc(y, s):
    y = np.asarray(y).astype(bool)
    s = np.asarray(s, dtype=np.float64)
    pos, neg = s[y], s[~y]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    order = np.argsort(np.concatenate([pos, neg]), kind="mergesort")
    ranks = np.empty(len(order))
    allv = np.concatenate([pos, neg])[order]
    # average ranks for ties
    i = 0
    r = np.arange(1, len(allv) + 1, dtype=np.float64)
    while i < len(allv):
        j = i
        while j + 1 < len(allv) and allv[j + 1] == allv[i]:
            j += 1
        r[i : j + 1] = (i + j + 2) / 2
        i = j + 1
    ranks[order] = r
    return float((ranks[: len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


def is_frontal(small):
    """Frontal (PA/AP) chest films are roughly left-right symmetric; laterals are not.
    `small` is a 64x96 float array of the whole film."""
    best = -1.0
    for c in range(30, 67, 2):  # try mirror axes around the centre (patients aren't always centred)
        w = min(c, 96 - c, 30)
        left = small[:, c - w : c]
        right = small[:, c : c + w][:, ::-1]
        a, b = left - left.mean(), right - right.mean()
        best = max(best, float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-8)))
    return best


def prep(path):
    """Load once: symmetry score + 512x512 centre-square crop (uint8) - what the models see."""
    img = Image.open(path)
    if img.mode not in ("L", "I;16", "I"):
        img = img.convert("L")
    arr = np.asarray(img, dtype=np.float32)
    if arr.max() > 255:
        arr = arr / arr.max() * 255.0
    img = Image.fromarray(arr.astype(np.uint8))
    small = np.asarray(img.resize((96, 64), Image.BILINEAR), dtype=np.float32)
    w, h = img.size
    s = min(w, h)
    crop = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((512, 512), Image.BILINEAR)
    return is_frontal(small), np.asarray(crop, dtype=np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--images", required=True)
    ap.add_argument("--models", default="densenet121-res224-all,densenet121-res224-chex,densenet121-res224-nih,"
                    "densenet121-res224-mimic_ch,densenet121-res224-pc,resnet50-res512-all")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    df = pd.read_csv(args.csv)
    probs = {int(r.uid): set(t.strip() for t in str(r.Problems).split(";")) for r in df.itertuples()}

    # one frontal image per patient
    by_uid = {}
    for f in sorted(glob.glob(os.path.join(args.images, "*.png"))):
        by_uid.setdefault(int(os.path.basename(f).split("_")[0]), []).append(f)
    print(f"{len(by_uid)} patients with images; selecting frontal views...", flush=True)
    t0 = time.time()
    items = [(u, f) for u, fs in by_uid.items() if u in probs for f in fs]
    if args.limit:
        keep_u = set(sorted({u for u, _ in items})[: args.limit])
        items = [(u, f) for u, f in items if u in keep_u]
    with Pool(max(1, (os.cpu_count() or 2) - 1)) as pool:
        prepped = pool.map(prep, [f for _, f in items], chunksize=16)
    best = {}
    for (u, _), (sym, crop) in zip(items, prepped):
        if u not in best or sym > best[u][0]:
            best[u] = (sym, crop)
    uids = [u for u in sorted(best) if best[u][0] >= 0.7]
    grays = [best[u][1].astype(np.float32) for u in uids]
    del prepped
    print(f"{len(uids)} frontal studies ({time.time() - t0:.0f}s)", flush=True)

    truth = {}
    for name, terms in LABEL_MAP.items():
        truth[name] = np.array([any(t in probs[u] for t in terms) for u in uids])
    normal = np.array([probs[u] == {"normal"} for u in uids])

    results = {"n_studies": len(uids), "n_normal": int(normal.sum()), "models": {}}
    for wname in args.models.split(","):
        t0 = time.time()
        if wname.startswith("resnet"):
            model = xrv.models.ResNet(weights=wname)
            res = 512
        else:
            model = xrv.models.DenseNet(weights=wname)
            res = 224
        model.eval()
        tf = xrv.datasets.XRayResizer(res)  # images are already centre-cropped squares
        outs = []
        with torch.no_grad():
            for i in range(0, len(grays), 32):
                batch = np.stack([tf(xrv.datasets.normalize(g, 255)[None]) for g in grays[i : i + 32]])
                outs.append(model(torch.from_numpy(batch).float()).numpy())
        out = np.concatenate(outs)
        names = list(model.pathologies)
        per = {}
        for dz, y in truth.items():
            if dz not in names or not names[names.index(dz)] or y.sum() < MIN_POS:
                continue
            s = out[:, names.index(dz)]
            if np.isnan(s).all():
                continue
            pred = s >= 0.5
            per[dz] = {
                "auroc": round(auroc(y, s), 3),
                "n_pos": int(y.sum()),
                "sensitivity": round(float((pred & y).sum() / y.sum()), 3),
                "specificity": round(float((~pred & ~y).sum() / (~y).sum()), 3),
            }
        # any of the mapped diseases vs completely normal reports
        anyd = np.zeros(len(uids), bool)
        for y in truth.values():
            anyd |= y
        keep = anyd | normal
        valid = [names.index(d) for d in truth if d in names and names[names.index(d)]]
        top = np.nanmax(out[:, valid], axis=1)
        per["_ANY (disease vs normal)"] = {
            "auroc": round(auroc(anyd[keep], top[keep]), 3),
            "n_pos": int(anyd[keep].sum()),
            "sensitivity": round(float(((top >= 0.5) & anyd)[keep].sum() / anyd[keep].sum()), 3),
            "specificity": round(float(((top < 0.5) & normal).sum() / normal.sum()), 3),
        }
        results["models"][wname] = per
        mean = np.nanmean([v["auroc"] for k, v in per.items() if not k.startswith("_")])
        print(f"\n== {wname}  ({time.time() - t0:.0f}s)  mean per-disease AUROC {mean:.3f}", flush=True)
        for dz, v in per.items():
            print(f"  {dz:26s} AUROC {v['auroc']:.3f}  (n+={v['n_pos']:4d})  sens {v['sensitivity']:.0%}  spec {v['specificity']:.0%}", flush=True)

    if args.out:
        json.dump(results, open(args.out, "w"), indent=2)
        print("saved", args.out)


if __name__ == "__main__":
    main()
