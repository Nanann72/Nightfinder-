import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Trophy, Coins, Crown } from "lucide-react";

export default function Leaderboard() {
    const [data, setData] = useState(null);
    const [days, setDays] = useState(7);

    useEffect(() => {
        api.get(`/leaderboard/creators?days=${days}&limit=10`)
            .then(r => setData(r.data))
            .catch(() => setData({ top: [] }));
    }, [days]);

    return (
        <div className="container-mx py-10 sm:py-16" data-testid="leaderboard-page">
            <div className="overline flex items-center gap-2"><Trophy size={12} className="text-amber-400" /> Classement</div>
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
                Top créatrices <span className="gradient-text">· {days} derniers jours</span>
            </h1>

            <div className="mt-5 flex gap-2">
                {[7, 30].map(d => (
                    <button key={d} onClick={() => setDays(d)}
                            data-testid={`leaderboard-filter-${d}`}
                            className={`rounded-full border px-4 py-1.5 text-xs transition-colors ${
                                days === d ? "border-magenta bg-magenta/15 text-white" : "border-white/10 text-white/60 hover:text-white"
                            }`}>
                        {d === 7 ? "7 jours" : "30 jours"}
                    </button>
                ))}
            </div>

            {!data && <div className="mt-8 text-white/40">Chargement…</div>}
            {data && data.top.length === 0 && (
                <div className="mt-8 surface-card p-8 text-center text-white/50">Aucune activité sur cette période.</div>
            )}

            {data && data.top.length > 0 && (
                <div className="mt-8 space-y-3" data-testid="leaderboard-list">
                    {data.top.map(c => (
                        <Link to={`/createur/${c.creator_id}`} key={c.creator_id}
                              data-testid={`lb-rank-${c.rank}`}
                              className={`flex items-center gap-4 rounded-2xl border p-4 transition-all hover:border-magenta/40 ${
                                  c.rank === 1 ? "border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-transparent"
                                      : c.rank === 2 ? "border-slate-400/30 bg-slate-400/5"
                                      : c.rank === 3 ? "border-orange-600/30 bg-orange-600/5"
                                      : "border-white/10 bg-white/[0.02]"
                              }`}>
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold ${
                                c.rank <= 3 ? "bg-amber-400 text-obsidian" : "bg-white/10 text-white/70"
                            }`}>
                                {c.rank === 1 ? <Crown size={16} /> : c.rank}
                            </div>
                            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10">
                                {c.avatar_url && <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="font-display text-lg font-semibold">{c.display_name}</div>
                                <div className="text-sm text-white/50">@{c.handle}</div>
                            </div>
                            <div className="text-right">
                                <div className="flex items-center gap-1 font-mono text-lg font-bold text-magenta-200">
                                    <Coins size={14} /> {c.total_coins.toLocaleString()}
                                </div>
                                <div className="text-[10px] uppercase tracking-widest text-white/40">reçus</div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
