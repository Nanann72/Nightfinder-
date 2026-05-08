import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/auth";
import {
    BarChart3, ChevronLeft, TrendingUp, Users, Heart, Coins, Flame, Gift,
} from "lucide-react";

const REASON_LABELS = {
    tip_earn: "Pourboires",
    unlock_earn: "Ventes à l'unité",
    subscription_earn: "Abonnements",
    live_ppv_earn: "Lives payants",
    custom_request_earn: "Demandes privées",
};
const REASON_COLORS = {
    tip_earn: "bg-amber-400",
    unlock_earn: "bg-fuchsia-400",
    subscription_earn: "bg-magenta-400",
    live_ppv_earn: "bg-red-400",
    custom_request_earn: "bg-sky-400",
};

export default function CreatorAnalytics() {
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true); setErr("");
        api.get(`/creators/me/analytics?days=${days}`)
            .then(r => setData(r.data))
            .catch(e => setErr(formatApiError(e.response?.data?.detail) || e.message))
            .finally(() => setLoading(false));
    }, [days]);

    if (loading) return <div className="container-mx py-16 text-center text-white/40" data-testid="analytics-loading">Chargement des statistiques…</div>;
    if (err) return <div className="container-mx py-16 text-center"><div className="surface-card text-red-300">{err}</div></div>;
    if (!data) return null;

    const maxCoins = Math.max(1, ...data.earnings_timeline.map(p => p.coins));
    const maxSubs = Math.max(1, ...data.subscribers_timeline.map(p => p.new_subscribers));

    const totals = data.totals_coins;
    const totalsEur = data.totals_eur;

    const kpis = [
        { label: "Total gains", value: `${totals.all} coins`, sub: `≈ ${totalsEur.all.toFixed(2)} €`, icon: Coins, accent: true },
        { label: "Abonnés actifs", value: data.active_subscribers, icon: Users },
        { label: "Total likes", value: data.total_likes, icon: Heart },
        { label: "Revenus / jour", value: `${Math.round(totals.all / Math.max(1, data.days))}`, sub: "coins moyens", icon: TrendingUp },
    ];

    return (
        <div className="container-mx py-8 relative z-10">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <Link to="/dashboard" className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white"><ChevronLeft size={14} /> Dashboard</Link>
                    <div className="overline mt-2 flex items-center gap-2"><BarChart3 size={12} /> Analytics</div>
                    <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">Tes statistiques</h1>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1" data-testid="analytics-period">
                    {[7, 30, 90].map(d => (
                        <button key={d}
                            onClick={() => setDays(d)}
                            data-testid={`analytics-period-${d}`}
                            className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${days === d ? "bg-magenta/30 text-white" : "text-white/60 hover:text-white"}`}>
                            {d} jours
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI cards */}
            <div className="mt-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
                {kpis.map((k) => {
                    const Icon = k.icon;
                    return (
                        <div key={k.label} data-testid={`analytics-kpi-${k.label}`}
                             className={`surface-card ${k.accent ? "border-magenta/30" : ""}`}>
                            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${k.accent ? "border-magenta/40 bg-magenta/10 text-magenta-200" : "border-white/10 bg-white/[0.03] text-white/60"}`}>
                                <Icon size={18} />
                            </div>
                            <div className="mt-5 font-mono text-2xl font-bold sm:text-3xl break-all">{k.value}</div>
                            <div className="mt-1 text-[10px] uppercase tracking-widest text-white/40 sm:text-xs">{k.label}</div>
                            {k.sub && <div className="mt-1 text-[11px] text-white/50 sm:text-xs">{k.sub}</div>}
                        </div>
                    );
                })}
            </div>

            {/* Earnings chart */}
            <div className="mt-8 surface-card" data-testid="analytics-earnings-chart">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="overline flex items-center gap-2"><Flame size={12} /> Gains sur {days} jours</div>
                        <div className="mt-1 font-display text-xl font-bold">
                            {totals.all} coins · <span className="text-magenta-200">{totalsEur.all.toFixed(2)} €</span>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-[11px] text-white/60">
                        {Object.keys(REASON_LABELS).map(k => (
                            <span key={k} className="inline-flex items-center gap-1">
                                <span className={`h-2 w-2 rounded-full ${REASON_COLORS[k]}`} />
                                {REASON_LABELS[k]}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="mt-5 flex h-48 items-end gap-[2px] overflow-x-auto pb-2">
                    {data.earnings_timeline.map(p => {
                        const h = Math.max(3, Math.round((p.coins / maxCoins) * 170));
                        return (
                            <div key={p.day}
                                 className="group relative flex flex-col justify-end"
                                 style={{ width: `${Math.max(4, 100 / data.earnings_timeline.length)}%`, minWidth: 6, height: "100%" }}>
                                <div className="flex flex-col-reverse" style={{ height: h }}>
                                    {Object.keys(REASON_LABELS).map(k => {
                                        const v = p[k] || 0;
                                        if (!v) return null;
                                        const segH = Math.round((v / Math.max(1, p.coins)) * h);
                                        return <div key={k} className={`${REASON_COLORS[k]} opacity-90 first:rounded-t-sm`} style={{ height: segH }} />;
                                    })}
                                </div>
                                <div className="pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 rounded-md border border-white/10 bg-black/90 px-2 py-1 text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                    <div className="font-semibold">{p.day}</div>
                                    <div className="text-magenta-200">{p.coins} coins</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Subscribers chart */}
            <div className="mt-6 surface-card" data-testid="analytics-subs-chart">
                <div className="overline flex items-center gap-2"><Users size={12} /> Nouveaux abonnés / jour</div>
                <div className="mt-4 flex h-32 items-end gap-[2px]">
                    {data.subscribers_timeline.map(p => {
                        const h = Math.max(2, Math.round((p.new_subscribers / maxSubs) * 110));
                        return (
                            <div key={p.day} className="group relative flex-1 min-w-[4px]">
                                <div className="rounded-t-sm bg-gradient-to-t from-magenta-700 to-magenta-400" style={{ height: h }} />
                                <div className="pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 rounded-md border border-white/10 bg-black/90 px-2 py-1 text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 z-10">
                                    <div className="font-semibold">{p.day}</div>
                                    <div className="text-magenta-200">+{p.new_subscribers}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Top posts */}
            <div className="mt-6 surface-card" data-testid="analytics-top-posts">
                <div className="overline flex items-center gap-2"><Gift size={12} /> Top 5 posts par likes</div>
                {data.top_posts.length === 0 ? (
                    <div className="mt-4 text-sm text-white/40">Pas encore de données — publie tes premiers contenus.</div>
                ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        {data.top_posts.map(p => (
                            <div key={p.content_id} data-testid={`top-post-${p.content_id}`}
                                 className="group relative aspect-[4/5] overflow-hidden rounded-xl border border-white/10 bg-black/40">
                                <img src={p.media_url} alt={p.title}
                                     className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                                <div className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/80 to-transparent p-2">
                                    <div className="truncate text-xs font-semibold">{p.title}</div>
                                    <div className="flex items-center justify-between text-[10px] text-white/70">
                                        <span className="inline-flex items-center gap-1"><Heart size={10} fill="currentColor" /> {p.likes_count}</span>
                                        <span className="inline-flex items-center gap-1"><Coins size={10} /> {p.unlocks_count} unlocks</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
