import { Plus, Trash2, Coins } from "lucide-react";

const SUGGESTED_EMOJIS = ["✨", "💋", "💃", "🌹", "💌", "📸", "🎁", "💎", "🔥", "🥂", "🎵", "🌙"];

/**
 * Inline editor for the live tip-menu (Stripchat-style quick-tip panel).
 * - Up to 12 entries
 * - Each entry: emoji + label + coins
 *
 * Props:
 *  - items: Array<{ label, emoji, coins }>
 *  - onChange(next: Array): callback
 *  - max: number (default 12)
 */
export default function TipMenuEditor({ items = [], onChange, max = 12 }) {
    const update = (idx, key, value) => {
        const next = items.map((it, i) => i === idx ? { ...it, [key]: value } : it);
        onChange(next);
    };
    const remove = (idx) => onChange(items.filter((_, i) => i !== idx));
    const add = () => {
        if (items.length >= max) return;
        onChange([...items, { label: "", emoji: SUGGESTED_EMOJIS[items.length % SUGGESTED_EMOJIS.length], coins: 25 }]);
    };

    return (
        <div className="space-y-2" data-testid="tip-menu-editor">
            {items.length === 0 && (
                <p className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-white/50">
                    Aucune récompense pour l'instant. Ajoute des items pour proposer aux fans des tips rapides à 1 clic.
                </p>
            )}
            {items.map((it, i) => (
                <div key={i} className="flex items-stretch gap-1.5" data-testid={`tip-menu-row-${i}`}>
                    <input
                        type="text"
                        value={it.emoji || ""}
                        onChange={(e) => update(i, "emoji", e.target.value.slice(0, 4))}
                        className="w-12 rounded-xl border border-white/10 bg-obsidian px-2 py-2 text-center text-lg outline-none focus:border-magenta"
                        placeholder="✨"
                        maxLength={4}
                        data-testid={`tip-menu-emoji-${i}`}
                    />
                    <input
                        type="text"
                        value={it.label || ""}
                        onChange={(e) => update(i, "label", e.target.value.slice(0, 60))}
                        className="input-base flex-1 text-sm"
                        placeholder="Bisou, dance, set photo, …"
                        maxLength={60}
                        data-testid={`tip-menu-label-${i}`}
                    />
                    <div className="relative w-24">
                        <input
                            type="number"
                            min={1}
                            max={10000}
                            value={it.coins}
                            onChange={(e) => update(i, "coins", Number(e.target.value))}
                            className="input-base !pl-7 font-mono text-sm"
                            data-testid={`tip-menu-coins-${i}`}
                        />
                        <Coins size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-magenta-200" />
                    </div>
                    <button type="button" onClick={() => remove(i)}
                            className="rounded-xl border border-red-500/20 bg-red-500/10 px-2 text-red-300 hover:bg-red-500/20"
                            aria-label="Supprimer"
                            data-testid={`tip-menu-remove-${i}`}>
                        <Trash2 size={14} />
                    </button>
                </div>
            ))}
            {items.length < max && (
                <button type="button" onClick={add}
                        className="inline-flex items-center gap-1.5 rounded-full border border-magenta/30 bg-magenta/10 px-3 py-1.5 text-xs text-magenta-200 hover:bg-magenta/20"
                        data-testid="tip-menu-add">
                    <Plus size={12} /> Ajouter une récompense
                </button>
            )}
            {items.length >= max && (
                <p className="text-[11px] text-amber-200/70">Limite atteinte ({max} entrées max).</p>
            )}
        </div>
    );
}
