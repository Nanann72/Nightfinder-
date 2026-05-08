import { useEffect, useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import CreatorCard from "@/components/CreatorCard";
import { Search, Flame, Star, Trophy, X } from "lucide-react";

export default function CreatorsList() {
    const { t } = useTranslation();
    const [creators, setCreators] = useState([]);
    const [q, setQ] = useState("");
    const [filter, setFilter] = useState("trending");
    const [searchParams, setSearchParams] = useSearchParams();
    const activeCategory = searchParams.get("category") || "";  // exact label, e.g. "Mode"
    const activeGroup = searchParams.get("group") || "";        // group key, e.g. "sport"
    const [catalog, setCatalog] = useState([]);

    useEffect(() => {
        api.get("/creators", { params: { limit: 40, trending: filter === "trending" } })
            .then(r => setCreators(r.data))
            .catch(() => {});
    }, [filter]);

    useEffect(() => {
        api.get("/categories")
            .then(r => setCatalog(r.data?.categories || []))
            .catch(() => {});
    }, []);

    const groupLabels = useMemo(() => {
        // Map group key → all labels in that group, for filtering
        const m = {};
        for (const c of catalog) {
            (m[c.group] = m[c.group] || []).push(c.label);
        }
        return m;
    }, [catalog]);

    const filtered = useMemo(() => {
        return creators.filter(c => {
            const matchesQ = !q ||
                c.display_name.toLowerCase().includes(q.toLowerCase()) ||
                c.handle.toLowerCase().includes(q.toLowerCase());
            const tags = c.tags || [];
            const matchesCategory = !activeCategory || tags.includes(activeCategory);
            const matchesGroup = !activeGroup ||
                (groupLabels[activeGroup] || []).some(label => tags.includes(label));
            return matchesQ && matchesCategory && matchesGroup;
        });
    }, [creators, q, activeCategory, activeGroup, groupLabels]);

    const clearCategory = () => {
        const next = new URLSearchParams(searchParams);
        next.delete("category");
        next.delete("group");
        setSearchParams(next, { replace: true });
    };

    const activeChipLabel = activeCategory || (activeGroup
        ? ({ mode_beaute: "Mode & Beauté", sport: "Sport & Fitness", art: "Art & Culture",
             wellness: "Lifestyle & Bien-être", glamour: "Glamour & Premium", life: "Vie & Authenticité" }[activeGroup] || activeGroup)
        : "");

    return (
        <div className="relative z-10 container-mx py-12">
            <div className="mb-10 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <div className="overline">{t("creators.explore")}</div>
                    <h1 className="mt-2 font-display text-4xl font-bold sm:text-5xl">{t("creators.title")}</h1>
                    <p className="mt-2 max-w-xl text-white/60">{t("creators.subtitle")}</p>
                </div>
                <Link to="/leaderboard" data-testid="creators-leaderboard-link"
                      className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/20">
                    <Trophy size={14} /> {t("nav.leaderboard")}
                </Link>
            </div>

            {activeChipLabel && (
                <div className="mb-6 flex items-center gap-3" data-testid="active-category-banner">
                    <span className="text-xs uppercase tracking-widest text-white/40">Filtré par</span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-magenta/40 bg-magenta/15 px-3 py-1 text-sm text-white">
                        {activeChipLabel}
                        <button onClick={clearCategory} data-testid="clear-category-btn" className="rounded-full p-0.5 hover:bg-white/10" aria-label="Retirer le filtre">
                            <X size={12} />
                        </button>
                    </span>
                </div>
            )}

            <div className="mb-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={16} />
                    <input
                        data-testid="creators-search"
                        placeholder={t("creators.search.placeholder")}
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        className="input-base pl-10"
                    />
                </div>
                <div className="flex gap-2">
                    <button data-testid="filter-trending"
                        onClick={() => setFilter("trending")}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm ${filter === "trending" ? "border-magenta bg-magenta/20 text-white" : "border-white/10 text-white/60 hover:text-white"}`}>
                        <Flame size={14} /> {t("creators.filter.trending")}
                    </button>
                    <button data-testid="filter-new"
                        onClick={() => setFilter("new")}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm ${filter === "new" ? "border-magenta bg-magenta/20 text-white" : "border-white/10 text-white/60 hover:text-white"}`}>
                        <Star size={14} /> {t("creators.filter.new")}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((c, i) => <CreatorCard key={c.creator_id} creator={c} testIdSuffix={`-list-${i}`} />)}
            </div>
            {filtered.length === 0 && (
                <div className="py-24 text-center text-white/40" data-testid="creators-empty">
                    {activeChipLabel ? `Aucune créatrice dans la catégorie "${activeChipLabel}" pour le moment.` : t("creators.empty")}
                </div>
            )}
        </div>
    );
}
