import mlx.core as mx
from mlx_vlm import load, generate
from PIL import Image
import os

# --- CONFIGURATION ---
MODEL_ID = "mlx-community/Qwen2-VL-2B-Instruct-4bit"
ADAPTER_PATH = "adapters_indiana_full"  # <--- YOUR NEW ADAPTERS
IMAGE_PATH = "/Users/varshith/Downloads/Indiana Dataset/images/images_normalized/4_IM-2050-1001.dcm.png"

# --- 1. LOAD MODEL + ADAPTERS ---
print(f"🚀 Loading Medical AI...")
# This loads the base model AND your fine-tuned weights
model, processor = load(MODEL_ID, adapter_path=ADAPTER_PATH)

# --- 2. PREPARE IMAGE ---
print(f"📸 Loading Image...")
if not os.path.exists(IMAGE_PATH):
    print("❌ Error: Image not found.")
    exit()

# Resize to safe dimensions (Same as training)
image = Image.open(IMAGE_PATH)
image.thumbnail((1024, 1024))

# --- 3. GENERATE REPORT ---
print("🧠 Analyzing X-Ray...")

# We use the EXACT same prompt you trained with
prompt_text = "detect findings"

messages = [
    {
        "role": "user",
        "content": [
            {"type": "image", "image": image},
            {"type": "text", "text": prompt_text},
        ],
    }
]

text = processor.apply_chat_template(messages, add_generation_prompt=True)

output = generate(
    model,
    processor,
    image=image,
    prompt=text,
    max_tokens=300, # Allow enough space for a full report
    verbose=False
)

print("\n" + "="*50)
print("🏥 YOUR AI DOCTOR'S REPORT:")
print("="*50)
print(output)
print("="*50)