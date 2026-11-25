"""
Step 1 of building the ensemble: run every pretrained model once over all
Indiana frontal X-rays and cache the outputs (no training happens here).

    python ml/extract_features.py --csv indiana_reports.csv --images <images_normalized> --cache <dir>

Writes to <cache>/:
  meta.npz                 uids, frontal-symmetry scores
  crops.npy                512x512 uint8 centre crops (reused between runs)
  <model>.npz              out: (N, 18) calibrated scores, feat: (N, D) pooled features
"""
import argparse
import glob
import os
import time
from multiprocessing import Pool

import numpy as np
import torch
import torchxrayvision as xrv

from evaluate_full import prep

MODELS = [
    "densenet121-res224-all",
    "densenet121-res224-pc",
    "densenet121-res224-nih",
    "densenet121-res224-chex",
    "resnet50-res512-all",
]


def load_model(name):
    if name.startswith("resnet"):
        m = xrv.models.ResNet(weights=name)
    else:
        m = xrv.models.DenseNet(weights=name)
    m.eval()
    return m


@torch.no_grad()
def run_model(model, x):
    """Return (scores (B,18), pooled features (B,D)) exactly as model.forward would score."""
    if isinstance(model, xrv.models.ResNet):
        feat = model.features(x)
        logits = model.model.fc(feat)
    else:
        f = torch.relu(model.features(x))
        feat = torch.nn.functional.adaptive_avg_pool2d(f, 1).flatten(1)
        logits = model.classifier(feat)
    out = torch.sigmoid(logits)
    if getattr(model, "op_threshs", None) is not None:
        out = xrv.models.op_norm(out, model.op_threshs)
    return out.numpy(), feat.numpy()


def resize_batch(crops, res):
    t = torch.from_numpy(crops.astype(np.float32))[:, None]
    if res != t.shape[-1]:
        t = torch.nn.functional.interpolate(t, size=(res, res), mode="area")
    return (t / 255.0) * 2048.0 - 1024.0  # xrv normalisation to [-1024, 1024]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--images", required=True)
    ap.add_argument("--cache", required=True)
    ap.add_argument("--models", default=",".join(MODELS))
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)

    import pandas as pd
    known = set(pd.read_csv(args.csv).uid.astype(int))

    meta_p = os.path.join(args.cache, "meta.npz")
    crops_p = os.path.join(args.cache, "crops.npy")
    if not (os.path.exists(meta_p) and os.path.exists(crops_p)):
        t0 = time.time()
        by_uid = {}
        for f in sorted(glob.glob(os.path.join(args.images, "*.png"))):
            u = int(os.path.basename(f).split("_")[0])
            if u in known:
                by_uid.setdefault(u, []).append(f)
        items = [(u, f) for u, fs in by_uid.items() for f in fs]
        with Pool(max(1, (os.cpu_count() or 2) - 1)) as pool:
            prepped = pool.map(prep, [f for _, f in items], chunksize=16)
        best = {}
        for (u, _), (sym, crop) in zip(items, prepped):
            if u not in best or sym > best[u][0]:
                best[u] = (sym, crop)
        uids = np.array([u for u in sorted(best) if best[u][0] >= 0.7])
        np.save(crops_p, np.stack([best[u][1] for u in uids]))
        np.savez(meta_p, uids=uids, sym=np.array([best[u][0] for u in uids]))
        print(f"cached {len(uids)} frontal crops ({time.time() - t0:.0f}s)", flush=True)

    crops = np.load(crops_p, mmap_mode="r")
    for name in args.models.split(","):
        out_p = os.path.join(args.cache, f"{name}.npz")
        if os.path.exists(out_p):
            print(f"skip {name} (cached)", flush=True)
            continue
        t0 = time.time()
        model = load_model(name)
        res = 512 if name.startswith("resnet") else 224
        outs, feats = [], []
        for i in range(0, len(crops), 32):
            o, f = run_model(model, resize_batch(np.asarray(crops[i : i + 32]), res))
            outs.append(o)
            feats.append(f.astype(np.float16))
        np.savez(out_p, out=np.concatenate(outs), feat=np.concatenate(feats), names=np.array(model.pathologies))
        print(f"{name}: done ({time.time() - t0:.0f}s)", flush=True)


if __name__ == "__main__":
    main()
