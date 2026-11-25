"""
Deployed predictor: 5 pretrained chest X-ray models + per-disease logistic
"heads" fitted on the Indiana University set (ml/train_heads.py), plus an
out-of-distribution check that rejects images that don't look like a frontal
chest X-ray.

Scores returned to the app are rescaled so that each disease's tuned alert
threshold sits at exactly 0.5 (same convention the UI already uses).
"""
import base64
import io
import json
import os

import numpy as np
import torch
import torch.nn.functional as F
import torchxrayvision as xrv
from PIL import Image

from classifier import _colorize, _to_data_url
from evaluate_full import is_frontal
from extract_features import load_model, resize_batch, run_model

HERE = os.path.dirname(os.path.abspath(__file__))
HEADS = os.path.join(HERE, "heads", "heads.npz")
# "Is this a chest X-ray?" checks. The autoencoder (pretrained on chest X-rays)
# reconstructs real radiographs with mean abs error <= 0.069 on 800 Indiana
# images; screenshots / icons / photos score >= 0.09.
AE_MAX_ERR = 0.075
MAX_COLOR = 30.0      # mean per-pixel channel spread; real X-rays are ~0
WARN_COLOR = 8.0
REPORT = os.path.join(HERE, "heads", "heads_report.json")


def _logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def _sig(x):
    return 1 / (1 + np.exp(-x))


def _rescale(p, t, td=None):
    """Map a probability onto the app's display scale:
    [0, 0.4) below the 'possible' threshold t, [0.4, 0.5) between t and the
    high-specificity 'detected' threshold td, and [0.5, 1] above td."""
    t = min(max(t, 1e-4), 1 - 1e-3)
    td = t if td is None else min(max(td, t + 1e-6), 1 - 1e-4)
    if p < t:
        return float(0.4 * p / t)
    if p < td:
        return float(0.4 + 0.1 * (p - t) / (td - t))
    return float(0.5 + 0.5 * (p - td) / (1 - td))


def _color_spread(path):
    im = Image.open(path).convert("RGB")
    im.thumbnail((256, 256))
    a = np.asarray(im, dtype=np.float32)
    return float(np.mean(a.max(2) - a.min(2)))


def _prep_image(path):
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


class EnsemblePredictor:
    def __init__(self, heads_path=HEADS):
        z = np.load(heads_path, allow_pickle=False)
        self.z = z
        self.meta = json.loads(str(z["meta"]))
        self.cols = [tuple(c.split("|", 1)) for c in z["cols"]]
        self.models = {m: load_model(m) for m in z["models"]}
        self.feat_models = list(z["feat_models"])
        self.base = self.models["densenet121-res224-all"]
        self.names = [n for n in self.base.pathologies if n]
        self.report = json.load(open(REPORT)) if os.path.exists(REPORT) else {}
        self.ae = xrv.autoencoders.ResNetAE(weights="101-elastic")
        self.ae.eval()

    # ---------- reliability shown in the UI ----------
    def reliability(self, disease):
        r = self.report.get(disease)
        if not r:
            return {"level": "unvalidated", "auroc": None}
        auc = r["methods"][r["chosen"]]["auc_test"]
        level = "high" if auc >= 0.88 else "medium" if auc >= 0.78 else "low"
        return {"level": level, "auroc": auc}

    @torch.no_grad()
    def analyze(self, path, n_maps=4, size=512):
        sym, crop = _prep_image(path)

        outs, feats = {}, {}
        for m, model in self.models.items():
            res = 512 if m.startswith("resnet") else 224
            o, f = run_model(model, resize_batch(crop[None], res))
            outs[m], feats[m] = o[0], f[0]
        names_of = {m: list(self.models[m].pathologies) for m in self.models}
        S = np.array([_logit(np.nan_to_num(outs[m][names_of[m].index(n)], nan=0.5)) for m, n in self.cols])

        # is this really a chest X-ray?
        x224 = resize_batch(crop[None], 224)
        ae_err = float((self.ae(x224)["out"] - x224).abs().mean() / 1024)
        color = _color_spread(path)

        probs, raw, method = {}, {}, {}
        base_out = outs["densenet121-res224-all"]
        base_names = names_of["densenet121-res224-all"]
        for n in self.names:
            info = self.meta.get(n)
            if info is None:
                # Too few cases to validate on Indiana: stay conservative. The base model's
                # calibrated score must reach 0.7 (not 0.5) before it counts as "Detected".
                p = float(base_out[base_names.index(n)])
                raw[n] = p
                probs[n] = _rescale(p, 0.5, 0.7)
                method[n] = "base-conservative"
                continue
            kind, t, td = info["kind"], info["threshold"], info.get("detect")
            if kind == "base":
                p = float(_sig(S[self.cols.index(("densenet121-res224-all", n))]))
            elif kind == "avg":
                p = float(_sig(np.mean([S[i] for i, c in enumerate(self.cols) if c[1] == n])))
            else:
                p = self._head(n, S, feats)
            raw[n] = p
            probs[n] = _rescale(p, t, td)
            method[n] = kind

        # conditions that proved unreliable on held-out patients are never shown as "possible"
        for n in probs:
            rel = self.reliability(n)
            if rel["auroc"] is not None and rel["auroc"] < 0.7 and 0.4 <= probs[n] < 0.5:
                probs[n] = 0.39

        any_p = None
        if "_any" in self.meta:
            info = self.meta["_any"]
            if info["kind"] in ("stack", "stack+f"):
                any_p = _rescale(self._head("_any", S, feats), info["threshold"], info.get("detect"))

        probs = dict(sorted(probs.items(), key=lambda kv: -kv[1]))
        heatmaps, base_img = self._cams(crop, list(probs)[:n_maps], size)
        return {
            "probabilities": probs,
            "calibrated": raw,
            "abnormal_score": any_p,
            "heatmaps": heatmaps,
            "crop": base_img,
            "quality": {
                "frontal_score": round(sym, 3),
                "is_frontal": sym >= 0.7,
                "reconstruction_error": round(ae_err, 4),
                "color_spread": round(color, 2),
                "colored": color > WARN_COLOR,
                "looks_like_cxr": ae_err <= AE_MAX_ERR and color <= MAX_COLOR,
            },
            "methods": method,
        }

    def _head(self, d, S, feats):
        z = self.z
        x = [S]
        if self.meta[d]["kind"] == "stack+f":
            for i, m in enumerate(self.feat_models):
                x.append((feats[m] - z[f"{d}|pca{i}_mean"]) @ z[f"{d}|pca{i}_comp"].T)
        x = (np.concatenate(x) - z[f"{d}|sc_mean"]) / z[f"{d}|sc_scale"]
        return float(_sig(x @ z[f"{d}|coef"] + float(z[f"{d}|b"])))

    def _cams(self, crop, names, size):
        m = self.base
        x = resize_batch(crop[None], 224)
        fmap = F.relu(m.features(x))[0]  # (1024, 7, 7)
        W = m.classifier.weight.detach()
        base = Image.fromarray(crop).resize((size, size), Image.BICUBIC).convert("RGBA")
        out = {}
        plist = list(m.pathologies)
        for n in names:
            cam = torch.einsum("c,chw->hw", W[plist.index(n)], fmap).numpy()
            cam = np.maximum(cam, 0)
            if cam.max() > 0:
                cam = cam / cam.max()
            cam = np.asarray(Image.fromarray((cam * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC), dtype=np.float32) / 255
            cam = np.clip(cam, 0, 1) ** 1.5
            overlay = Image.fromarray(_colorize(cam), "RGBA")
            out[n] = _to_data_url(Image.alpha_composite(base, overlay).convert("RGB"), "JPEG", quality=85)
        return out, _to_data_url(base.convert("RGB"), "JPEG", quality=85)
