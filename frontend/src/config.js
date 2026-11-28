// Everything is served from one origin: the backend serves the website, the API (/api)
// and proxies the AI (/ml) for signed-in users. In development, Create React App's dev
// server forwards /api and /ml to the backend (see "proxy" in package.json).
export const ML_URL = "/ml";
export const BACKEND_URL = "";

export const THRESHOLD = 0.5;

export const imageUrl = (imagePath) => {
  if (!imagePath) return "";
  const s = String(imagePath).replace(/\\/g, "/");
  if (s.startsWith("api/images/")) return `/${s}`;
  const idx = s.indexOf("uploads/");
  const rel = idx !== -1 ? s.slice(idx) : "uploads/" + s.split("/").pop();
  return `/${rel}`;
};
