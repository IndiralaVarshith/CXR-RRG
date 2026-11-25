---
title: CXR-RRG
emoji: 🫁
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
short_description: Explainable AI chest X-ray screening (18 pathologies)
---

# CXR-RRG: AI chest X-ray screening

Upload a frontal chest X-ray to get:
- the most likely diagnosis and every condition found, with an "AI confidence" bar for each
- a reliability rating per condition
- heatmaps showing where the AI looked
- an editable report you can save or export as a PDF

The AI is a calibrated ensemble of 5 TorchXRayVision models. On 1,109 held-out Indiana University
patients it scores a mean per-disease AUROC of 0.869.

**Research and educational screening aid only. Not a medical device. Every result must be reviewed by a qualified radiologist.**

Source: https://github.com/IndiralaVarshith/CXR-RRG

## Space secrets (Settings → Variables and secrets)
| Name | Required | What |
|---|---|---|
| `MONGO_URI` | yes | MongoDB connection string (e.g. a free MongoDB Atlas cluster) |
| `JWT_SECRET` | yes | a long random string (`openssl rand -hex 32`) |
| `DOCTOR_EMAIL`, `DOCTOR_PASSWORD` | optional | a doctor account that can see every report |
