import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";

export default function ConfirmDialog({ open, title, message, confirmLabel = "Delete", onConfirm, onCancel, busy }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onCancel}>
          <motion.div
            className="panel panel-pad"
            style={{ width: "min(440px, 100%)", background: "var(--surface-solid)" }}
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            onMouseDown={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
          >
            <div style={{ width: 48, height: 48, borderRadius: 14, display: "grid", placeItems: "center", background: "var(--danger-soft)", color: "var(--danger)", marginBottom: 16 }}>
              <AlertTriangle size={22} />
            </div>
            <h3 style={{ fontSize: 22, marginBottom: 8 }}>{title}</h3>
            <p className="muted" style={{ fontSize: 14.5 }}>{message}</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
              <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
              <button className="btn btn-danger" onClick={onConfirm} disabled={busy} style={{ background: "var(--danger)", color: "#fff" }}>
                {busy ? <span className="spinner" /> : null} {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
