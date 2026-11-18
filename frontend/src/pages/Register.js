import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Mail, User, ArrowRight, AlertTriangle } from "lucide-react";
import axios from "axios";
import AuthLayout from "../components/AuthLayout";
import PasswordInput from "../components/PasswordInput";
import { useToast } from "../components/Toast";
import { BACKEND_URL } from "../config";
import { setUser } from "../lib/auth";

const strength = (pw) => {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
};
const COLORS = ["var(--danger)", "var(--danger)", "var(--warn)", "var(--accent)", "var(--ok)"];
const LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"];

export default function Register() {
  const nav = useNavigate();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const s = strength(password);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    setLoading(true);
    try {
      await axios.post(`${BACKEND_URL}/api/auth/register`, { name: name.trim(), email: email.trim(), password });
      const { data } = await axios.post(`${BACKEND_URL}/api/auth/login`, { email: email.trim(), password });
      setUser({ email: data.email, name: data.name || name.trim(), role: data.role });
      toast("success", "Account created", "Your workspace is ready.");
      nav("/dashboard", { replace: true });
    } catch (err) {
      if (!err.response) setError(`Can't reach the server at ${BACKEND_URL}. Is the backend running?`);
      else setError(err.response.data?.error || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your workspace"
      subtitle="Start screening chest X-rays with explainable AI."
      footer={<>Already have an account? <Link to="/login">Sign in</Link></>}
    >
      <form className="auth-form" onSubmit={submit}>
        <AnimatePresence>
          {error && (
            <motion.div className="auth-error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <AlertTriangle size={16} /> {error}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="field">
          <label>Full name</label>
          <div className="input-wrap">
            <User size={17} />
            <input className="input" placeholder="Dr. Jane Smith" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required autoFocus />
          </div>
        </div>
        <div className="field">
          <label>Email</label>
          <div className="input-wrap">
            <Mail size={17} />
            <input className="input" type="email" placeholder="name@hospital.org" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </div>
        </div>
        <div className="field">
          <label>Password</label>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          {password && (
            <>
              <div className="pw-meter">
                {[0, 1, 2, 3].map((i) => <span key={i} style={{ background: i < s ? COLORS[s] : undefined }} />)}
              </div>
              <span className="mono" style={{ fontSize: 11, color: COLORS[s] }}>{LABELS[s]}</span>
            </>
          )}
        </div>
        <button className="btn btn-primary btn-lg btn-block" disabled={loading} style={{ marginTop: 8 }}>
          {loading ? <><span className="spinner" /> Creating account…</> : <>Create account <ArrowRight size={18} /></>}
        </button>
      </form>
    </AuthLayout>
  );
}
