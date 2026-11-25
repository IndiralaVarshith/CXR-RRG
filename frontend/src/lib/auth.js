import axios from "axios";

const KEYS = ["token", "email", "userName", "role"];

export const getToken = () => localStorage.getItem("token");

export const getUser = () => {
  const email = localStorage.getItem("email");
  if (!email || !getToken()) return null;
  const stored = localStorage.getItem("userName");
  const name = stored && stored !== "User" && stored !== "Unknown User" ? stored : email.split("@")[0];
  return { email, name, role: localStorage.getItem("role") || "user" };
};

export const setUser = ({ token, email, name, role }) => {
  localStorage.setItem("token", token);
  localStorage.setItem("email", email);
  localStorage.setItem("userName", name || "");
  localStorage.setItem("role", role || "user");
};

export const logout = () => KEYS.forEach((k) => localStorage.removeItem(k));

export const initials = (name = "") =>
  name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "U";

// Attach the sign-in token to backend calls; sign out when it is rejected.
let installed = false;
export function installAuthInterceptors() {
  if (installed) return;
  installed = true;
  axios.interceptors.request.use((cfg) => {
    const t = getToken();
    if (t && !String(cfg.url || "").includes("/ml/") && !String(cfg.url || "").includes(":8000")) {
      cfg.headers = cfg.headers || {};
      cfg.headers.Authorization = `Bearer ${t}`;
    }
    return cfg;
  });
  axios.interceptors.response.use(
    (r) => r,
    (err) => {
      const url = String(err.config?.url || "");
      if (err.response?.status === 401 && !url.includes("/api/auth/")) {
        logout();
        if (!window.location.pathname.startsWith("/login")) window.location.assign("/login");
      }
      return Promise.reject(err);
    }
  );
}
