import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Mail, User, ArrowRight, AlertTriangle, Check } from "lucide-react";
import axios from "axios";
import AuthLayout from "../components/AuthLayout";
import GoogleButton from "../components/GoogleButton";
import PasswordInput from "../components/PasswordInput";
import { useToast } from "../components/Toast";
import { BACKEND_URL } from "../config";
import { passwordProblem, setUser } from "../lib/auth";

const strength = (pw) => {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 14) s++;
  return s;
};
const COLORS = ["var(--danger)", "var(--danger)", "var(--warn)", "var(--accent)", "var(--ok)"];
const LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"];
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'-]{0,79}$/u;

export default function Register() {
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const s = strength(password);
  const rules = [
    ["8+ characters", password.length >= 8],
    ["a letter", /[A-Za-z]/.test(password)],
    ["a number", /\d/.test(password)],
  ];

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    const cleanName = name.trim().replace(/\s+/g, " ");
    if (!NAME_RE.test(cleanName)) return setError("Enter your name using letters only.");
    const problem = passwordProblem(password);
    if (problem) return setError(`Password: ${problem.toLowerCase()}.`);
    setLoading(true);
    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/auth/register`, { name: cleanName, email: email.trim(), password });
      toast("success", "Account created", "Your workspace is ready.");
      setUser(data.user);
    } catch (err) {
      if (!err.response) setError("Can't reach the server. Please try again in a moment.");
      else setError(err.response.data?.error || "Registration failed.");
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your workspace"
      subtitle="Start screening chest X-rays with explainable AI."
      footer={<>Already have an account? <Link to="/login">Sign in</Link></>}
    >
      <GoogleButton onError={setError} text="signup_with" />
      <form className="auth-form" onSubmit={submit} noValidate>
        <AnimatePresence>
          {error && (
            <motion.div className="auth-error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <AlertTriangle size={16} /> {error}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="field">
          <label htmlFor="name">Full name</label>
          <div className="input-wrap">
            <User size={17} />
            <input id="name" className="input" placeholder="Jane Smith" value={name} onChange={(e) => setName(e.target.value)}
              autoComplete="name" maxLength={80} required autoFocus />
          </div>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <div className="input-wrap">
            <Mail size={17} />
            <input id="email" className="input" type="email" placeholder="name@hospital.org" value={email}
              onChange={(e) => setEmail(e.target.value)} autoComplete="username" maxLength={254} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          {password && (
            <>
              <div className="pw-meter">
                {[0, 1, 2, 3].map((i) => <span key={i} style={{ background: i < s ? COLORS[s] : undefined }} />)}
              </div>
              <div className="pw-rules">
                <span className="mono" style={{ color: COLORS[s] }}>{LABELS[s]}</span>
                {rules.map(([t, ok]) => (
                  <span key={t} className={ok ? "ok" : ""}>{ok && <Check size={11} />} {t}</span>
                ))}
              </div>
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
