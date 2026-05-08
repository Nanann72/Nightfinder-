import { useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle2 } from "lucide-react";
import { ensurePushSubscription, unsubscribePush } from "@/lib/push";

/**
 * Lightweight opt-in card for web push notifications. Hidden when the
 * browser doesn't support push or when permission has been explicitly denied.
 */
export default function PushOptInCard() {
    const [state, setState] = useState("idle"); // idle | subscribed | denied | unsupported | loading | error
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
            setState("unsupported"); return;
        }
        if (Notification.permission === "denied") { setState("denied"); return; }
        // Check active subscription
        navigator.serviceWorker.getRegistration().then(async (reg) => {
            if (!reg) return;
            const sub = await reg.pushManager.getSubscription();
            if (sub) setState("subscribed");
        }).catch(() => { /* ignore */ });
    }, []);

    if (state === "unsupported") return null;

    const enable = async () => {
        setState("loading"); setMessage("");
        const res = await ensurePushSubscription();
        if (res.subscribed) { setState("subscribed"); setMessage(""); }
        else { setState("error"); setMessage(res.reason || "Activation échouée"); }
    };

    const disable = async () => {
        setState("loading");
        await unsubscribePush();
        setState("idle"); setMessage("");
    };

    return (
        <div className="mt-8 surface-card border-magenta/20" data-testid="push-optin-card">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <div className="overline flex items-center gap-2">
                        <Bell size={12} /> Notifications push
                    </div>
                    <div className="mt-1 font-display text-xl font-bold sm:text-2xl">Reste alertée en temps réel</div>
                    <p className="mt-1 text-sm text-white/60">
                        Reçois une notification immédiate pour les nouveaux messages, pourboires et unlocks — même quand le site est fermé.
                    </p>
                </div>
                <div className="shrink-0">
                    {state === "subscribed" ? (
                        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-semibold text-green-300" data-testid="push-status-enabled">
                                <CheckCircle2 size={13} /> Activées
                            </span>
                            <button onClick={disable} data-testid="push-disable-btn"
                                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.08]">
                                <BellOff size={13} /> Désactiver
                            </button>
                        </div>
                    ) : state === "denied" ? (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300" data-testid="push-status-denied">
                            Permission refusée dans le navigateur. Active-les manuellement via les paramètres du site.
                        </div>
                    ) : (
                        <button onClick={enable} disabled={state === "loading"} data-testid="push-enable-btn"
                                className="btn-primary">
                            <Bell size={14} /> {state === "loading" ? "Activation…" : "Activer les notifications"}
                        </button>
                    )}
                </div>
            </div>
            {state === "error" && message && (
                <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300" data-testid="push-error">{message}</div>
            )}
        </div>
    );
}
