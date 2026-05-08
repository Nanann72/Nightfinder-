import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Users, TrendingUp, Coins, Flag, ShieldCheck, UserCheck, Ban } from "lucide-react";

export default function AdminDashboard() {
    const [stats, setStats] = useState(null);

    useEffect(() => {
        api.get("/admin/stats").then(r => setStats(r.data)).catch(() => {});
    }, []);

    if (!stats) return <div className="text-white/40" data-testid="admin-dashboard-loading">Chargement des statistiques…</div>;

    const cards = [
        { label: "Utilisateurs", value: stats.users_count, sub: `+${stats.new_users_7d} cette semaine`, icon: Users, accent: true },
        { label: "Créatrices", value: stats.creators_count, icon: UserCheck },
        { label: "Fans", value: stats.fans_count, icon: Users },
        { label: "Abonnements actifs", value: stats.active_subscriptions, icon: TrendingUp },
        { label: "Contenus", value: stats.content_count, sub: `${stats.flagged_count} signalés`, icon: Flag, alert: stats.flagged_count > 0 },
        { label: "GMV (coins)", value: stats.gmv_coins.toLocaleString("fr-FR"), sub: `${stats.gmv_eur.toFixed(2)} €`, icon: Coins, accent: true },
        { label: "KYC en attente", value: stats.pending_kyc, icon: ShieldCheck, alert: stats.pending_kyc > 0 },
        { label: "Retraits en attente", value: stats.pending_payouts, icon: Coins, alert: stats.pending_payouts > 0 },
    ];

    return (
        <div data-testid="admin-dashboard">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map(c => {
                    const Icon = c.icon;
                    const border = c.alert ? "border-amber-500/40" : c.accent ? "border-magenta/30" : "border-white/5";
                    const iconColor = c.alert ? "text-amber-300" : c.accent ? "text-magenta-200" : "text-white/60";
                    return (
                        <div key={c.label} data-testid={`admin-stat-${c.label}`}
                             className={`surface-card relative overflow-hidden ${border}`}>
                            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] ${iconColor}`}>
                                <Icon size={18} />
                            </div>
                            <div className="mt-5 font-mono text-3xl font-bold">{c.value}</div>
                            <div className="mt-1 text-xs uppercase tracking-widest text-white/40">{c.label}</div>
                            {c.sub && <div className="mt-1 text-xs text-white/50">{c.sub}</div>}
                        </div>
                    );
                })}
            </div>
            {stats.banned_count > 0 && (
                <div className="mt-6 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    <Ban size={14} /> {stats.banned_count} compte(s) suspendu(s)
                </div>
            )}
        </div>
    );
}
