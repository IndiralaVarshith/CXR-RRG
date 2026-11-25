import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Mail, ArrowRight, AlertTriangle } from "lucide-react";
import axios from "axios";
import AuthLayout from "../components/AuthLayout";
import PasswordInput from "../components/PasswordInput";
import { useToast } from "../components/Toast";
import { BACKEND_URL } from "../config";
import { setUser } from "../lib/auth";

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/auth/login`, { email: email.trim(), password });
      setUser({ token: data.token, email: data.email, name: data.name || (data.role === "doctor" ? "Doctor" : ""), role: data.role });
      toast("success", "Signed in", `Welcome back${data.name ? `, ${data.name}` : ""}.`);
      nav(loc.state?.from || "/dashboard", { replace: true });
    } catch (err) {
      if (!err.response) setError("Can't reach the server. Please try again in a moment.");
      else setError(err.response.data?.error || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your radiology workspace."
      footer={<>New to CXR-RRG? <Link to="/register">Create an account</Link></>}
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
          <label>Email</label>
          <div className="input-wrap">
            <Mail size={17} />
            <input className="input" type="email" placeholder="name@hospital.org" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
          </div>
        </div>
        <div className="field">
          <label>Password</label>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <button className="btn btn-primary btn-lg btn-block" disabled={loading} style={{ marginTop: 8 }}>
          {loading ? <><span className="spinner" /> Signing in…</> : <>Sign in <ArrowRight size={18} /></>}
        </button>
      </form>
    </AuthLayout>
  );
}
