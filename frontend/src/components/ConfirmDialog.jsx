import { X, AlertTriangle } from "lucide-react";

/**
 * Lightweight confirmation dialog used for destructive actions.
 */
export default function ConfirmDialog({
    open,
    title = "Confirmer ?",
    message = "",
    confirmLabel = "Confirmer",
    cancelLabel = "Annuler",
    onConfirm,
    onClose,
    destructive = false,
    loading = false,
    testId = "confirm-dialog",
}) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            data-testid={testId}
            onClick={() => !loading && onClose?.()}
        >
            <div
                className="w-full max-w-md rounded-2xl border border-white/10 bg-surface p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        {destructive && (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-500/40 bg-red-500/15 text-red-300">
                                <AlertTriangle size={18} />
                            </div>
                        )}
                        <div className="min-w-0">
                            <div className="font-display text-lg font-bold leading-tight">{title}</div>
                            {message && <p className="mt-1.5 text-sm text-white/60 whitespace-pre-wrap">{message}</p>}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => !loading && onClose?.()}
                        data-testid={`${testId}-close`}
                        className="rounded-full p-1.5 text-white/50 hover:bg-white/5 hover:text-white disabled:opacity-40"
                        disabled={loading}
                    >
                        <X size={16} />
                    </button>
                </div>
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={() => !loading && onClose?.()}
                        disabled={loading}
                        data-testid={`${testId}-cancel`}
                        className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/[0.08] disabled:opacity-40"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={loading}
                        data-testid={`${testId}-confirm`}
                        className={
                            destructive
                                ? "rounded-full border border-red-500/50 bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/35 disabled:opacity-40"
                                : "btn-primary justify-center"
                        }
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
