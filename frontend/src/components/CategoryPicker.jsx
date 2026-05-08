import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import { Check, Search } from "lucide-react";

/**
 * Multi-select category picker fed by /api/categories (SFW catalog).
 * Selection limit defaults to 6 (matches backend `tags` slicing).
 *
 * Props:
 *  - selected: string[] (array of category labels currently selected)
 *  - onChange(newSelected: string[]): callback
 *  - max: number (default 6)
 *  - testIdPrefix: string (default "category-picker")
 */
export default function CategoryPicker({ selected = [], onChange, max = 6, testIdPrefix = "category-picker" }) {
    const [catalog, setCatalog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        let cancelled = false;
        api.get("/categories")
            .then(r => { if (!cancelled) setCatalog(r.data?.categories || []); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const grouped = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = q
            ? catalog.filter(c => c.label.toLowerCase().includes(q))
            : catalog;
        const map = {};
        for (const c of filtered) {
            const g = c.group || "other";
            if (!map[g]) map[g] = [];
            map[g].push(c);
        }
        return map;
    }, [catalog, search]);

    const toggle = (label) => {
        if (selected.includes(label)) {
            onChange(selected.filter(s => s !== label));
        } else {
            if (selected.length >= max) return; // hit cap
            onChange([...selected, label]);
        }
    };

    const groupTitles = {
        mode_beaute: "Mode & Beauté",
        sport: "Sport & Fitness",
        art: "Art & Culture",
        wellness: "Lifestyle & Bien-être",
        glamour: "Glamour & Premium",
        life: "Vie & Authenticité",
        other: "Autre",
    };

    return (
        <div className="space-y-3" data-testid={`${testIdPrefix}-root`}>
            <div className="flex items-center justify-between text-xs text-white/50">
                <span>Sélectionne jusqu'à <strong className="text-white/80">{max}</strong> catégories qui te représentent</span>
                <span data-testid={`${testIdPrefix}-counter`} className={selected.length >= max ? "text-amber-300" : ""}>
                    {selected.length}/{max}
                </span>
            </div>

            <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Rechercher une catégorie…"
                    className="input-base !pl-9"
                    data-testid={`${testIdPrefix}-search`}
                />
            </div>

            {loading ? (
                <div className="text-xs text-white/40" data-testid={`${testIdPrefix}-loading`}>Chargement…</div>
            ) : (
                <div className="max-h-[280px] space-y-4 overflow-y-auto rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    {Object.keys(grouped).length === 0 && (
                        <div className="text-xs text-white/40">Aucun résultat</div>
                    )}
                    {Object.entries(grouped).map(([group, items]) => (
                        <div key={group}>
                            <div className="overline mb-2">{groupTitles[group] || group}</div>
                            <div className="flex flex-wrap gap-2">
                                {items.map(c => {
                                    const isSel = selected.includes(c.label);
                                    const disabled = !isSel && selected.length >= max;
                                    return (
                                        <button
                                            key={c.slug}
                                            type="button"
                                            onClick={() => toggle(c.label)}
                                            disabled={disabled}
                                            data-testid={`${testIdPrefix}-chip-${c.slug}`}
                                            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all ${
                                                isSel
                                                    ? "border-magenta bg-magenta/20 text-white"
                                                    : disabled
                                                        ? "border-white/5 bg-white/[0.02] text-white/30 cursor-not-allowed"
                                                        : "border-white/10 bg-white/[0.02] text-white/70 hover:border-magenta/40 hover:bg-magenta/5 hover:text-white"
                                            }`}
                                        >
                                            <span aria-hidden="true">{c.emoji}</span>
                                            <span>{c.label}</span>
                                            {isSel && <Check size={12} className="text-magenta-200" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
