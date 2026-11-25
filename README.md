# CXR-RRG (Chest X-Ray Radiology Report Generation)

CXR-RRG is a full-stack application for managing chest X-ray analysis workflows.

It provides:
- User authentication (register/login)
- X-ray upload and AI report generation flow
- Report history management (view, edit, delete, clear)
- PDF report export
- MongoDB persistence for users and reports

## Table of Contents

- [1. Architecture](#1-architecture)
- [2. Tech Stack](#2-tech-stack)
- [3. Project Structure](#3-project-structure)
- [4. Prerequisites](#4-prerequisites)
- [5. Environment Setup](#5-environment-setup)
- [6. Installation](#6-installation)
- [7. How to Run (Detailed)](#7-how-to-run-detailed)
- [8. API Reference](#8-api-reference)
- [9. Data Models](#9-data-models)
- [10. Validation and Smoke Tests](#10-validation-and-smoke-tests)
- [11. Common Issues and Fixes](#11-common-issues-and-fixes)
- [12. Security and Git Safety Checklist](#12-security-and-git-safety-checklist)
- [13. Scripts](#13-scripts)
- [14. Known Limitations](#14-known-limitations)
- [15. License](#15-license)

## 1. Architecture

The app runs three local services:

1. Local Node.js backend (Express + MongoDB)
- Default URL: `http://127.0.0.1:5000`
- Handles auth, report save, history CRUD, static uploads

2. Local ML service (`ml/server.py`, Python + Flask)
- Default URL: `http://127.0.0.1:8000` (override with `REACT_APP_ML_URL`)
- `POST /predict` detects 18 chest pathologies with a pretrained
  TorchXRayVision DenseNet-121 and returns a report. No training needed.
- Response shape:

```json
{
  "report": "FINDINGS\n- Effusion suspected (71% probability) ...",
  "findings": ["Effusion", "Cardiomegaly"],
  "probabilities": {"Effusion": 0.71, "Cardiomegaly": 0.64, "...": 0.1},
  "heatmaps": {"Effusion": "data:image/jpeg;base64,..."},
  "risk": "high | moderate | low",
  "inference_ms": 140
}
```

`heatmaps` are Class Activation Maps showing *where* the model looked for each of the top 4 findings.

- See [`ml/README.md`](ml/README.md) for model details and evaluation results
  (including why our fine-tuned Qwen2-VL model is not used by default).

3. React frontend (`http://localhost:3000`)

Runtime flow:

1. User logs in from frontend.
2. User uploads X-ray in dashboard.
3. Frontend calls the ML service (`/predict`) to detect diseases and build the report.
4. User clicks Save to History.
5. Frontend sends image + report text to local backend.
6. Backend stores data in MongoDB and serves it via history APIs.

## 2. Tech Stack

Frontend:
- React 19
- react-router-dom
- framer-motion
- axios
- jsPDF + jspdf-autotable

Backend:
- Node.js + Express
- Mongoose
- Multer
- bcryptjs
- dotenv

Database:
- MongoDB Atlas or local MongoDB

## 3. Project Structure

```text
cxr-rrg/
  backend/
    models/
      Report.js
      User.js
    uploads/
    .env.example
    package.json
    server.js
  ml/
    server.py         # Flask /predict API
    classifier.py     # TorchXRayVision disease classifier
    inference.py      # fine-tuned Qwen2-VL + LoRA (optional, Apple Silicon)
    evaluate.py       # held-out evaluation
    adapters/         # trained LoRA weights
    legacy/           # original training scripts
    requirements.txt
  frontend/
    public/
    src/
      components/
      context/
      pages/
      App.js
    package.json
  README.md
```

## 4. Prerequisites

Install these first:
- Node.js 18 or newer
- npm 9 or newer
- MongoDB connection string
- Python 3.10 or 3.11 for the ML service

Check versions:

```bash
node -v
npm -v
```

## 5. Environment Setup

### Backend `.env`

Use `backend/.env.example` as reference and create `backend/.env`:

```env
PORT=5000
# Local MongoDB (recommended): brew services start mongodb-community@7.0
MONGO_URI=mongodb://127.0.0.1:27017/cxr-rrg
# or Atlas: mongodb+srv://<username>:<password>@<cluster>/<dbName>
DOCTOR_EMAIL=doctor@example.com
DOCTOR_PASSWORD=change-me
JWT_SECRET=replace-with-strong-random-secret
```

Notes:
- `JWT_SECRET` exists in template but is not used in current backend logic.
- `DOCTOR_EMAIL` and `DOCTOR_PASSWORD` are for static doctor login.

### Frontend API Configuration

Current code uses hardcoded URLs:
- `frontend/src/pages/Login.js` -> local backend URL
- `frontend/src/pages/Register.js` -> local backend URL
- `frontend/src/pages/History.js` -> local backend URL
- `frontend/src/pages/UserDashboard.js` -> ML service URL (`REACT_APP_ML_URL`, default `http://127.0.0.1:8000`) and backend URL (`REACT_APP_BACKEND_URL`, default `http://127.0.0.1:5000`)

## 6. Installation

From repository root:

```bash
cd backend
npm install

cd ../frontend
npm install

cd ..
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r ml/requirements.txt
```

## 7. How to Run (Detailed)

### Option A: Local Full Run (Most Common)

Open 3 terminals.

Terminal 0 (ML service):

```bash
source .venv/bin/activate
python ml/server.py
```

Expected log: `Ready.` and `Running on http://127.0.0.1:8000`

Terminal 1 (Backend):

```bash
cd backend
npm run dev
```

Expected log:
- `Server running on port 5000`
- `MongoDB connected` (if `MONGO_URI` is valid)

Terminal 2 (Frontend):

```bash
cd frontend
npm start
```

Expected behavior:
- Browser opens at `http://localhost:3000`
- Landing page loads

### Quick test

1. Open `http://localhost:3000` and click **Get started** to create an account.
2. In **Analyze**, click **Try sample X-ray**, then **Run AI analysis**.
3. Click a finding (for example *Nodule*) to see its heatmap. Edit the report, then **Save to history** or export a **PDF**.
4. Open **History** to search, filter, edit or delete saved reports.

### Option B: If AI Inference Is Hosted Remotely (Colab/ngrok, `CXR_Model.ipynb`)

1. Start your inference service.
2. Get public URL (example: `https://xxxx.ngrok-free.app`).
3. Create `frontend/.env` with `REACT_APP_ML_URL=https://xxxx.ngrok-free.app`.
4. Ensure endpoint is reachable at `POST /predict`.
5. Restart frontend (`npm start`) after changes.

### Option C: Run Backend Without MongoDB (Debug only)

Backend can start without `MONGO_URI`, but DB routes will fail.
Use this only for non-persistence UI debugging.

## Deployment

Everything (website, API, AI) runs in **one Docker container** on port 7860. `/ml/*` is proxied
internally to the AI service, and saved X-ray images are stored in MongoDB (GridFS), so no disk is needed.

### Run with Docker on your machine
```bash
docker compose up --build      # starts the app and a MongoDB container
# open http://localhost:7860
```

### Hugging Face Spaces (free, 16 GB RAM)
1. Create a Space with SDK **Docker** and upload this folder, using `deploy/hf-space/README.md` as the Space's `README.md`.
2. In **Settings → Variables and secrets**, add `MONGO_URI` (for example a free MongoDB Atlas cluster with network
   access `0.0.0.0/0`) and `JWT_SECRET` (`openssl rand -hex 32`). `DOCTOR_EMAIL` and `DOCTOR_PASSWORD` are optional.
3. The Space builds the image (about 10 minutes) and serves the app at `https://<user>-<space>.hf.space`.

### Security model
- Sign-in returns a JWT (7-day expiry). Every report endpoint requires it.
- Users only see, edit and delete their own reports. The doctor account (from env) sees all.
- Login and register are rate-limited. Images are served by an unguessable 128-bit key.

## 8. API Reference

Base backend URL: `http://127.0.0.1:5000`

### Auth

`POST /api/auth/register`

Request:

```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

Response (success):

```json
{
  "message": "User registered",
  "user": {
    "email": "user@example.com",
    "role": "user"
  }
}
```

`POST /api/auth/login`

Request:

```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

### Reports

`POST /api/upload`
- Multipart form fields:
- `image` (required)
- `email` (optional)
- `patientName` (optional)
- `notes` (optional)

`POST /api/save-report`
- Multipart form fields:
- `image` (required)
- `email` (optional)
- `patientName` (optional)
- `notes` (optional)
- `reportText` (optional)

`GET /api/reports`
- Returns all reports (latest first)

`GET /api/history?email=<user-email>`
- Returns reports for a specific user

`PUT /api/history/:id`

Request:

```json
{
  "patientName": "Jane Doe",
  "notes": "Updated note",
  "finding": "Updated finding text"
}
```

`DELETE /api/history/:id`
- Deletes one report

`DELETE /api/history/clear/all?email=<user-email>`
- Deletes all reports for one user

### Static Uploads

`GET /uploads/<file-name>` serves files from `backend/uploads`.

## 9. Data Models

### User

```js
{
  email: String,      // required, unique
  password: String,   // required, hashed
  role: String        // "user" or "doctor"
}
```

### Report

```js
{
  userEmail: String,    // required
  patientName: String,  // required
  notes: String,
  imagePath: String,    // required
  aiReport: Object,     // required
  createdAt: Date,
  updatedAt: Date
}
```

## 10. Validation and Smoke Tests

After app is running, test this sequence:

1. Register new user from UI.
2. Login with same account.
3. Open Dashboard.
4. Upload an image and run analysis.
5. Save report to history.
6. Open History and verify report appears.
7. Open report modal and edit fields.
8. Download PDF.
9. Delete one report.
10. Clear all history.

Quick backend checks with curl (PowerShell/cmd with curl):

```bash
curl http://127.0.0.1:5000/api/reports
```

```bash
curl "http://127.0.0.1:5000/api/history?email=user@example.com"
```

## 11. Common Issues and Fixes

MongoDB connection failure:
- Verify `MONGO_URI` in `backend/.env`
- Check Atlas network access and credentials

Frontend cannot call backend:
- Confirm backend is running on port `5000`
- Confirm `API_URL` values in frontend pages

AI report generation fails:
- Confirm external inference URL is active
- Confirm `POST /predict` exists
- Check ngrok/host tunnel status

Uploaded image not rendering:
- Confirm backend static route `/uploads` is reachable
- Confirm file exists inside `backend/uploads`

History is empty after save:
- Confirm same email is used in login and report save payload

## 12. Security and Git Safety Checklist

Before pushing to Git:

1. Never commit real `.env` files.
2. Keep only `.env.example` templates in repository.
3. Rotate secrets immediately if leaked.
4. Use different credentials for dev/staging/prod.
5. Remove hardcoded external URLs from code before sharing publicly.

Recommended cleanup:
- Move all frontend API URLs to environment variables.
- Add backend auth tokens/JWT for route protection.

## 13. Scripts

Backend (`backend/package.json`):
- `npm run dev` -> start with nodemon
- `npm start` -> start with node

Frontend (`frontend/package.json`):
- `npm start` -> development server
- `npm run build` -> production build
- `npm test` -> tests
- `npm run eject` -> eject CRA config

## 14. Known Limitations

- Login/Register/History pages still use hardcoded backend URLs.
- The fine-tuned Qwen2-VL report generator collapsed to "normal" output (see `ml/README.md`); the classifier is used instead.
- AI output is a screening aid only and must be reviewed by a radiologist.

## 15. License

See `LICENSE` file in repository root.
