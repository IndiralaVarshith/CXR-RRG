"""CXR-RRG AI service on Modal (runs on the free monthly credits; scales to zero when idle).

    pip install modal && modal token new          # one-time login
    modal deploy deploy/modal/modal_app.py        # from the repo root

Serves the unchanged Flask API from ml/server.py:
    https://<workspace>--cxr-rrg-ai-web.modal.run/predict   (POST, multipart field "image")
    https://<workspace>--cxr-rrg-ai-web.modal.run/health
The website/backend (Render) proxies /ml/* to that URL via ML_PROXY_TARGET.
"""
from pathlib import Path

import modal

# This file is also imported inside the container (at /root/modal_app.py), where the repo
# isn't present; the image definition only needs the local paths when deploying.
ML = Path(__file__).resolve().parents[2] / "ml" if modal.is_local() else Path("/app")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch==2.15.0", "torchvision==0.29.2", extra_index_url="https://download.pytorch.org/whl/cpu")
    .pip_install_from_requirements(str(ML / "requirements-deploy.txt"))
    .env({"PYTHONUNBUFFERED": "1"})
)
for name in ("server", "classifier", "ensemble", "evaluate_full", "extract_features"):
    image = image.add_local_file(str(ML / f"{name}.py"), f"/app/{name}.py", copy=True)
image = (
    image.add_local_dir(str(ML / "heads"), "/app/heads", copy=True)
    # Bake all pretrained weights into the image so cold starts don't download anything
    .run_commands(
        "cd /app && python -c \"import extract_features as e, torchxrayvision as x; "
        "[e.load_model(m) for m in e.MODELS]; x.autoencoders.ResNetAE(weights='101-elastic'); print('weights ready')\""
    )
)

app = modal.App("cxr-rrg-ai")


@app.function(
    image=image,
    cpu=2.0,
    memory=4096,
    min_containers=0,       # scale to zero: no cost while nobody is using it
    max_containers=1,       # cap spend; one warm container handles a small clinic's traffic
    scaledown_window=300,   # stay warm 5 min after the last request
    timeout=180,
)
@modal.concurrent(max_inputs=4)
@modal.wsgi_app()
def web():
    import os
    import sys

    os.chdir("/app")
    sys.path.insert(0, "/app")
    from server import app as flask_app

    return flask_app
