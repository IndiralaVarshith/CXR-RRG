"""
Disease classifier: TorchXRayVision DenseNet-121 ("densenet121-res224-all"),
pretrained by its authors on 7 public chest X-ray datasets (NIH ChestX-ray14,
PadChest, CheXpert, MIMIC-CXR, Google, OpenI, Kaggle RSNA). Outputs a
probability for each of 18 chest pathologies.

Also produces Class Activation Maps (CAM): heatmaps showing which region of
the image drove each prediction. Because the network ends in global average
pooling + a linear layer, CAM is exact: cam_k = sum_c W[k, c] * relu(F)[c].

No training needed. Weights (~27 MB) download once to ~/.torchxrayvision.

    python ml/classifier.py path/to/xray.png
"""
import base64
import io
import sys

import numpy as np
import skimage.io
import skimage.transform
import torch
import torch.nn.functional as F
import torchvision
import torchxrayvision as xrv
from PIL import Image

WEIGHTS = "densenet121-res224-all"
THRESHOLD = 0.5  # outputs are calibrated so ~0.5 is each dataset's operating point

# colour ramp for the heatmap: transparent -> cyan -> yellow -> red
_RAMP = np.array(
    [
        [0.00, 0, 0, 0, 0],
        [0.35, 0, 200, 255, 90],
        [0.65, 255, 230, 0, 170],
        [1.00, 255, 40, 40, 220],
    ],
    dtype=np.float32,
)


def _colorize(cam):
    """cam in [0,1] (H,W) -> RGBA uint8."""
    out = np.zeros(cam.shape + (4,), dtype=np.float32)
    for ch in range(4):
        out[..., ch] = np.interp(cam, _RAMP[:, 0], _RAMP[:, ch + 1])
    return out.astype(np.uint8)


def _to_data_url(img, fmt="PNG", **kw):
    buf = io.BytesIO()
    img.save(buf, format=fmt, **kw)
    mime = "image/png" if fmt == "PNG" else "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(buf.getvalue()).decode()


class CXRClassifier:
    def __init__(self, weights=WEIGHTS):
        self.model = xrv.models.DenseNet(weights=weights)
        self.model.eval()
        self.transform = torchvision.transforms.Compose(
            [xrv.datasets.XRayCenterCrop(), xrv.datasets.XRayResizer(224)]
        )
        self.names = list(self.model.pathologies)

    @staticmethod
    def _read_gray(path):
        img = skimage.io.imread(path)
        if img.ndim == 3:
            img = img[..., :3].mean(2)
        if img.max() > 255:  # 16-bit PNG
            img = img / img.max() * 255.0
        return img.astype(np.float32)

    def _tensor(self, gray):
        x = xrv.datasets.normalize(gray, 255)[None, ...]
        x = self.transform(x)
        return torch.from_numpy(x).float()[None]

    @torch.no_grad()
    def _run(self, gray):
        x = self._tensor(gray)
        feats = F.relu(self.model.features(x))  # (1, 1024, 7, 7)
        pooled = F.adaptive_avg_pool2d(feats, 1).flatten(1)
        logits = self.model.classifier(pooled)
        probs = xrv.models.op_norm(torch.sigmoid(logits), self.model.op_threshs)[0]
        return probs.numpy(), feats[0]

    def predict(self, path):
        """Return {pathology: probability}, sorted high -> low."""
        probs, _ = self._run(self._read_gray(path))
        return self._probs_dict(probs)

    def _probs_dict(self, probs):
        d = {n: float(p) for n, p in zip(self.names, probs) if n}
        return dict(sorted(d.items(), key=lambda kv: -kv[1]))

    def findings(self, probs, threshold=THRESHOLD):
        return [k for k, v in probs.items() if v >= threshold]

    def analyze(self, path, n_maps=4, size=512):
        """Probabilities + CAM heatmap overlays for the top-n pathologies.

        Heatmaps are drawn on the same centre-square crop the model sees, so
        they line up exactly with what drove the prediction.
        """
        gray = self._read_gray(path)
        probs, feats = self._run(gray)
        probs_d = self._probs_dict(probs)

        # centre square crop of the original (what XRayCenterCrop does)
        h, w = gray.shape
        s = min(h, w)
        top, left = (h - s) // 2, (w - s) // 2
        crop = gray[top : top + s, left : left + s]
        base = Image.fromarray(np.clip(crop, 0, 255).astype(np.uint8)).resize(
            (size, size), Image.BICUBIC
        ).convert("RGBA")

        W = self.model.classifier.weight.detach()  # (18, 1024)
        heatmaps = {}
        for name in list(probs_d)[:n_maps]:
            k = self.names.index(name)
            cam = torch.einsum("c,chw->hw", W[k], feats).numpy()
            cam = np.maximum(cam, 0)
            if cam.max() > 0:
                cam = cam / cam.max()
            cam = skimage.transform.resize(cam, (size, size), order=3)
            cam = np.clip(cam, 0, 1) ** 1.5  # emphasise the hottest regions
            overlay = Image.fromarray(_colorize(cam), "RGBA")
            heatmaps[name] = _to_data_url(
                Image.alpha_composite(base, overlay).convert("RGB"), "JPEG", quality=85
            )

        return {
            "probabilities": probs_d,
            "heatmaps": heatmaps,
            "crop": _to_data_url(base.convert("RGB"), "JPEG", quality=85),
        }


if __name__ == "__main__":
    clf = CXRClassifier()
    probs = clf.predict(sys.argv[1])
    for k, v in probs.items():
        flag = "  <-- POSITIVE" if v >= THRESHOLD else ""
        print(f"{k:28s} {v:.3f}{flag}")
