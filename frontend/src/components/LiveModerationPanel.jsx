import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/auth";
import {
    Shield, ShieldOff, UserPlus, X, Ban, Search, Loader2, Check,
    Eye, EyeOff,
} from "lucide-react";

const PERMS = [
    { key: "can_kick",         label: "Kicker",            help: "Sortir un viewer du live" },
    { key: "can_ban",          label: "Bannir",            help: "Sortir + bloquer le retour" },
    { key: "can_delete_msg",   label: "Supprimer message", help: "Retirer un message du chat" },
    { key: "can_mute",         label: "Mute",              help: "Bloquer un viewer du chat" },
    { key: "can_pin",          label: "Épingler",          help: "Épingler un message en haut" },
    { key: "can_view_revenue", label: "Voir revenus",      help: "Voir les coins gagnés en live" },
];

/**
 * Embedded inside the live "Réglages" panel for the host. Two side-by-side
 * sections:
 *   1. **Modérateurs** — search by @handle / name, optional "abonnés
 *      uniquement" toggle, list of current moderators with toggle-able perms.
 *   2. **Bannis** — list of users banned for this session, one-click un-ban.
 */
export default function LiveModerationPanel({ sessionId }) {
    const [tab, setTab] = useState("moderators");
    return (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 sm:col-span-2" data-testid="live-moderation-panel">
            <div className="mb-3 flex gap-1 rounded-full border border-white/10 bg-black/30 p-1">
                <TabBtn active={tab === "moderators"} onClick={() => setTab("moderators")}
                        icon={Shield} label="Modérateurs" testId="moderation-tab-mods" />
                <TabBtn active={tab === "banned"} onClick={() => setTab("banned")}
                        icon={Ban} label="Bannis" testId="moderation-tab-banned" />
            </div>
            {tab === "moderators" ? <ModeratorsTab sessionId={sessionId} /> : <BannedTab sessionId={sessionId} />}
        </div>
    );
}

function TabBtn({ active, onClick, icon: Icon, label, testId }) {
    return (
        <button
            type="button"
            onClick={onClick}
            data-testid={testId}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                active ? "bg-magenta/25 text-magenta-100" : "text-white/60 hover:text-white"
            }`}
        >
            <Icon size={12} /> {label}
        </button>
    );
}

// ===========================================================================
//  MODERATORS
// ===========================================================================
function ModeratorsTab({ sessionId }) {
    const [mods, setMods] = useState([]);
    const [query, setQuery] = useState("");
    const [scope, setScope] = useState("all"); // "all" | "subscribers"
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [err, setErr] = useState("");
    const debounceRef = useRef(null);

    const load = async () => {
        try {
            const { data } = await api.get(`/live/${sessionId}/moderators`);
            setMods(Array.isArray(data) ? data : []);
        } catch { /* noop */ }
    };

    useEffect(() => { load(); /* eslint-disable-line */ }, [sessionId]);

    // Debounced live search
    useEffect(() => {
        clearTimeout(debounceRef.current);
        const q = query.trim();
        if (q.length < 2) { setResults([]); return; }
        debounceRef.current = setTimeout(async () => {
            setSearching(true);
            try {
                const { data } = await api.get("/users/lookup", { params: { q, scope } });
                setResults(Array.isArray(data) ? data : []);
            } finally { setSearching(false); }
        }, 250);
        return () => clearTimeout(debounceRef.current);
    }, [query, scope]);

    const addMod = async (u) => {
        setBusyId(u.user_id); setErr("");
        try {
            await api.post(`/live/${sessionId}/moderators`, {
                user_id: u.user_id,
                can_kick: true, can_ban: true, can_delete_msg: true, can_mute: true,
                can_pin: false, can_view_revenue: false,
            });
            setQuery("");
            setResults([]);
            await load();
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setBusyId(null); }
    };

    const togglePerm = async (mod, key) => {
        setBusyId(mod.user_id); setErr("");
        try {
            await api.post(`/live/${sessionId}/moderators`, {
                user_id: mod.user_id,
                can_kick: mod.can_kick, can_ban: mod.can_ban,
                can_delete_msg: mod.can_delete_msg, can_mute: mod.can_mute,
                can_pin: mod.can_pin, can_view_revenue: mod.can_view_revenue,
                [key]: !mod[key],
            });
            await load();
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setBusyId(null); }
    };

    const removeMod = async (mod) => {
        if (!window.confirm(`Retirer ${mod.name} de la modération ?`)) return;
        setBusyId(mod.user_id); setErr("");
        try {
            await api.delete(`/live/${sessionId}/moderators/${mod.user_id}`);
            await load();
        } finally { setBusyId(null); }
    };

    return (
        <div data-testid="moderators-tab">
            {/* Search */}
            <div className="rounded-lg border border-white/10 bg-black/30 p-2.5">
                <div className="flex items-center gap-2">
                    <div className="flex flex-1 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
                        <Search size={12} className="text-white/50" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Recherche par @handle, nom ou email…"
                            data-testid="mod-search-input"
                            className="w-full bg-transparent text-xs text-white placeholder:text-white/30 focus:outline-none"
                        />
                        {searching && <Loader2 size={12} className="animate-spin text-magenta-200" />}
                    </div>
                    <button
                        type="button"
                        onClick={() => setScope((s) => s === "all" ? "subscribers" : "all")}
                        data-testid="mod-search-scope"
                        title={scope === "all" ? "Restreindre aux abonnés" : "Tous les utilisateurs"}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                            scope === "subscribers"
                                ? "border border-amber-300/50 bg-amber-300/15 text-amber-200"
                                : "border border-white/10 bg-white/[0.03] text-white/60"
                        }`}
                    >
                        {scope === "subscribers" ? <Eye size={10} /> : <EyeOff size={10} />}
                        Abos uniquement
                    </button>
                </div>

                {/* Results */}
                {results.length > 0 && (
                    <div className="mt-2 max-h-48 space-y-1 overflow-auto pr-1" data-testid="mod-search-results">
                        {results.map((r) => (
                            <div key={r.user_id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.04]">
                                {r.avatar_url ? (
                                    <img src={r.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                                ) : (
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-magenta/30 text-[10px]">
                                        {r.name?.[0]?.toUpperCase() || "•"}
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs font-semibold text-white">{r.name}</div>
                                    {r.handle && <div className="truncate text-[10px] text-white/40">@{r.handle}</div>}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => addMod(r)}
                                    disabled={busyId === r.user_id || mods.some((m) => m.user_id === r.user_id)}
                                    data-testid={`mod-add-${r.user_id}`}
                                    className="inline-flex items-center gap-1 rounded-full bg-magenta/20 px-2 py-1 text-[10px] font-semibold text-magenta-100 hover:bg-magenta/30 disabled:opacity-40"
                                >
                                    {mods.some((m) => m.user_id === r.user_id)
                                        ? <Check size={11} />
                                        : <UserPlus size={11} />}
                                    {mods.some((m) => m.user_id === r.user_id) ? "Déjà mod" : "Ajouter"}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                {query.length >= 2 && results.length === 0 && !searching && (
                    <div className="mt-2 text-center text-[11px] text-white/40">Aucun résultat</div>
                )}
            </div>

            {/* Current mods */}
            <div className="mt-3 space-y-2">
                {mods.length === 0 ? (
                    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 text-center text-xs text-white/40" data-testid="mod-empty">
                        Aucun modérateur pour ce live.
                    </div>
                ) : mods.map((m) => (
                    <div key={m.user_id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3" data-testid={`mod-row-${m.user_id}`}>
                        <div className="flex items-center gap-2">
                            {m.avatar_url ? (
                                <img src={m.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                            ) : (
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-magenta/30 text-xs font-bold">
                                    {m.name?.[0]?.toUpperCase() || "•"}
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-xs font-semibold text-white">{m.name}</div>
                                {m.handle && <div className="truncate text-[10px] text-white/40">@{m.handle}</div>}
                            </div>
                            <button
                                type="button"
                                onClick={() => removeMod(m)}
                                data-testid={`mod-remove-${m.user_id}`}
                                className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-300 hover:bg-red-500/20"
                            >
                                <ShieldOff size={11} /> Retirer
                            </button>
                        </div>
                        {/* Permission toggles */}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {PERMS.map((p) => {
                                const on = !!m[p.key];
                                return (
                                    <button
                                        key={p.key}
                                        type="button"
                                        onClick={() => togglePerm(m, p.key)}
                                        disabled={busyId === m.user_id}
                                        data-testid={`mod-perm-${m.user_id}-${p.key}`}
                                        title={p.help}
                                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                                            on
                                                ? "border-magenta/50 bg-magenta/20 text-magenta-100"
                                                : "border-white/10 bg-white/[0.02] text-white/50 hover:text-white/80"
                                        }`}
                                    >
                                        {on ? <Check size={10} /> : <X size={10} />} {p.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
            {err && <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">{err}</div>}
        </div>
    );
}

// ===========================================================================
//  BANNED
// ===========================================================================
function BannedTab({ sessionId }) {
    const [list, setList] = useState([]);
    const [busyId, setBusyId] = useState(null);
    const [err, setErr] = useState("");

    const load = async () => {
        try {
            const { data } = await api.get(`/live/${sessionId}/banned`);
            setList(Array.isArray(data) ? data : []);
        } catch { /* noop */ }
    };

    useEffect(() => { load(); /* eslint-disable-line */ }, [sessionId]);

    const unban = async (u) => {
        if (!window.confirm(`Lever le bannissement de ${u.name} ?`)) return;
        setBusyId(u.user_id); setErr("");
        try {
            await api.post(`/live/${sessionId}/banned/${u.user_id}/unban`);
            await load();
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setBusyId(null); }
    };

    return (
        <div data-testid="banned-tab">
            {list.length === 0 ? (
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 text-center text-xs text-white/40" data-testid="banned-empty">
                    Aucun viewer banni de ce live.
                </div>
            ) : (
                <div className="space-y-1.5">
                    {list.map((u) => (
                        <div key={u.user_id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2" data-testid={`banned-row-${u.user_id}`}>
                            {u.avatar_url ? (
                                <img src={u.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                            ) : (
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/20 text-xs font-bold">
                                    {u.name?.[0]?.toUpperCase() || "•"}
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-xs font-semibold text-white">{u.name}</div>
                                <div className="truncate text-[10px] text-white/40">{u.email}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => unban(u)}
                                disabled={busyId === u.user_id}
                                data-testid={`banned-unban-${u.user_id}`}
                                className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
                            >
                                <Check size={11} /> Débannir
                            </button>
                        </div>
                    ))}
                </div>
            )}
            {err && <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">{err}</div>}
        </div>
    );
}
