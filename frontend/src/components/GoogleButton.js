import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { BACKEND_URL } from "../config";
import { setUser } from "../lib/auth";
import { useTheme } from "../context/ThemeContext";

let scriptPromise = null;
const loadScript = () => {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = resolve;
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error("Google sign-in could not load"));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
};

/**
 * "Continue with Google". Shown only when the server has GOOGLE_CLIENT_ID configured.
 * Google returns a signed ID token; the server verifies it and starts a session.
 */
export default function GoogleButton({ onError, text = "continue_with" }) {
  const ref = useRef(null);
  const { theme } = useTheme();
  const [clientId, setClientId] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let alive = true;
    axios
      .get(`${BACKEND_URL}/api/auth/config`)
      .then(({ data }) => alive && setClientId(data.googleClientId || null))
      .catch(() => alive && setClientId(null));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!clientId || !ref.current) return;
    let alive = true;
    loadScript()
      .then(() => {
        if (!alive || !ref.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: "popup",
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: async ({ credential }) => {
            setBusy(true);
            try {
              const { data } = await axios.post(`${BACKEND_URL}/api/auth/google`, { credential });
              setUser(data.user); // GuestOnly then routes into the app
            } catch (err) {
              onErrorRef.current?.(err.response?.data?.error || "Google sign-in failed. Please try again.");
            } finally {
              setBusy(false);
            }
          },
        });
        ref.current.innerHTML = "";
        window.google.accounts.id.renderButton(ref.current, {
          type: "standard",
          theme: theme === "dark" ? "filled_black" : "outline",
          size: "large",
          shape: "pill",
          text,
          logo_alignment: "left",
          width: Math.min(400, ref.current.offsetWidth || 360),
        });
      })
      .catch(() => alive && onErrorRef.current?.("Google sign-in is unavailable right now."));
    return () => {
      alive = false;
    };
  }, [clientId, theme, text]);

  if (!clientId) return null;
  return (
    <>
      <div className={`google-btn ${busy ? "busy" : ""}`} ref={ref} />
      <div className="auth-divider"><span>or use email</span></div>
    </>
  );
}
