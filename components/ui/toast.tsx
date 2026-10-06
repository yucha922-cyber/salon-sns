"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastTone = "success" | "error";
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone === "error" ? "toast-error" : ""}`} role="status">
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
