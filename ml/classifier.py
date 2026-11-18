"""
Disease classifier: TorchXRayVision DenseNet-121 ("densenet121-res224-all"),
pretrained by its authors on NIH ChestX-ray14, CheXpert, MIMIC-CXR, PadChest,
RSNA and others. Outputs a probability for each of 18 chest pathologies.

No training needed. Weights (~27 MB) download once to ~/.torchxrayvision.

    python ml/classifier.py path/to/xray.png
"""
import sys

import numpy as np
import skimage.io
import torch
import torchvision
import torchxrayvision as xrv

WEIGHTS = "densenet121-res224-all"

# Default per-pathology alert threshold. The model's outputs are calibrated so
# that ~0.5 sits near the operating point of each training dataset.
THRESHOLD = 0.5


class CXRClassifier:
    def __init__(self, weights=WEIGHTS):
        self.model = xrv.models.DenseNet(weights=weights)
        self.model.eval()
        self.transform = torchvision.transforms.Compose(
            [xrv.datasets.XRayCenterCrop(), xrv.datasets.XRayResizer(224)]
        )

    def _load(self, path):
        img = skimage.io.imread(path)
        img = xrv.datasets.normalize(img, 255)  # -> [-1024, 1024]
        if img.ndim == 3:
            img = img[..., :3].mean(2)  # RGB -> gray
        img = img[None, ...]
        img = self.transform(img)
        return torch.from_numpy(img).float()[None]

    @torch.no_grad()
    def predict(self, path):
        """Return {pathology: probability}, sorted high -> low (empty labels skipped)."""
        out = self.model(self._load(path))[0].numpy()
        probs = {
            name: float(p)
            for name, p in zip(self.model.pathologies, out)
            if name  # some slots are unused ("")
        }
        return dict(sorted(probs.items(), key=lambda kv: -kv[1]))

    def findings(self, probs, threshold=THRESHOLD):
        return [k for k, v in probs.items() if v >= threshold]


if __name__ == "__main__":
    clf = CXRClassifier()
    probs = clf.predict(sys.argv[1])
    for k, v in probs.items():
        flag = "  <-- POSITIVE" if v >= THRESHOLD else ""
        print(f"{k:28s} {v:.3f}{flag}")
