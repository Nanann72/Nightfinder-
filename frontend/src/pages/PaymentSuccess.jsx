import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

export default function PaymentSuccess() {
    const [params] = useSearchParams();
    const nav = useNavigate();
    const sessionId = params.get("session_id");
    const [state, setState] = useState("polling"); // polling | paid | failed | expired
    const [tx, setTx] = useState(null);

    useEffect(() => {
        if (!sessionId) { setState("failed"); return; }
        let cancelled = false;
        let attempts = 0;
        const MAX = 35;  // ~75s total with progressive backoff
        const poll = async () => {
            if (cancelled) return;
            try {
                const { data } = await api.get(`/payments/status/${sessionId}`);
                if (cancelled) return;
                setTx(data);
                if (data.payment_status === "paid") {
                    setState("paid");
                    // Force the wallet chip and any wallet-refresh listener to refetch immediately
                    try { window.dispatchEvent(new Event("wallet-refresh")); } catch {}
                    return;
                }
                if (data.status === "expired")       { setState("expired"); return; }
            } catch { /* swallow transient errors and keep polling */ }
            attempts++;
            if (cancelled) return;
            if (attempts < MAX) {
                // 0–6 attempts every 1s, 6–18 every 2s, 18+ every 3s
                const delay = attempts < 6 ? 1000 : attempts < 18 ? 2000 : 3000;
                setTimeout(poll, delay);
            } else {
                setState("failed");
            }
        };
        poll(); // start IMMEDIATELY (no initial wait)
        return () => { cancelled = true; };
    }, [sessionId]);

    const retryNow = async () => {
        setState("polling");
        try {
            // Force a reconcile in case the webhook fired AFTER we gave up.
            await api.post("/wallet/reconcile");
            const { data } = await api.get(`/payments/status/${sessionId}`);
            setTx(data);
            setState(data.payment_status === "paid" ? "paid" : "failed");
        } catch { setState("failed"); }
    };

    return (
        <div className="container-mx py-20">
            <div className="mx-auto max-w-md surface-card p-10 text-center" data-testid="payment-result">
                {state === "polling" && (
                    <>
                        <Loader2 className="mx-auto animate-spin text-magenta" size={40} />
                        <h1 className="mt-4 font-display text-2xl font-bold">Traitement du paiement…</h1>
                        <p className="mt-2 text-sm text-white/60">Ne ferme pas cette fenêtre.</p>
                    </>
                )}
                {state === "paid" && (
                    <>
                        <CheckCircle2 className="mx-auto text-green-400" size={48} />
                        <h1 className="mt-4 font-display text-2xl font-bold">
                            {tx?.type === "coin_pack" ? "Coins ajoutés ✨"
                             : tx?.type === "bundle_subscription" ? "Abonnement activé 💖"
                             : "Paiement confirmé ✓"}
                        </h1>
                        <p className="mt-2 text-sm text-white/60">
                            {tx?.type === "bundle_subscription"
                              ? "Merci ! Ton abonnement est actif. Tu peux découvrir tout le contenu."
                              : "Merci ! Ton wallet a été mis à jour."}
                        </p>
                        {tx?.amount && <div className="mt-4 font-mono text-xl">{Number(tx.amount).toFixed(2)}€</div>}
                        <button
                            onClick={() => nav(tx?.type === "bundle_subscription" ? "/subscriptions" : "/wallet")}
                            data-testid="payment-back-btn"
                            className="btn-primary mt-6"
                        >
                            {tx?.type === "bundle_subscription" ? "Voir mes abonnements" : "Voir mon wallet"}
                        </button>
                    </>
                )}
                {(state === "failed" || state === "expired") && (
                    <>
                        <XCircle className="mx-auto text-red-400" size={48} />
                        <h1 className="mt-4 font-display text-2xl font-bold">Paiement non confirmé</h1>
                        <p className="mt-2 text-sm text-white/60">{state === "expired" ? "La session a expiré." : "Statut introuvable. Si tu as bien payé, clique « Vérifier à nouveau »."}</p>
                        <div className="mt-6 flex flex-wrap justify-center gap-2">
                            <button onClick={retryNow} className="btn-primary" data-testid="payment-retry-btn">
                                Vérifier à nouveau
                            </button>
                            <button onClick={() => nav("/wallet")} className="btn-ghost" data-testid="payment-back-wallet-btn">
                                Voir mon wallet
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
