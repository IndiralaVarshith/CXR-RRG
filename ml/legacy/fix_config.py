import mlx.core as mx
from mlx_vlm import load, generate
from PIL import Image
import pandas as pd
import os
import glob
import math
import mlx.nn as nn

# --- CONFIGURATION ---
MODEL_ID = "mlx-community/Qwen2-VL-2B-Instruct-4bit"
ADAPTERS_FILE = "adapters_rapid_rescue/adapters.safetensors"
CSV_PATH = "/Users/varshith/Downloads/Indiana Dataset/indiana_reports.csv"
IMAGE_FOLDER = "/Users/varshith/Downloads/Indiana Dataset/images/images_normalized/"

# --- 1. FIND A SICK PATIENT (WITH AN IMAGE) ---
print("🔍 Scanning dataset for a 'Sick' patient with a valid image...")
df = pd.read_csv(CSV_PATH)

# Look for 'Cardiomegaly' (Enlarged Heart) or 'Opacity' (Pneumonia)
# These are visual diseases the AI should spot.
sick_patients = df[df['findings'].str.contains("cardiomegaly|opacity|pleural effusion", case=False, na=False)]

target_image_path = None
real_report = None
target_uid = None

# LOOP until we find a match
all_files = glob.glob(os.path.join(IMAGE_FOLDER, "*.png"))
# Create a quick map for speed
filename_string = "\n".join([os.path.basename(f) for f in all_files])

print(f"   Found {len(sick_patients)} potential sick reports.")

for index, row in sick_patients.iterrows():
    uid = str(row['uid'])
    
    # Check if this UID exists in any filename
    # We look for -UID- or _UID_ to be safe
    check_1 = f"-{uid}-"
    check_2 = f"_{uid}_"
    
    if check_1 in filename_string or check_2 in filename_string:
        # Find the specific file
        matches = [f for f in all_files if check_1 in f or check_2 in f]
        if matches:
            target_image_path = matches[0]
            real_report = f"Findings: {row['findings']}\nImpression: {row['impression']}"
            target_uid = uid
            break # STOP LOOKING, WE FOUND ONE

if not target_image_path:
    print("❌ Critical Error: Could not find ANY images matching the sick reports.")
    exit()

print(f"\n🤒 FOUND TARGET PATIENT: {target_uid}")
print(f"📸 Image: {os.path.basename(target_image_path)}")
print("-" * 50)
print(f"📝 DOCTOR WROTE:\n{real_report}")
print("-" * 50)

# --- 2. LOAD MODEL ---
print("\n🚀 Loading AI...")
model, processor = load(MODEL_ID)

# Re-apply Adapters
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
        self.lora_a = mx.random.uniform(low=-1/math.sqrt(input_dims), high=1/math.sqrt(input_dims), shape=(input_dims, r))
        self.lora_b = mx.zeros((r, output_dims))
        self.scale = alpha / r
    def __call__(self, x):
        return self.linear(x) + (self.scale * (self.dropout(x) @ self.lora_a @ self.lora_b))

def apply_lora(model):
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

apply_lora(model)
model.load_weights(ADAPTERS_FILE, strict=False)

# --- 3. RUN TEST ---
image = Image.open(target_image_path)
image.thumbnail((1024, 1024))
prompt = "detect findings"
messages = [{"role": "user", "content": [{"type": "image", "image": image}, {"type": "text", "text": prompt}]}]
text = processor.apply_chat_template(messages, add_generation_prompt=True)
forced_prompt = text + "Findings:"

print("🧠 AI Diagnosing...")
output = generate(model, processor, image=image, prompt=forced_prompt, max_tokens=300, verbose=False)

print("\n" + "="*50)
print("🤖 AI REPORT:")
print(f"Findings: {output.text if hasattr(output, 'text') else output}")
print("="*50)

# CHECK RESULT
ai_text = str(output).lower()
if "cardiomegaly" in ai_text or "enlarged" in ai_text or "opacity" in ai_text or "effusion" in ai_text:
    print("✅ SUCCESS: The AI detected the sickness!")
else:
    print("⚠️ WARNING: The AI said 'Normal' (Lazy).")