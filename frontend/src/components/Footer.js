import { ShieldCheck } from "lucide-react";
import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <Logo />
        <p className="footer-note">
          <ShieldCheck size={14} style={{ verticalAlign: "-2px", marginRight: 6, color: "var(--accent)" }} />
          Research and educational screening aid. Not a medical device, and not a substitute for a
          qualified radiologist's diagnosis.
        </p>
        <span className="mono">© {new Date().getFullYear()} CXR-RRG</span>
      </div>
    </footer>
  );
}
