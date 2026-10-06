"use client";

import { useEffect, type ReactNode } from "react";

export function Modal({
  open,
  title,
  intro,
  onClose,
  children,
  actions,
}: {
  open: boolean;
  title: string;
  intro?: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <button className="modal-close" onClick={onClose} aria-label="閉じる">
          ×
        </button>
        <h2 id="modalTitle">{title}</h2>
        {intro && <p className="modal-intro">{intro}</p>}
        {children}
        {actions && <div className="modal-actions">{actions}</div>}
      </section>
    </div>
  );
}
