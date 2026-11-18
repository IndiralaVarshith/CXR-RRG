import mlx.core as mx
import mlx.nn as nn
from mlx_vlm import load, generate
from PIL import Image
import os
import math
import tkinter as tk
from tkinter import filedialog

# --- CONFIGURATION ---
MODEL_ID = "mlx-community/Qwen2-VL-2B-Instruct-4bit"
ADAPTERS_FILE = "adapters_rapid_rescue/adapters.safetensors"

# --- 1. SETUP STRUCTURE ---
print(f"🚀 Loading Medical AI Brain...")
model, processor = load(MODEL_ID)

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
        return self.linear(x) + (self.scale * (self.dropout(x) @ self.lora_a @ self.lora_b))

def apply_lora_structure(model):
    def traverse(curr_obj):
        if hasattr(curr_obj, "children"):
            for name, child in curr_obj.children().items():
                if isinstance(child, (nn.Linear, nn.QuantizedLinear)):
                    if any(x in name for x in ["q_proj", "v_proj", "k_proj", "o_proj"]):
                        setattr(curr_obj, name, LoRALinear.from_linear(child, r=8, alpha=16))
                traverse(child)
        elif isinstance(curr_obj, list):
            for item in curr_obj:
                traverse(item)
    traverse(model)

print("🔧 Re-assembling Neural Network...")
apply_lora_structure(model)

# --- 2. LOAD WEIGHTS ---
print(f"📥 Loading Trained Memory...")
if not os.path.exists(ADAPTERS_FILE):
    print(f"❌ Error: Could not find {ADAPTERS_FILE}")
    exit()

model.load_weights(ADAPTERS_FILE, strict=False)
print("✅ AI Ready.")

# --- 3. OPEN UPLOAD WINDOW ---
print("📂 Opening File Select Window...")

# Hide the main tkinter window
root = tk.Tk()
root.withdraw()

# Open the file dialog
image_path = filedialog.askopenfilename(
    title="Select an X-Ray Image",
    filetypes=[("Image files", "*.png *.jpg *.jpeg *.dcm")]
)

# Check if user actually picked a file
if not image_path:
    print("❌ No file selected. Exiting.")
    exit()

print(f"📸 Selected: {os.path.basename(image_path)}")

# --- 4. RUN DIAGNOSIS ---
image = Image.open(image_path)
image.thumbnail((1024, 1024)) 

# Prompt
prompt_text = "detect findings"
messages = [
    {"role": "user", "content": [{"type": "image", "image": image}, {"type": "text", "text": prompt_text}]},
]
text = processor.apply_chat_template(messages, add_generation_prompt=True)

# Force-Feed "Findings:" 
forced_prompt = text + "Findings:"

print("🧠 Analyzing... (Please wait)")
output = generate(
    model,
    processor,
    image=image,
    prompt=forced_prompt,
    max_tokens=300,
    verbose=False
)

print("\n" + "="*50)
print("🏥 MEDICAL REPORT:")
print("="*50)
print(f"Findings: {output.text if hasattr(output, 'text') else output}") 
print("="*50)