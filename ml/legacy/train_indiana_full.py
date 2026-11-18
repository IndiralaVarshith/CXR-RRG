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

# --- CONFIGURATION ---
MODEL_ID = "mlx-community/Qwen2-VL-2B-Instruct-4bit"
ADAPTER_PATH = "adapters_indiana_final"
STEPS_PER_SAVE = 500  
EPOCHS = 1            

IMAGE_FOLDER = "/Users/varshith/Downloads/Indiana Dataset/images/images_normalized/"
CSV_PATH = "/Users/varshith/Downloads/Indiana Dataset/indiana_reports.csv"

# --- 1. SETUP MODEL ---
print(f"🚀 Loading {MODEL_ID}...")
model, processor = load(MODEL_ID)
model.freeze()

class LoRALinear(nn.Module):
    @staticmethod
    def from_linear(linear: nn.Module, r: int = 8, alpha: float = 16, dropout: float = 0.0):
        # Handle 4-bit dimension packing
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
                    if any(x in name for x in ["q_proj", "v_proj", "k_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]):
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
print("✅ Model Ready.")

# --- 2. DATASET MATCHING ---
print("📊 Indexing Dataset...")
df = pd.read_csv(CSV_PATH).dropna(subset=['findings', 'impression'])
all_files = glob.glob(os.path.join(IMAGE_FOLDER, "*.png"))
filename_map = {os.path.basename(f): f for f in all_files}

training_pairs = []
print("   Matching Reports to Images...")
for index, row in tqdm(df.iterrows(), total=df.shape[0], desc="Building Pairs"):
    uid = str(row['uid'])
    findings = str(row['findings'])
    impression = str(row['impression'])
    full_report = f"Findings: {findings}\nImpression: {impression}"
    
    matches = [f for name, f in filename_map.items() if f"-{uid}-" in name or f"_{uid}_" in name]
    for img_path in matches:
        training_pairs.append((img_path, full_report))

print(f"✅ Ready to train on {len(training_pairs)} Image-Report pairs.")

# --- 3. TRAINING LOOP ---
optimizer = optim.Adam(learning_rate=1e-5)

def loss_fn(model, input_ids, pixel_values, image_grid_thw, labels):
    kwargs = {"pixel_values": pixel_values}
    if image_grid_thw is not None:
        kwargs["image_grid_thw"] = image_grid_thw
        
    # --- THE FIX IS HERE ---
    # Instead of 'logits, _ = model(...)', we accept the object
    outputs = model(input_ids, **kwargs)
    
    # Extract logits from the object
    logits = outputs.logits
    
    logits = logits[:, :-1, :]
    labels = labels[:, 1:]
    loss = nn.losses.cross_entropy(logits, labels)
    return mx.mean(loss)

loss_and_grad = nn.value_and_grad(model, loss_fn)

print(f"🏃 Starting Training Loop...")
import random
random.shuffle(training_pairs)

pbar = tqdm(total=len(training_pairs))

for i, (img_path, report) in enumerate(training_pairs):
    try:
        # Load & Resize
        image = Image.open(img_path)
        image.thumbnail((1024, 1024)) 

        # Format
        messages = [
            {"role": "user", "content": [{"type": "image", "image": image}, {"type": "text", "text": "detect findings"}]},
            {"role": "assistant", "content": report}
        ]
        text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
        
        # Tokenize (Return PT -> Convert to MLX)
        inputs = processor(text=[text], images=[image], return_tensors="pt", padding=True)
        
        input_ids = mx.array(inputs["input_ids"].numpy())
        pixel_values = mx.array(inputs["pixel_values"].numpy())
        image_grid_thw = mx.array(inputs["image_grid_thw"].numpy()) if "image_grid_thw" in inputs else None
        labels = mx.array(inputs["input_ids"].numpy()) 

        # Train Step
        loss, grads = loss_and_grad(model, input_ids, pixel_values, image_grid_thw, labels)
        optimizer.update(model, grads)
        mx.eval(model.parameters(), optimizer.state)
        
        # Update UI
        pbar.set_description(f"Loss: {loss.item():.4f}")
        pbar.update(1)

        # Save Checkpoint
        if (i+1) % STEPS_PER_SAVE == 0:
            os.makedirs(ADAPTER_PATH, exist_ok=True)
            model.save_weights(os.path.join(ADAPTER_PATH, "adapters.safetensors"))

    except Exception as e:
        # pbar.write(f"⚠️ Error on {os.path.basename(img_path)}: {e}")
        continue

# Final Save
os.makedirs(ADAPTER_PATH, exist_ok=True)
model.save_weights(os.path.join(ADAPTER_PATH, "adapters.safetensors"))
print("🎉 TRAINING COMPLETE.")