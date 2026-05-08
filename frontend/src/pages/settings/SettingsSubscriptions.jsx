import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/auth";
import { Heart, ArrowRight, Calendar, RefreshCw } from "lucide-react";

export default function SettingsSubscriptions() {
    const [subs, setSubs] = useState([]);
    const [err, setErr] = useState("");

    useEffect(() => {
        (async () => {
            try { const { data } = await api.get("/subscriptions"); setSubs(data); }
            catch (e) { setErr(formatApiError(e.response?.data?.detail)); }
        })();
    }, []);

    const active = subs.filter(s => s.status === "active");

    return (
        <div className="space-y-6" data-testid="settings-subscriptions">
            <header>
                <h2 className="font-display text-2xl font-bold">Mes abonnements</h2>
                <p className="mt-1 text-sm text-white/55">{active.length} abonnement{active.length > 1 ? "s" : ""} actif{active.length > 1 ? "s" : ""}.</p>
            </header>

            {err && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{err}</div>}

            {active.length === 0 ? (
                <div className="surface-card text-center py-12">
                    <Heart size={32} className="mx-auto text-white/20" />
                    <div className="mt-4 font-semibold">Aucun abonnement actif</div>
                    <p className="mt-1 text-sm text-white/50">Découvre des créatrices qui te ressemblent.</p>
                    <Link to="/createurs" className="btn-primary mt-5 inline-flex">
                        Explorer les créatrices <ArrowRight size={14} />
                    </Link>
                </div>
            ) : (
                <>
                    <div className="grid gap-3 md:grid-cols-2">
                        {active.slice(0, 6).map(s => (
                            <div key={s.creator_id} data-testid={`settings-sub-${s.creator_id}`} className="surface-card !p-4">
                                <div className="flex items-center gap-3">
                                    <Link to={`/createur/${s.creator_id}`} className="shrink-0">
                                        <img src={s.creator?.avatar_url} alt="" className="h-12 w-12 rounded-2xl border border-white/10 object-cover" />
                                    </Link>
                                    <div className="flex-1 min-w-0">
                                        <Link to={`/createur/${s.creator_id}`} className="block truncate font-display text-sm font-semibold hover:text-magenta-200">
                                            {s.creator?.display_name}
                                        </Link>
                                        <div className="truncate text-xs text-white/40">@{s.creator?.handle}</div>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center justify-between text-[11px]">
                                    <span className="flex items-center gap-1 text-white/50">
                                        <Calendar size={10} /> Expire {new Date(s.expires_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                                    </span>
                                    <span className={`flex items-center gap-1 ${s.auto_renew ? "text-magenta-300" : "text-amber-300"}`}>
                                        <RefreshCw size={10} /> {s.auto_renew ? "Auto-renouvellement" : "Pas de renouvellement"}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="text-center">
                        <Link to="/subscriptions" data-testid="settings-subs-manage-all"
                              className="btn-ghost inline-flex">
                            Gérer tous mes abonnements <ArrowRight size={14} />
                        </Link>
                    </div>
                </>
            )}
        </div>
    );
}
