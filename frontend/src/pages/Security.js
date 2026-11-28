import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import { Laptop, Smartphone, LogOut, ShieldCheck, KeyRound, RefreshCw, AlertTriangle } from "lucide-react";
import Navbar from "../components/Navbar";
import PasswordInput from "../components/PasswordInput";
import { useToast } from "../components/Toast";
import { useUser } from "../components/RequireAuth";
import { BACKEND_URL } from "../config";
import { passwordProblem, setUser } from "../lib/auth";
import "../components/auth.css";
import "./dashboard.css";
import "./security.css";

const ago = (d) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};

export default function Security() {
  const toast = useToast();
  const user = useUser();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwError, setPwError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${BACKEND_URL}/api/auth/sessions`);
      setSessions(data.sessions);
    } catch {
      toast("error", "Couldn't load your devices");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (s) => {
    setBusy(s.id);
    try {
      await axios.delete(`${BACKEND_URL}/api/auth/sessions/${s.id}`);
      if (s.current) {
        setUser(null);
        return;
      }
      toast("success", "Device signed out", s.device);
      load();
    } catch {
      toast("error", "Couldn't sign out that device");
    } finally {
      setBusy("");
    }
  };

  const revokeOthers = async () => {
    setBusy("others");
    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/auth/sessions/revoke-others`);
      toast("success", "Other devices signed out", `${data.count} device${data.count === 1 ? "" : "s"}`);
      load();
    } catch {
      toast("error", "Couldn't sign out other devices");
    } finally {
      setBusy("");
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwError("");
    const problem = passwordProblem(pw.next);
    if (problem) return setPwError(`New password: ${problem.toLowerCase()}.`);
    setBusy("pw");
    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/auth/change-password`, {
        currentPassword: pw.current,
        newPassword: pw.next,
      });
      setUser(data.user);
      setPw({ current: "", next: "" });
      toast("success", "Password updated", "Your other devices were signed out.");
      load();
    } catch (err) {
      setPwError(err.response?.data?.error || "Couldn't update the password.");
    } finally {
      setBusy("");
    }
  };

  const others = sessions.filter((s) => !s.current).length;

  return (
    <div className="page">
      <Navbar />
      <main className="container sec">
        <div className="dash-head">
          <div>
            <span className="eyebrow">Account security</span>
            <h1>Your devices</h1>
            <p className="muted" style={{ marginTop: 8 }}>
              Signed in as <b>{user?.email}</b>. Only you can see this list. Each sign-in works only on the device it was made on.
            </p>
          </div>
          <div className="dash-status">
            <button className="icon-btn" onClick={load} title="Refresh"><RefreshCw size={16} /></button>
            {others > 0 && (
              <button className="btn btn-danger btn-sm" onClick={revokeOthers} disabled={busy === "others"}>
                <LogOut size={15} /> Sign out other devices
              </button>
            )}
          </div>
        </div>

        <section className="panel sec-list">
          {loading
            ? [0, 1].map((i) => <div key={i} className="skeleton" style={{ height: 68, margin: 12 }} />)
            : sessions.map((s, i) => {
                const Icon = /iOS|Android|mobile/.test(s.device) ? Smartphone : Laptop;
                return (
                  <motion.div key={s.id} className="sec-row" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <span className="sec-ic"><Icon size={20} /></span>
                    <div className="sec-main">
                      <div className="sec-dev">
                        {s.device}
                        {s.current && <span className="chip ok">This device</span>}
                        {s.method === "google" && <span className="chip neutral">Google</span>}
                      </div>
                      <div className="faint sec-meta">
                        {s.ip && <>Network {s.ip} · </>}Signed in {new Date(s.createdAt).toLocaleString()} · Active {ago(s.lastSeenAt)}
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => revoke(s)} disabled={busy === s.id}>
                      <LogOut size={14} /> {s.current ? "Sign out" : "Remove"}
                    </button>
                  </motion.div>
                );
              })}
        </section>

        <div className="sec-grid">
          <section className="panel panel-pad">
            <h3 className="sec-h"><KeyRound size={18} /> {user?.hasPassword ? "Change password" : "Set a password"}</h3>
            {user?.role === "doctor" ? (
              <p className="muted">The doctor account's password is managed by the server administrator.</p>
            ) : (
              <form className="auth-form" onSubmit={changePassword} noValidate>
                {pwError && <div className="auth-error" role="alert"><AlertTriangle size={16} /> {pwError}</div>}
                {user?.hasPassword && (
                  <div className="field">
                    <label htmlFor="cur">Current password</label>
                    <PasswordInput id="cur" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="new">New password</label>
                  <PasswordInput id="new" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
                  <span className="faint" style={{ fontSize: 12 }}>8–72 characters with a letter and a number. Other devices will be signed out.</span>
                </div>
                <button className="btn btn-primary" disabled={busy === "pw" || !pw.next}>Update password</button>
              </form>
            )}
          </section>
          <section className="panel panel-pad">
            <h3 className="sec-h"><ShieldCheck size={18} /> How your account is protected</h3>
            <ul className="sec-points muted">
              <li>Your sign-in is kept in a secure cookie that page scripts can't read, so it can't be stolen by injected code.</li>
              <li>A sign-in is locked to the browser it was made on. Copied to another device, it is rejected and ended.</li>
              <li>5 wrong passwords lock the account for 15 minutes; sign-in attempts are rate limited.</li>
              <li>Passwords are stored only as salted bcrypt hashes. Nobody, including admins, can read them.</li>
              <li>Your reports and X-ray images are visible only to you (and to the clinic's doctor account).</li>
              <li>Sessions expire after 7 days, or 3 days without use.</li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
