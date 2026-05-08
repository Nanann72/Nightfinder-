import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/auth";
import { Search, Ban, CheckCircle2, Trash2, Shield, RefreshCw, Sparkles, Coins, X } from "lucide-react";

export default function AdminUsers() {
    const [q, setQ] = useState("");
    const [role, setRole] = useState("");
    const [users, setUsers] = useState([]);
    const [busy, setBusy] = useState(null);
    const [err, setErr] = useState("");
    const [syncMsg, setSyncMsg] = useState("");
    const [syncing, setSyncing] = useState(false);
    const [coinTarget, setCoinTarget] = useState(null); // {user_id, email, mode: 'grant'|'deduct'}

    const load = async () => {
        try {
            const { data } = await api.get("/admin/users", { params: { q: q || undefined, role: role || undefined, limit: 100 } });
            setUsers(data);
        } catch (e) { setErr(formatApiError(e.response?.data?.detail)); }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [role]);

    const patch = async (id, update) => {
        setBusy(id);
        try { await api.patch(`/admin/users/${id}`, update); await load(); }
        catch (e) { setErr(formatApiError(e.response?.data?.detail)); }
        finally { setBusy(null); }
    };

    const del = async (id) => {
        if (!window.confirm("Supprimer cet utilisateur définitivement ? Toutes ses données seront perdues.")) return;
        setBusy(id);
        try { await api.delete(`/admin/users/${id}`); await load(); }
        catch (e) { setErr(formatApiError(e.response?.data?.detail)); }
        finally { setBusy(null); }
    };

    const syncRoles = async () => {
        setSyncing(true); setSyncMsg(""); setErr("");
        try {
            const { data } = await api.post("/admin/users/sync-roles");
            setSyncMsg(`Audit OK — ${data.removed_orphan_creator_profiles} profil(s) créatrice orphelin(s) supprimé(s), ${data.created_missing_creator_profiles} profil(s) créatrice manquant(s) recréé(s).`);
            await load();
        } catch (e) { setErr(formatApiError(e.response?.data?.detail) || e.message); }
        finally { setSyncing(false); }
    };

    const banToggle = async (u) => {
        if (!window.confirm(u.banned ? `Réactiver ${u.email} ?` : `Suspendre ${u.email} ?\n\nL'utilisateur sera déconnecté et ne pourra plus se connecter.`)) return;
        setBusy(u.user_id);
        try {
            await api.post(`/admin/users/${u.user_id}/${u.banned ? "unban" : "ban"}`);
            await load();
        } catch (e) { setErr(formatApiError(e.response?.data?.detail) || e.message); }
        finally { setBusy(null); }
    };

    const ROLE_STYLE = {
        admin: "border-magenta/40 bg-magenta/10 text-magenta-200",
        creator: "border-pink-500/30 bg-pink-500/10 text-pink-200",
        fan: "border-white/10 bg-white/5 text-white/60",
    };

    return (
        <div data-testid="admin-users">
            <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={16} />
                    <input
                        className="input-base pl-10" placeholder="Rechercher email ou nom…"
                        value={q} onChange={e => setQ(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && load()}
                        data-testid="admin-user-search" />
                </div>
                <select className="input-base sm:w-48" value={role}
                        onChange={e => setRole(e.target.value)} data-testid="admin-user-role-filter">
                    <option value="">Tous les rôles</option>
                    <option value="fan">Fans</option>
                    <option value="creator">Créatrices</option>
                    <option value="admin">Admins</option>
                </select>
                <button onClick={load} data-testid="admin-user-search-btn" className="btn-primary">Rechercher</button>
                <button
                    onClick={syncRoles}
                    disabled={syncing}
                    data-testid="admin-users-sync-btn"
                    className="btn-ghost inline-flex items-center gap-2"
                    title="Audit : synchronise rôle ⇄ profil créatrice"
                >
                    <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                    {syncing ? "Audit…" : "Audit rôles"}
                </button>
            </div>

            {syncMsg && (
                <div className="mt-3 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200" data-testid="admin-users-sync-msg">
                    <Sparkles size={14} className="mr-2 inline-block" />
                    {syncMsg}
                </div>
            )}

            {err && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>}

            <div className="mt-6 overflow-x-auto rounded-2xl border border-white/5 bg-surface">
                <table className="w-full min-w-[720px] text-sm">
                    <thead className="border-b border-white/5 text-left text-[11px] uppercase tracking-widest text-white/40">
                        <tr>
                            <th className="px-4 py-3">Utilisateur</th>
                            <th className="px-4 py-3">Rôle</th>
                            <th className="px-4 py-3 hidden sm:table-cell">Âge</th>
                            <th className="px-4 py-3 hidden sm:table-cell">Statut</th>
                            <th className="px-4 py-3 hidden lg:table-cell">Créé</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u.user_id} className="border-b border-white/5 last:border-0" data-testid={`admin-user-row-${u.user_id}`}>
                                <td className="px-4 py-3">
                                    <div className="font-semibold">{u.name}</div>
                                    <div className="text-xs text-white/40">{u.email}</div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex flex-col gap-1">
                                        <select
                                            value={u.role}
                                            onChange={e => patch(u.user_id, { role: e.target.value })}
                                            className={`rounded-full border px-3 py-1 text-xs ${ROLE_STYLE[u.role]}`}
                                            data-testid={`admin-user-role-${u.user_id}`}
                                        >
                                            <option value="fan">fan</option>
                                            <option value="creator">creator</option>
                                            <option value="admin">admin</option>
                                        </select>
                                        {u.role === "creator" && u.has_creator_profile === false && (
                                            <span className="text-[10px] text-amber-300" data-testid={`admin-user-no-profile-${u.user_id}`}>
                                                ⚠ Sans profil créatrice
                                            </span>
                                        )}
                                        {u.role !== "creator" && u.has_creator_profile && (
                                            <span className="text-[10px] text-amber-300" data-testid={`admin-user-orphan-profile-${u.user_id}`}>
                                                ⚠ Profil créatrice orphelin
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3 hidden sm:table-cell">
                                    {u.age_verified ? (
                                        <span className="inline-flex items-center gap-1 text-green-300 text-xs">
                                            <Shield size={12} /> Vérifié
                                        </span>
                                    ) : (
                                        <button onClick={() => patch(u.user_id, { age_verified: true })}
                                                data-testid={`admin-user-verify-${u.user_id}`}
                                                className="text-xs text-magenta-200 hover:underline">
                                            Valider
                                        </button>
                                    )}
                                </td>
                                <td className="px-4 py-3 hidden sm:table-cell">
                                    {u.banned ? (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-300">
                                            <Ban size={10} /> Suspendu
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs text-green-300">
                                            <CheckCircle2 size={10} /> Actif
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-3 hidden lg:table-cell text-xs text-white/40">
                                    {u.created_at ? new Date(u.created_at).toLocaleDateString("fr-FR") : "—"}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <div className="flex flex-wrap justify-end gap-2">
                                        <button
                                            onClick={() => setCoinTarget({ user_id: u.user_id, email: u.email, mode: "grant" })}
                                            disabled={busy === u.user_id}
                                            data-testid={`admin-user-coins-${u.user_id}`}
                                            className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs text-amber-200 hover:bg-amber-400/20"
                                            title="Créditer/déduire des coins"
                                        >
                                            <Coins size={12} /> Coins
                                        </button>
                                        <button
                                            onClick={() => banToggle(u)}
                                            disabled={busy === u.user_id}
                                            data-testid={`admin-user-ban-${u.user_id}`}
                                            className={`rounded-full border px-2 py-1 text-xs ${u.banned ? "border-green-500/30 bg-green-500/10 text-green-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}
                                        >
                                            {u.banned ? "Réactiver" : "Suspendre"}
                                        </button>
                                        <button
                                            onClick={() => del(u.user_id)}
                                            disabled={busy === u.user_id}
                                            data-testid={`admin-user-delete-${u.user_id}`}
                                            className="rounded-full p-1.5 text-white/40 hover:bg-red-500/10 hover:text-red-300"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {users.length === 0 && (
                    <div className="p-10 text-center text-sm text-white/40" data-testid="admin-users-empty">
                        Aucun utilisateur trouvé.
                    </div>
                )}
            </div>
            {coinTarget && (
                <CoinGrantModal target={coinTarget} onClose={(saved) => { setCoinTarget(null); if (saved) load(); }} />
            )}
        </div>
    );
}

function CoinGrantModal({ target, onClose }) {
    const [amount, setAmount] = useState("100");
    const [reason, setReason] = useState("Cadeau de bienvenue");
    const [mode, setMode] = useState(target.mode || "grant"); // grant | deduct
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [success, setSuccess] = useState("");

    const submit = async () => {
        const n = parseInt(amount, 10);
        if (!Number.isFinite(n) || n < 1) { setErr("Quantité invalide"); return; }
        setErr(""); setLoading(true);
        try {
            const endpoint = mode === "grant" ? "grant-coins" : "deduct-coins";
            const { data } = await api.post(`/admin/users/${target.user_id}/${endpoint}`, {
                amount: n, reason: reason || (mode === "grant" ? "admin_grant" : "admin_deduct"),
            });
            setSuccess(mode === "grant"
                ? `+${data.granted} coins crédités. Nouveau solde : ${data.new_balance}.`
                : `-${data.deducted} coins déduits. Nouveau solde : ${data.new_balance}.`);
            setTimeout(() => onClose(true), 1500);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" data-testid="admin-coins-modal">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-surface p-6">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="overline flex items-center gap-2"><Coins size={12} /> Gestion coins</div>
                        <h2 className="mt-1 font-display text-xl font-bold">{target.email}</h2>
                    </div>
                    <button onClick={() => onClose(false)} data-testid="admin-coins-modal-close" className="text-white/50 hover:text-white">
                        <X size={18} />
                    </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                        onClick={() => setMode("grant")}
                        data-testid="admin-coins-mode-grant"
                        className={`rounded-full border px-3 py-1.5 text-xs ${mode === "grant" ? "border-green-500/50 bg-green-500/15 text-green-200" : "border-white/10 text-white/50"}`}
                    >
                        + Créditer
                    </button>
                    <button
                        onClick={() => setMode("deduct")}
                        data-testid="admin-coins-mode-deduct"
                        className={`rounded-full border px-3 py-1.5 text-xs ${mode === "deduct" ? "border-red-500/50 bg-red-500/15 text-red-200" : "border-white/10 text-white/50"}`}
                    >
                        − Déduire
                    </button>
                </div>

                <label className="mt-4 block text-xs text-white/60">Quantité (coins)</label>
                <input type="number" min="1" max="100000" value={amount} onChange={e => setAmount(e.target.value)}
                       className="input-base mt-1 font-mono" data-testid="admin-coins-amount" />
                <p className="mt-1 text-[11px] text-white/40">≈ {((parseInt(amount, 10) || 0) * 0.1).toFixed(2)} €</p>

                <label className="mt-3 block text-xs text-white/60">Raison (visible dans les notifications)</label>
                <input value={reason} onChange={e => setReason(e.target.value)}
                       className="input-base mt-1" placeholder="Ex: cadeau de bienvenue, compensation, etc."
                       data-testid="admin-coins-reason" />

                {err && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" data-testid="admin-coins-error">{err}</div>}
                {success && <div className="mt-3 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300" data-testid="admin-coins-success">{success}</div>}

                <div className="mt-4 flex gap-2">
                    <button onClick={() => onClose(false)} className="btn-ghost flex-1 justify-center">Annuler</button>
                    <button onClick={submit} disabled={loading || !!success} className="btn-primary flex-1 justify-center" data-testid="admin-coins-submit">
                        <Sparkles size={14} /> {loading ? "…" : mode === "grant" ? "Créditer" : "Déduire"}
                    </button>
                </div>
            </div>
        </div>
    );
}
