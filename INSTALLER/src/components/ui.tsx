import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { X } from "lucide-react";

// ---------------------------------------------------------------------------
// Buttons & inputs
// ---------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-110 font-medium",
  secondary: "bg-raised text-ink border border-border hover:border-muted",
  ghost: "text-muted hover:text-ink",
  danger: "bg-status-cancelled/15 text-[#e7877e] border border-status-cancelled/40 hover:bg-status-cancelled/25",
  success: "bg-status-verified/15 text-[#6fd3a0] border border-status-verified/40 hover:bg-status-verified/25",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "text-xs px-2.5 py-1.5" : "text-sm px-3 py-2";
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed ${sz} ${VARIANT[variant]} ${className}`}
      {...props}
    />
  );
}

const inputCls =
  "w-full bg-raised border border-border rounded-md px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:border-accent/70";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs text-muted block mb-1">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted/80 block mt-1">{hint}</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center sm:p-4 z-50" onMouseDown={onClose}>
      <div
        className={`bg-surface border border-border rounded-t-xl sm:rounded-xl w-full ${
          wide ? "sm:max-w-2xl" : "sm:max-w-md"
        } max-h-[92vh] flex flex-col`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <h2 className="font-display text-base">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-border flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/** Confirm dialog with an optional free-text field (e.g. a reason). */
export function Confirm({
  title,
  body,
  confirmLabel,
  variant = "primary",
  inputLabel,
  inputPlaceholder,
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  variant?: Variant;
  inputLabel?: string;
  inputPlaceholder?: string;
  onConfirm: (text: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button
            variant={variant}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(text.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm space-y-3">
        <div className="text-muted">{body}</div>
        {inputLabel && (
          <Field label={inputLabel}>
            <Textarea rows={2} value={text} placeholder={inputPlaceholder} onChange={(e) => setText(e.target.value)} />
          </Field>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

const ToastCtx = createContext<(kind: ToastKind, text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastKind, text: string) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, kind, text }]);
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === "error" ? 9000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[60] space-y-2 sm:w-96" aria-live="polite">
        {items.slice(-3).map((t) => (
          <div
            key={t.id}
            className={`rounded-lg border px-4 py-3 text-sm shadow-lg whitespace-pre-line bg-surface ${
              t.kind === "error"
                ? "border-status-cancelled/60"
                : t.kind === "success"
                ? "border-status-completed/60"
                : "border-border"
            }`}
          >
            <div className="flex gap-3 items-start">
              <span
                className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                  t.kind === "error" ? "bg-status-cancelled" : t.kind === "success" ? "bg-status-completed" : "bg-accent"
                }`}
              />
              <span className="flex-1">{t.text}</span>
              <button
                className="text-muted hover:text-ink"
                onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
