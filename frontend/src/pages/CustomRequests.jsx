import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth, formatApiError } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { refreshWallet } from "@/components/WalletChip";
import { Image as ImageIcon, X, Send, CheckCircle2, XCircle, Clock, Coins, Gift, Package } from "lucide-react";
import FileUploader from "@/components/FileUploader";

export default function CustomRequests() {
    const { user } = useAuth();
    const isCreator = user?.role === "creator";

    return (
        <div className="container-mx py-10 sm:py-16" data-testid="custom-requests-page">
            <div className="overline flex items-center gap-2"><Package size={12} /> Commandes personnalisées</div>
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
                {isCreator ? "Demandes reçues" : "Mes commandes"}
            </h1>
            <p className="mt-2 text-white/60">
                {isCreator
                    ? "Gère les demandes de contenu personnalisé de tes fans. Les coins sont en escrow jusqu'à livraison."
                    : "Suis tes demandes de contenu personnalisé auprès des créatrices."}
            </p>

            {isCreator ? <CreatorRequests /> : <FanRequests />}
        </div>
    );
}

function StatusBadge({ status }) {
    const map = {
        pending: { label: "En attente", cls: "bg-amber-500/15 text-amber-200 border-amber-500/30", icon: Clock },
        accepted: { label: "Acceptée", cls: "bg-blue-500/15 text-blue-200 border-blue-500/30", icon: CheckCircle2 },
        delivered: { label: "Livrée", cls: "bg-green-500/15 text-green-300 border-green-500/30", icon: CheckCircle2 },
        declined: { label: "Refusée", cls: "bg-red-500/15 text-red-300 border-red-500/30", icon: XCircle },
    };
    const s = map[status] || map.pending;
    const Icon = s.icon;
    return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${s.cls}`}><Icon size={11} /> {s.label}</span>;
}

function CreatorRequests() {
    const [items, setItems] = useState(null);
    const [err, setErr] = useState("");
    const [deliverFor, setDeliverFor] = useState(null);

    const load = async () => {
        try { const r = await api.get("/creators/me/custom-requests"); setItems(r.data); }
        catch (e) { setErr(formatApiError(e.response?.data?.detail)); }
    };
    useEffect(() => { load(); }, []);

    const respond = async (id, action) => {
        const reply = action === "decline" ? window.prompt("Message de refus (optionnel)") || "" : "";
        try {
            await api.post(`/custom-requests/${id}/respond`, { action, reply_message: reply });
            load();
            refreshWallet();
        } catch (e) { setErr(formatApiError(e.response?.data?.detail)); }
    };

    if (!items) return <div className="mt-8 text-white/40">Chargement…</div>;
    if (items.length === 0) return <div className="mt-8 surface-card p-10 text-center text-white/50">Aucune demande pour le moment.</div>;

    return (
        <div className="mt-8 space-y-3">
            {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>}
            {items.map(r => (
                <div key={r.request_id} className="surface-card" data-testid={`request-${r.request_id}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.03]">
                                {r.fan?.avatar_url
                                    ? <img src={r.fan.avatar_url} alt="" className="h-full w-full object-cover" />
                                    : <div className="flex h-full w-full items-center justify-center text-sm">{r.fan?.name?.[0]?.toUpperCase() || "?"}</div>
                                }
                            </div>
                            <div>
                                <div className="font-semibold">{r.fan?.name || "Fan"}</div>
                                <div className="text-xs text-white/50">{new Date(r.created_at).toLocaleString("fr-FR")}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <StatusBadge status={r.status} />
                            <span className="inline-flex items-center gap-1 rounded-full border border-magenta/30 bg-magenta/10 px-2.5 py-0.5 text-sm font-mono text-magenta-200">
                                <Coins size={11} /> {r.price_coins}
                            </span>
                        </div>
                    </div>
                    <p className="mt-3 text-sm text-white/80">{r.description}</p>
                    {r.status === "pending" && (
                        <div className="mt-4 flex gap-2">
                            <button onClick={() => respond(r.request_id, "decline")} className="btn-ghost" data-testid={`req-decline-${r.request_id}`}>
                                <XCircle size={14} /> Refuser (rembourse fan)
                            </button>
                            <button onClick={() => respond(r.request_id, "accept")} className="btn-primary" data-testid={`req-accept-${r.request_id}`}>
                                <CheckCircle2 size={14} /> Accepter
                            </button>
                        </div>
                    )}
                    {r.status === "accepted" && (
                        <div className="mt-4">
                            <button onClick={() => setDeliverFor(r)} className="btn-primary" data-testid={`req-deliver-${r.request_id}`}>
                                <Send size={14} /> Livrer le contenu
                            </button>
                        </div>
                    )}
                    {r.status === "delivered" && r.delivery?.media_url && (
                        <div className="mt-3">
                            <img src={r.delivery.media_url} alt="" className="max-h-56 rounded-xl border border-white/10" />
                            {r.delivery.caption && <p className="mt-2 text-sm text-white/60">{r.delivery.caption}</p>}
                        </div>
                    )}
                </div>
            ))}
            {deliverFor && <DeliverModal request={deliverFor} onClose={(delivered) => { setDeliverFor(null); if (delivered) { load(); refreshWallet(); } }} />}
        </div>
    );
}

function DeliverModal({ request, onClose }) {
    const [mediaUrl, setMediaUrl] = useState("");
    const [caption, setCaption] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const submit = async (e) => {
        e.preventDefault();
        if (!mediaUrl) { setErr("Upload un média avant de livrer"); return; }
        setErr(""); setLoading(true);
        try {
            await api.post(`/custom-requests/${request.request_id}/deliver`, { media_url: mediaUrl, media_type: "image", caption });
            onClose(true);
        } catch (e) { setErr(formatApiError(e.response?.data?.detail)); setLoading(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur p-4">
            <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-magenta/30 bg-surface p-6" data-testid="deliver-modal">
                <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-bold">Livrer la commande</h3>
                    <button type="button" onClick={() => onClose(false)} className="rounded-full p-1 text-white/50"><X size={16} /></button>
                </div>
                <p className="mt-2 text-sm text-white/50">Tu recevras {Math.round(request.price_coins * 0.8)} coins (80 %) à la livraison.</p>
                <div className="mt-4 space-y-3">
                    <FileUploader value={mediaUrl} onChange={setMediaUrl} label="Upload le média" testId="deliver-uploader" />
                    {mediaUrl && <img src={mediaUrl} alt="" className="max-h-40 rounded-xl border border-white/10" />}
                    <textarea className="input-base min-h-[70px] resize-none" rows={3} placeholder="Mot à la commande (optionnel)"
                              value={caption} onChange={e => setCaption(e.target.value)} data-testid="deliver-caption" />
                    {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>}
                    <button type="submit" disabled={loading || !mediaUrl} className="btn-primary w-full justify-center" data-testid="deliver-submit">
                        <Send size={14} /> {loading ? "Livraison…" : "Livrer et encaisser"}
                    </button>
                </div>
            </form>
        </div>
    );
}

function FanRequests() {
    const [items, setItems] = useState(null);
    useEffect(() => {
        api.get("/custom-requests/me").then(r => setItems(r.data)).catch(() => setItems([]));
    }, []);
    if (!items) return <div className="mt-8 text-white/40">Chargement…</div>;
    if (items.length === 0) return (
        <div className="mt-8 surface-card p-10 text-center">
            <Gift size={24} className="mx-auto text-magenta-300" />
            <p className="mt-3 text-white/60">Tu n'as pas encore passé de commande personnalisée.</p>
            <p className="mt-1 text-xs text-white/40">Va sur un profil créatrice et clique sur « Commande perso ».</p>
        </div>
    );
    return (
        <div className="mt-8 space-y-3">
            {items.map(r => (
                <div key={r.request_id} className="surface-card" data-testid={`fan-req-${r.request_id}`}>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="font-semibold">{r.creator?.display_name || "Créatrice"}</div>
                            <div className="text-xs text-white/50">{new Date(r.created_at).toLocaleString("fr-FR")}</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <StatusBadge status={r.status} />
                            <span className="inline-flex items-center gap-1 rounded-full border border-magenta/30 bg-magenta/10 px-2.5 py-0.5 text-sm font-mono text-magenta-200">
                                <Coins size={11} /> {r.price_coins}
                            </span>
                        </div>
                    </div>
                    <p className="mt-3 text-sm text-white/80">{r.description}</p>
                    {r.status === "delivered" && r.delivery?.media_url && (
                        <div className="mt-3">
                            <img src={r.delivery.media_url} alt="" className="max-h-80 rounded-xl border border-white/10" />
                            {r.delivery.caption && <p className="mt-2 text-sm text-white/70">{r.delivery.caption}</p>}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
