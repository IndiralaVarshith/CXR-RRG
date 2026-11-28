import axios from "axios";
import { BACKEND_URL } from "../config";

// The session itself lives in an httpOnly cookie that JavaScript cannot read.
// Only the non-secret profile (name, email, role) is kept here, in memory.
let current = null;
const listeners = new Set();

export const getUser = () => current;

export const setUser = (user) => {
  current = user ? { ...user, name: user.name || String(user.email || "").split("@")[0] } : null;
  listeners.forEach((fn) => fn(current));
};

export const onUserChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Ask the server who is signed in on this device (called once at start-up). */
export async function loadSession() {
  try {
    const { data } = await axios.get(`${BACKEND_URL}/api/auth/me`);
    setUser(data.user);
  } catch {
    setUser(null);
  }
  return current;
}

export async function logout() {
  try {
    await axios.post(`${BACKEND_URL}/api/auth/logout`);
  } catch {
    /* signed out locally anyway */
  }
  setUser(null);
}

export const initials = (name = "") =>
  name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "U";

// Same-origin requests carry the session cookie; sign out when the server rejects it.
let installed = false;
export function installAuthInterceptors() {
  if (installed) return;
  installed = true;
  axios.defaults.withCredentials = true;
  axios.interceptors.response.use(
    (r) => r,
    (err) => {
      const url = String(err.config?.url || "");
      if (err.response?.status === 401 && !url.includes("/api/auth/")) {
        setUser(null);
        if (!/^\/(login|register)/.test(window.location.pathname)) {
          window.location.assign(`/login?expired=1`);
        }
      }
      return Promise.reject(err);
    }
  );
}

// ---------------- password rules (mirrors the server) ----------------
export function passwordProblem(pw) {
  if (pw.length < 8) return "At least 8 characters";
  if (new TextEncoder().encode(pw).length > 72) return "At most 72 characters";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Include a letter and a number";
  return null;
}
