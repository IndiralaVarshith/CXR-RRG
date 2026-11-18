"""
CXR-RRG inference: Qwen2-VL-2B (4-bit, MLX) + the LoRA adapters trained on the
Indiana University chest X-ray dataset (train_rapid.py).

No training happens here -- this only loads the already-trained adapters.

Usage:
    python ml/inference.py path/to/xray.png [--base]

Requires Apple Silicon (MLX). See ml/README.md.
"""
import argparse
import math
import os
import re

import mlx.core as mx
import mlx.nn as nn
from mlx_vlm import generate, load
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_ID = os.environ.get("CXR_MODEL_ID", "mlx-community/Qwen2-VL-2B-Instruct-4bit")
ADAPTERS_FILE = os.environ.get(
    "CXR_ADAPTERS", os.path.join(HERE, "adapters", "adapters.safetensors")
)
PROMPT = "detect findings"  # must match the prompt used in training
LORA_TARGETS = ("q_proj", "v_proj", "k_proj", "o_proj")  # must match train_rapid.py
LORA_R, LORA_ALPHA = 8, 16

# Keyword -> condition label. Used to turn the free-text report into a
# structured list of detected conditions (the generated text is what the model
# actually produces; this is only a deterministic post-processing step).
CONDITIONS = {
    "Cardiomegaly": r"cardiomegaly|enlarged (cardiac|heart)|heart (size )?(is )?enlarged",
    "Pleural Effusion": r"(?<!no )(?<!without )pleural effusion|effusions?\b(?! is not)",
    "Pneumonia / Consolidation": r"pneumonia|consolidation|airspace disease|infiltrat",
    "Opacity": r"opacit",
    "Pulmonary Edema": r"edema|vascular congestion",
    "Atelectasis": r"atelecta",
    "Pneumothorax": r"pneumothorax",
    "Nodule / Mass": r"nodule|mass\b",
    "Emphysema / Hyperinflation": r"emphysema|hyperinflat|copd",
    "Granuloma": r"granulom",
    "Degenerative Spine": r"degenerative|spondyl|osteophyt",
    "Scoliosis": r"scoliosis",
}
NEGATION = re.compile(r"\b(no|without|negative for|free of|resolved|clear of)\b[^.;]*$")


class LoRALinear(nn.Module):
    """Same LoRA layer definition used in train_rapid.py (needed to load its weights)."""

    @staticmethod
    def from_linear(linear, r=LORA_R, alpha=LORA_ALPHA):
        if isinstance(linear, nn.QuantizedLinear):
            out_dims, packed_in = linear.weight.shape
            in_dims = packed_in * 32 // linear.bits
        else:
            out_dims, in_dims = linear.weight.shape
        lora = LoRALinear(in_dims, out_dims, r, alpha)
        lora.linear = linear
        return lora

    def __init__(self, in_dims, out_dims, r=LORA_R, alpha=LORA_ALPHA):
        super().__init__()
        self.linear = None
        s = 1 / math.sqrt(in_dims)
        self.lora_a = mx.random.uniform(low=-s, high=s, shape=(in_dims, r))
        self.lora_b = mx.zeros((r, out_dims))
        self.scale = alpha / r

    def __call__(self, x):
        return self.linear(x) + self.scale * ((x @ self.lora_a) @ self.lora_b)


def _apply_lora(module):
    for name, child in module.children().items():
        if isinstance(child, (nn.Linear, nn.QuantizedLinear)):
            if any(t in name for t in LORA_TARGETS):
                setattr(module, name, LoRALinear.from_linear(child))
        elif isinstance(child, nn.Module):
            _apply_lora(child)
        elif isinstance(child, list):
            for item in child:
                if isinstance(item, nn.Module):
                    _apply_lora(item)


class CXRModel:
    def __init__(self, use_adapters=True):
        self.model, self.processor = load(MODEL_ID)
        self.use_adapters = use_adapters
        if use_adapters:
            if not os.path.exists(ADAPTERS_FILE):
                raise FileNotFoundError(f"Adapters not found: {ADAPTERS_FILE}")
            # Only the language model was LoRA-tuned (all saved keys are language_model.*)
            _apply_lora(self.model.language_model)
            weights = list(mx.load(ADAPTERS_FILE).items())
            self.model.load_weights(weights, strict=False)
            loaded = sum(1 for k, _ in weights if "lora_" in k)
            print(f"Loaded {loaded} LoRA tensors from {ADAPTERS_FILE}")
        self.model.eval()

    def generate_report(self, image_path, max_tokens=300):
        image = Image.open(image_path).convert("RGB")
        image.thumbnail((1024, 1024))  # same resize as training
        messages = [
            {"role": "user", "content": [{"type": "image"}, {"type": "text", "text": PROMPT}]}
        ]
        prompt = self.processor.apply_chat_template(messages, add_generation_prompt=True)
        if self.use_adapters:
            prompt += "Findings:"  # the trained reports start with "Findings: "
        out = generate(
            self.model, self.processor, prompt, image=[image],
            max_tokens=max_tokens, temperature=0.0, verbose=False,
        )
        text = out.text if hasattr(out, "text") else str(out)
        text = text.split("<|im_end|>")[0].strip()
        if self.use_adapters:
            text = "Findings: " + text
        return text


def extract_conditions(report):
    """Return condition labels mentioned (non-negated) in a report."""
    found = []
    for sentence in re.split(r"[.\n;]", report.lower()):
        for label, pattern in CONDITIONS.items():
            m = re.search(pattern, sentence)
            if m and not NEGATION.search(sentence[: m.start()]) and label not in found:
                found.append(label)
    return found or ["No acute abnormality"]


def split_report(report):
    m = re.search(r"Findings:\s*(.*?)(?:\n?\s*Impression:\s*(.*))?$", report, re.S)
    if not m:
        return report.strip(), ""
    return m.group(1).strip(), (m.group(2) or "").strip()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--base", action="store_true", help="run the base model without adapters")
    args = ap.parse_args()
    m = CXRModel(use_adapters=not args.base)
    rep = m.generate_report(args.image)
    print("\n" + "=" * 60)
    print(rep)
    print("-" * 60)
    print("Detected:", ", ".join(extract_conditions(rep)))
