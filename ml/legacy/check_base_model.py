import mlx.core as mx
from mlx_vlm import load, generate
from PIL import Image
import os

# --- CONFIGURATION ---
MODEL_ID = "mlx-community/Qwen2-VL-2B-Instruct-4bit"
IMAGE_PATH = "/Users/varshith/Downloads/Indiana Dataset/images/images_normalized/4_IM-2050-1001.dcm.png"

print(f"🚀 Loading Base Model: {MODEL_ID}...")
model, processor = load(MODEL_ID)

print(f"📸 Loading & Resizing Image...")
if not os.path.exists(IMAGE_PATH):
    print("❌ Error: File not found.")
    exit()

# 1. LOAD & RESIZE (The Fix for 21GB Crash)
# We open the image and shrink it so the longest side is max 1024 pixels.
# This preserves the aspect ratio but keeps VRAM usage low (~2-3GB).
image = Image.open(IMAGE_PATH)
image.thumbnail((1024, 1024)) 

# 2. PREPARE PROMPT
# We pass the PIL Image object directly (Fixes the "Files: ['/','U'...]" error)
messages = [
    {
        "role": "user",
        "content": [
            {"type": "image", "image": image}, 
            {"type": "text", "text": "Analyze this chest X-ray and list the findings."},
        ],
    }
]

prompt = processor.apply_chat_template(messages, add_generation_prompt=True)

# 3. GENERATE
print("🧠 Analyzing...")
output = generate(
    model, 
    processor, 
    image=image,  # Passing the object, not the path string
    prompt=prompt, 
    max_tokens=300, 
    verbose=False 
)

print("\n" + "="*40)
print("📝 BASE MODEL REPORT:")
print(output)
print("="*40)