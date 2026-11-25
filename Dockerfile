# CXR-RRG: website + API + AI in one container (Hugging Face Spaces, or any Docker host).
#   docker build -t cxr-rrg .
#   docker run -p 7860:7860 -e MONGO_URI=... -e JWT_SECRET=... cxr-rrg
#   docker compose up   (from this folder; also starts MongoDB locally)

# ---------- 1. build the React website ----------
FROM node:20-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- 2. backend dependencies ----------
FROM node:20-slim AS api
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---------- 3. runtime: Python (AI) + Node (API, website) ----------
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    HOME=/home/user PORT=7860 \
    ML_PROXY_TARGET=http://127.0.0.1:8000 FRONTEND_BUILD=/app/frontend/build

COPY --from=node:20-slim /usr/local/bin/node /usr/local/bin/node
RUN useradd -m -u 1000 user

# CPU-only PyTorch keeps the image small
RUN pip install torch==2.15.0 torchvision==0.29.2 --index-url https://download.pytorch.org/whl/cpu
COPY ml/requirements-deploy.txt /tmp/requirements.txt
RUN pip install -r /tmp/requirements.txt

WORKDIR /app
COPY --chown=user ml/*.py ml/
COPY --chown=user ml/heads ml/heads
COPY --chown=user backend/server.js backend/package.json backend/
COPY --chown=user backend/models backend/models
COPY --from=api --chown=user /app/backend/node_modules backend/node_modules
COPY --from=web --chown=user /app/frontend/build frontend/build
COPY --chown=user start.sh /app/start.sh

USER user
# Download all pretrained weights at build time so the app starts fast and offline
RUN cd /app/ml && python -c "import extract_features as e, torchxrayvision as x; [e.load_model(m) for m in e.MODELS]; x.autoencoders.ResNetAE(weights='101-elastic'); print('weights ready')"

EXPOSE 7860
CMD ["bash", "/app/start.sh"]
