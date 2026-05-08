import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, TrendingUp, Sparkles, ArrowRight, Flame } from "lucide-react";
import { api } from "@/lib/api";
import { avatarUrl, onAvatarError } from "@/lib/avatars";

/**
 * Right sidebar — Fanvue/Twitter style.
 * Sticky on desktop only (>= 1280px). Hidden on smaller screens.
 */
export default function SuggestedSidebar() {
    const [query, setQuery] = useState("");
    const [creators, setCreators] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/creators?sort=trending&limit=5");
                setCreators(Array.isArray(data) ? data.slice(0, 5) : (data?.items || []).slice(0, 5));
            } catch { /* swallow */ }
            finally { setLoading(false); }
        })();
    }, []);

    const trending = [
        { tag: "fitness", count: "1.2k posts" },
        { tag: "art", count: "890 posts" },
        { tag: "music", count: "640 posts" },
        { tag: "fashion", count: "520 posts" },
        { tag: "lifestyle", count: "410 posts" },
    ];

    return (
        <aside data-testid="suggested-sidebar" className="hidden xl:block xl:w-[320px] shrink-0">
            <div className="sticky top-4 space-y-4 py-4 pr-2">
                {/* Search */}
                <form
                    onSubmit={(e) => { e.preventDefault(); window.location.href = `/createurs?search=${encodeURIComponent(query)}`; }}
                    className="relative"
                >
                    <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Rechercher des créatrices…"
                        data-testid="suggested-search"
                        className="w-full rounded-full border border-white/[0.08] bg-white/[0.03] py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/35 focus:border-magenta/50 focus:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-magenta/20"
                    />
                </form>

                {/* Suggested creators */}
                <section className="rounded-3xl border border-white/[0.06] bg-[var(--bg-surface)] p-4">
                    <div className="flex items-center justify-between">
                        <div className="overline flex items-center gap-1.5">
                            <Sparkles size={11} className="text-magenta-200" /> Suggéré·e·s pour toi
                        </div>
                        <Link to="/createurs" className="text-[11px] text-magenta-200 hover:text-white transition-colors">
                            Voir tout
                        </Link>
                    </div>
                    <div className="mt-3 space-y-1">
                        {loading ? (
                            <div className="space-y-2 py-2">
                                {[0, 1, 2].map(i => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-2xl bg-white/[0.04]" />
                                        <div className="flex-1 space-y-1.5">
                                            <div className="h-2.5 w-24 rounded bg-white/[0.05]" />
                                            <div className="h-2 w-16 rounded bg-white/[0.03]" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : creators.length === 0 ? (
                            <div className="py-3 text-xs text-white/40">Aucune suggestion pour le moment.</div>
                        ) : (
                            creators.map((c) => (
                                <Link
                                    key={c.id || c.user_id || c.handle}
                                    to={`/createur/${c.id || c.user_id || c.handle}`}
                                    data-testid={`suggested-creator-${c.handle || c.username}`}
                                    className="flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-white/[0.04]"
                                >
                                    <img
                                        src={avatarUrl(c)}
                                        alt={c.display_name || c.handle || "?"}
                                        onError={onAvatarError}
                                        className="h-10 w-10 rounded-2xl border border-white/10 object-cover"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="truncate text-sm font-semibold text-white">
                                            {c.display_name || c.name || c.handle}
                                        </div>
                                        <div className="truncate text-[11px] text-white/45">@{c.handle || c.username || "—"}</div>
                                    </div>
                                    <ArrowRight size={14} className="shrink-0 text-white/30" />
                                </Link>
                            ))
                        )}
                    </div>
                </section>

                {/* Trending tags */}
                <section className="rounded-3xl border border-white/[0.06] bg-[var(--bg-surface)] p-4">
                    <div className="overline flex items-center gap-1.5">
                        <TrendingUp size={11} className="text-magenta-200" /> Tendances
                    </div>
                    <div className="mt-3 space-y-1">
                        {trending.map((t, i) => (
                            <Link
                                key={t.tag}
                                to={`/createurs?tag=${encodeURIComponent(t.tag)}`}
                                data-testid={`trending-${t.tag}`}
                                className="flex items-center justify-between rounded-2xl px-2 py-1.5 transition-colors hover:bg-white/[0.04]"
                            >
                                <div>
                                    <div className="text-[11px] text-white/45">#{i + 1} · Tendance</div>
                                    <div className="text-sm font-semibold text-white">#{t.tag}</div>
                                </div>
                                <span className="text-[11px] text-white/40">{t.count}</span>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* Quick CTA */}
                <Link
                    to="/devenir-createur"
                    data-testid="suggested-become-creator"
                    className="block rounded-3xl border border-magenta/30 bg-gradient-to-br from-magenta/15 via-magenta/5 to-transparent p-5 transition-all hover:border-magenta/60"
                >
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-magenta-200">
                        <Flame size={11} /> Pour les créateur·rice·s
                    </div>
                    <div className="mt-2 font-display text-base font-bold text-white">
                        Rejoins la communauté
                    </div>
                    <p className="mt-1 text-xs text-white/55">
                        Commission 80/20, paiements SEPA, audience engagée.
                    </p>
                    <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-magenta-200">
                        Devenir créatrice·eur <ArrowRight size={12} />
                    </div>
                </Link>

                {/* Footer-ish links */}
                <div className="px-2 text-[10px] text-white/30 leading-relaxed">
                    <Link to="/legal/terms" className="hover:text-white/60">Conditions</Link> ·{" "}
                    <Link to="/legal/privacy" className="hover:text-white/60">Confidentialité</Link> ·{" "}
                    <Link to="/legal/acceptable-use" className="hover:text-white/60">Politique d'usage</Link> ·{" "}
                    <Link to="/dmca" className="hover:text-white/60">DMCA</Link>
                    <div className="mt-1">© {new Date().getFullYear()} me&you.fans</div>
                </div>
            </div>
        </aside>
    );
}
