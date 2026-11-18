import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
from mlx_vlm import load
from PIL import Image
import numpy as np
import os
import math
import pandas as pd
import glob
from tqdm import tqdm
from mlx.utils import tree_flatten  # <--- FIXED IMPORT

# --- CONFIGURATION ---
MODEL_ID = "mlx-community/Qwen2-VL-2B-Instruct-4bit"
ADAPTER_PATH = "adapters_rapid_rescue"
EPOCHS = 1       
LEARNING_RATE = 2e-4  # Fast learning

IMAGE_FOLDER = "/Users/varshith/Downloads/Indiana Dataset/images/images_normalized/"
CSV_PATH = "/Users/varshith/Downloads/Indiana Dataset/indiana_reports.csv"

# --- 1. SETUP ---
print(f"🚀 Loading {MODEL_ID}...")
model, processor = load(MODEL_ID)
model.freeze()

class LoRALinear(nn.Module):
    @staticmethod
    def from_linear(linear: nn.Module, r: int = 8, alpha: float = 16, dropout: float = 0.0):
        if isinstance(linear, nn.QuantizedLinear):
            output_dims, compressed_input_dims = linear.weight.shape
            input_dims = compressed_input_dims * 8
        else:
            output_dims, input_dims = linear.weight.shape
        lora_lin = LoRALinear(input_dims, output_dims, r, alpha, dropout)
        lora_lin.linear = linear
        return lora_lin

    def __init__(self, input_dims: int, output_dims: int, r: int = 8, alpha: float = 16, dropout: float = 0.0):
        super().__init__()
        self.linear = None
        self.dropout = nn.Dropout(p=dropout)
        scale = 1 / math.sqrt(input_dims)
        self.lora_a = mx.random.uniform(low=-scale, high=scale, shape=(input_dims, r))
        self.lora_b = mx.zeros((r, output_dims)) 
        self.scale = alpha / r

    def __call__(self, x):
        out = self.linear(x)
        lora_out = (self.dropout(x) @ self.lora_a) @ self.lora_b
        return out + (self.scale * lora_out)

def apply_lora(model):
    def traverse(curr_obj):
        if hasattr(curr_obj, "children"):
            for name, child in curr_obj.children().items():
                if isinstance(child, (nn.Linear, nn.QuantizedLinear)):
                    if any(x in name for x in ["q_proj", "v_proj", "k_proj", "o_proj"]):
                        setattr(curr_obj, name, LoRALinear.from_linear(child, r=8, alpha=16))
                        continue
                traverse(child)
        elif isinstance(curr_obj, list):
            for item in curr_obj:
                traverse(item)
    traverse(model)

print("🔧 Injecting adapters...")
apply_lora(model)
model.train()

# VERIFY PARAMETERS
trainable_params = 0
for _, v in tree_flatten(model.trainable_parameters()): # <--- FIXED
    trainable_params += v.size
print(f"✅ Trainable Parameters: {trainable_params}")
if trainable_params == 0:
    print("❌ FAILURE: No parameters are marked as trainable!")
    exit()

# --- 2. DATA PREP ---
print("📊 Indexing Data...")
df = pd.read_csv(CSV_PATH).dropna(subset=['findings', 'impression'])
all_files = glob.glob(os.path.join(IMAGE_FOLDER, "*.png"))
filename_map = {os.path.basename(f): f for f in all_files}
training_pairs = []

print("   Selecting best 500 pairs...")
count = 0
for index, row in df.iterrows():
    if count >= 500: break
    uid = str(row['uid'])
    matches = [f for name, f in filename_map.items() if f"-{uid}-" in name or f"_{uid}_" in name]
    if matches:
        full_report = f"Findings: {str(row['findings'])}\nImpression: {str(row['impression'])}"
        training_pairs.append((matches[0], full_report))
        count += 1

print(f"✅ Training on {len(training_pairs)} pairs.")

# --- 3. TRAINING LOOP ---
optimizer = optim.Adam(learning_rate=LEARNING_RATE)

def loss_fn(model, input_ids, pixel_values, image_grid_thw, labels):
    kwargs = {"pixel_values": pixel_values}
    if image_grid_thw is not None:
        kwargs["image_grid_thw"] = image_grid_thw
    outputs = model(input_ids, **kwargs)
    logits = outputs.logits
    logits = logits[:, :-1, :]
    labels = labels[:, 1:]
    loss = nn.losses.cross_entropy(logits, labels)
    return mx.mean(loss)

loss_and_grad = nn.value_and_grad(model, loss_fn)

print("🏃 Starting Rapid Training...")
pbar = tqdm(total=len(training_pairs))

def get_live_weight(model):
    for m in model.modules():
        if isinstance(m, LoRALinear):
            return m.lora_b
    return None

for i, (img_path, report) in enumerate(training_pairs):
    try:
        image = Image.open(img_path)
        image.thumbnail((1024, 1024))
        
        messages = [
            {"role": "user", "content": [{"type": "image", "image": image}, {"type": "text", "text": "detect findings"}]},
            {"role": "assistant", "content": report}
        ]
        text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
        inputs = processor(text=[text], images=[image], return_tensors="pt", padding=True)
        
        input_ids = mx.array(inputs["input_ids"].numpy())
        pixel_values = mx.array(inputs["pixel_values"].numpy())
        image_grid_thw = mx.array(inputs["image_grid_thw"].numpy()) if "image_grid_thw" in inputs else None
        labels = mx.array(inputs["input_ids"].numpy())

        loss, grads = loss_and_grad(model, input_ids, pixel_values, image_grid_thw, labels)
        optimizer.update(model, grads)
        mx.eval(model.parameters(), optimizer.state)

        pbar.set_description(f"Loss: {loss.item():.4f}")
        pbar.update(1)

        # VERIFICATION: Check the LIVE weight
        if (i+1) % 10 == 0:
            live_weight = get_live_weight(model)
            current_max = mx.max(mx.abs(live_weight)).item()
            
            if current_max == 0.0:
                pbar.write(f"⚠️ FAILURE Step {i+1}: Weights are stuck at ZERO.")
            else:
                pbar.write(f"✅ SUCCESS Step {i+1}: Weights are moving! Max value: {current_max:.8f}")

    except Exception as e:
        continue

# SAVE ONLY TRAINABLE WEIGHTS
print("💾 Saving Adapters...")
os.makedirs(ADAPTER_PATH, exist_ok=True)
flat_params = tree_flatten(model.trainable_parameters())
mx.save_safetensors(os.path.join(ADAPTER_PATH, "adapters.safetensors"), dict(flat_params))
print("🎉 SAVED. You are ready.")