const PROD = process.env.NODE_ENV === "production";

// In production the website, backend and ML service share one origin:
// the backend serves the site and proxies /ml/* to the ML service.
// ML server (ml/server.py). Override with REACT_APP_ML_URL in frontend/.env
export const ML_URL = process.env.REACT_APP_ML_URL || (PROD ? "/ml" : "http://127.0.0.1:8000");
// Node/Express backend (backend/server.js). Override with REACT_APP_BACKEND_URL
export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL ?? (PROD ? "" : "http://127.0.0.1:5000");

export const THRESHOLD = 0.5;

export const imageUrl = (imagePath) => {
  if (!imagePath) return "";
  const s = String(imagePath).replace(/\\/g, "/");
  if (s.startsWith("api/images/")) return `${BACKEND_URL}/${s}`;
  const idx = s.indexOf("uploads/");
  const rel = idx !== -1 ? s.slice(idx) : "uploads/" + s.split("/").pop();
  return `${BACKEND_URL}/${rel}`;
};
