import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/auth";
import { Calendar, RefreshCw, XCircle, ShieldCheck, AlertTriangle } from "lucide-react";

export default function Subscriptions() {
    const { t, i18n } = useTranslation();
    const [subs, setSubs] = useState([]);
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(null);

    const load = async () => {
        try { const { data } = await api.get("/subscriptions"); setSubs(data); }
        catch (e) { setErr(formatApiError(e.response?.data?.detail)); }
    };
    useEffect(() => { load(); }, []);

    const toggleAutoRenew = async (cid) => {
        setBusy(cid);
        try { await api.post(`/subscriptions/${cid}/auto-renew`); await load(); }
        finally { setBusy(null); }
    };

    const cancel = async (cid) => {
        if (!window.confirm(t("subs.confirm_cancel")))
            return;
        setBusy(cid);
        try { await api.delete(`/subscriptions/${cid}`); await load(); }
        finally { setBusy(null); }
    };

    const formatDate = (iso) => new Date(iso).toLocaleDateString(i18n.language || "fr", { day: "2-digit", month: "long", year: "numeric" });
    const daysLeft = (iso) => Math.max(0, Math.round((new Date(iso) - Date.now()) / 86400000));

    const active = subs.filter(s => s.status === "active");
    const past = subs.filter(s => s.status !== "active");

    return (
        <div className="relative z-10 container-mx py-10" data-testid="subscriptions-page">
            <div className="overline">{t("subs.overline")}</div>
            <h1 className="mt-2 font-display text-4xl font-bold sm:text-5xl">{t("subs.title")}</h1>
            <p className="mt-2 text-white/60">{t("subs.manage")}</p>

            {err && <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{err}</div>}

            <h2 className="mt-10 font-display text-xl font-bold">{t("subs.active")} ({active.length})</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
                {active.map(s => (
                    <div key={s.creator_id} data-testid={`sub-${s.creator_id}`} className="surface-card">
                        <div className="flex gap-4">
                            <Link to={`/createur/${s.creator_id}`}>
                                <img src={s.creator?.avatar_url} alt="" className="h-16 w-16 rounded-xl border border-white/10 object-cover" />
                            </Link>
                            <div className="flex-1">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <Link to={`/createur/${s.creator_id}`} className="font-display text-lg font-semibold hover:text-magenta-200">
                                            {s.creator?.display_name}
                                        </Link>
                                        <div className="text-xs text-white/40">@{s.creator?.handle}</div>
                                    </div>
                                    <div className="flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs text-green-300">
                                        <ShieldCheck size={10} /> {t("subs.status.active")}
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center gap-3 text-xs text-white/50">
                                    <span className="flex items-center gap-1"><Calendar size={12} /> {t("subs.expires_in", { days: daysLeft(s.expires_at), date: formatDate(s.expires_at) })}</span>
                                </div>
                                <div className="mt-2 text-xs text-white/50 font-mono">
                                    {t("subs.price_per", { coins: s.price_coins })}
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3">
                            <div className="flex items-center gap-2">
                                <RefreshCw size={14} className={s.auto_renew ? "text-magenta-300" : "text-white/30"} />
                                <div className="text-sm">
                                    <div className="font-medium">{t("subs.auto_renew")}</div>
                                    <div className="text-xs text-white/40">{s.auto_renew ? t("subs.enabled") : t("subs.disabled")}</div>
                                </div>
                            </div>
                            <button
                                onClick={() => toggleAutoRenew(s.creator_id)}
                                disabled={busy === s.creator_id}
                                data-testid={`toggle-renew-${s.creator_id}`}
                                role="switch"
                                aria-checked={s.auto_renew}
                                className={`relative h-6 w-11 rounded-full transition-colors ${s.auto_renew ? "bg-magenta" : "bg-white/10"}`}
                            >
                                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${s.auto_renew ? "left-5" : "left-0.5"}`} />
                            </button>
                        </div>
                        {!s.auto_renew && (
                            <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-200">
                                <AlertTriangle size={12} /> {t("subs.expires_on", { date: formatDate(s.expires_at) })}
                            </div>
                        )}
                        <button
                            onClick={() => cancel(s.creator_id)}
                            disabled={busy === s.creator_id || !s.auto_renew}
                            data-testid={`cancel-sub-${s.creator_id}`}
                            className="mt-3 w-full rounded-full border border-red-500/20 bg-red-500/5 px-4 py-2 text-xs text-red-300 transition-colors hover:border-red-500/40 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <XCircle size={12} className="mr-1 inline" /> {t("subs.cancel")}
                        </button>
                    </div>
                ))}
                {active.length === 0 && (
                    <div className="surface-card col-span-full p-10 text-center text-white/40" data-testid="no-active-subs">
                        {t("subs.empty")}
                        <Link to="/createurs" className="ml-2 text-magenta-200 hover:text-white">{t("subs.explore")} →</Link>
                    </div>
                )}
            </div>

            {past.length > 0 && (
                <>
                    <h2 className="mt-12 font-display text-xl font-bold text-white/60">{t("subs.history")} ({past.length})</h2>
                    <div className="mt-4 overflow-hidden rounded-2xl border border-white/5 bg-surface">
                        <table className="w-full text-sm">
                            <thead className="border-b border-white/5 text-left text-[11px] uppercase tracking-widest text-white/40">
                                <tr><th className="px-4 py-2">{t("subs.col.creator")}</th><th className="px-4 py-2">{t("subs.col.started")}</th><th className="px-4 py-2">{t("subs.col.expired")}</th><th className="px-4 py-2">{t("subs.col.status")}</th></tr>
                            </thead>
                            <tbody>
                                {past.map(s => (
                                    <tr key={s.creator_id + s.started_at} className="border-b border-white/5 last:border-0">
                                        <td className="px-4 py-3">
                                            <Link to={`/createur/${s.creator_id}`} className="hover:text-magenta-200">{s.creator?.display_name}</Link>
                                        </td>
                                        <td className="px-4 py-3 text-white/50">{formatDate(s.started_at)}</td>
                                        <td className="px-4 py-3 text-white/50">{s.expired_at ? formatDate(s.expired_at) : formatDate(s.expires_at)}</td>
                                        <td className="px-4 py-3">
                                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/60">{s.status}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
