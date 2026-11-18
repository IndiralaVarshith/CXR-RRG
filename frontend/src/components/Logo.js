import { Link } from "react-router-dom";

export const LogoMark = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M12 3v18" />
    <path d="M12 7c-3.2 0-5.6 1.2-6.6 3.2M12 10.5c-3 0-5.2 1.1-6 2.9M12 14c-2.6 0-4.6 1-5.3 2.5" />
    <path d="M12 7c3.2 0 5.6 1.2 6.6 3.2M12 10.5c3 0 5.2 1.1 6 2.9M12 14c2.6 0 4.6 1 5.3 2.5" />
    <circle cx="16.4" cy="8.6" r="1.6" fill="var(--danger)" stroke="none" />
  </svg>
);

export default function Logo({ to = "/" }) {
  return (
    <Link to={to} className="logo" aria-label="CXR-RRG home">
      <span className="logo-mark"><LogoMark /></span>
      <span>
        <span className="logo-text">CXR<span>·</span>RRG</span>
        <span className="logo-sub">Radiology AI</span>
      </span>
    </Link>
  );
}
