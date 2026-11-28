import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Mail, ArrowRight, AlertTriangle, Info } from "lucide-react";
import axios from "axios";
import AuthLayout from "../components/AuthLayout";
import GoogleButton from "../components/GoogleButton";
import PasswordInput from "../components/PasswordInput";
import { useToast } from "../components/Toast";
import { BACKEND_URL } from "../config";
import { setUser } from "../lib/auth";

export default function Login() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/auth/login`, { email: email.trim(), password });
      toast("success", "Signed in", `Welcome back${data.user.name ? `, ${data.user.name}` : ""}.`);
      setUser(data.user); // GuestOnly redirects to where the user was going
    } catch (err) {
      setPassword("");
      if (!err.response) setError("Can't reach the server. Please try again in a moment.");
      else setError(err.response.data?.error || "Invalid email or password.");
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your radiology workspace."
      footer={<>New to CXR-RRG? <Link to="/register">Create an account</Link></>}
    >
      {params.get("expired") && !error && (
        <div className="auth-info"><Info size={16} /> Your session ended. Please sign in again.</div>
      )}
      <GoogleButton onError={setError} text="signin_with" />
      <form className="auth-form" onSubmit={submit} noValidate>
        <AnimatePresence>
          {error && (
            <motion.div className="auth-error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <AlertTriangle size={16} /> {error}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="field">
          <label htmlFor="email">Email</label>
          <div className="input-wrap">
            <Mail size={17} />
            <input id="email" className="input" type="email" placeholder="name@hospital.org" value={email}
              onChange={(e) => setEmail(e.target.value)} autoComplete="username" maxLength={254} required autoFocus />
          </div>
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <button className="btn btn-primary btn-lg btn-block" disabled={loading || !email || !password} style={{ marginTop: 8 }}>
          {loading ? <><span className="spinner" /> Signing in…</> : <>Sign in <ArrowRight size={18} /></>}
        </button>
      </form>
    </AuthLayout>
  );
}
