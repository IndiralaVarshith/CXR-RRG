import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Sun, Moon, LogOut, Menu, X, ScanLine, History as HistoryIcon, Cpu, Home } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { getUser, initials, logout } from "../lib/auth";
import Logo from "./Logo";

export default function Navbar() {
  const nav = useNavigate();
  const loc = useLocation();
  const { theme, toggleTheme } = useTheme();
  const user = getUser();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);

  const links = [
    { to: "/", label: "Home", icon: Home },
    { to: "/features", label: "Technology", icon: Cpu },
    ...(user
      ? [
          { to: "/dashboard", label: "Analyze", icon: ScanLine },
          { to: "/history", label: "History", icon: HistoryIcon },
        ]
      : []),
  ];

  const signOut = () => {
    logout();
    nav("/");
  };

  const renderLinks = () =>
    links.map(({ to, label, icon: Icon }) => (
      <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
        {({ isActive }) => (
          <>
            {isActive && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <Icon size={15} />
            {label}
          </>
        )}
      </NavLink>
    ));

  return (
    <>
      <header className={`nav ${scrolled || open ? "scrolled" : ""}`}>
        <div className="container nav-inner">
          <Logo />
          <nav className="nav-links">{renderLinks()}</nav>
          <div className="nav-right">
            <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }} style={{ display: "grid" }}>
                  {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
                </motion.span>
              </AnimatePresence>
            </button>
            {user ? (
              <>
                <div className="user-badge hide-sm">
                  <span className="avatar">{initials(user.name)}</span>
                  <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</span>
                </div>
                <button className="icon-btn danger hide-sm" onClick={signOut} title="Sign out" aria-label="Sign out">
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm hide-sm">Sign in</Link>
                <Link to="/register" className="btn btn-primary btn-sm hide-sm">Get started</Link>
              </>
            )}
            <button className="icon-btn nav-burger" onClick={() => setOpen((o) => !o)} aria-label="Menu">
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>
      <AnimatePresence>
        {open && (
          <motion.div className="panel mobile-menu" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {renderLinks()}
            <div style={{ height: 1, background: "var(--border)", margin: "6px 0" }} />
            {user ? (
              <button className="btn btn-danger btn-block" onClick={signOut}><LogOut size={16} /> Sign out</button>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Link to="/login" className="btn btn-ghost">Sign in</Link>
                <Link to="/register" className="btn btn-primary">Get started</Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
