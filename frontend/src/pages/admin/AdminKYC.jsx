import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ShieldCheck, X, Clock } from "lucide-react";

export default function AdminKYC() {
    const [status, setStatus] = useState("processing");
    const [items, setItems] = useState([]);
    const [busy, setBusy] = useState(null);

    const load = async () => {
        try {
            const { data } = await api.get("/admin/kyc", { params: status ? { status } : {} });
            setItems(data);
        } catch {}
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

    const act = async (userId, action) => {
        setBusy(userId);
        try { await api.post(`/admin/kyc/${userId}/${action}`); await load(); }
        finally { setBusy(null); }
    };

    const FILTERS = [
        { id: "processing", label: "En attente", icon: Clock },
        { id: "verified", label: "Validées", icon: ShieldCheck },
        { id: "rejected", label: "Refusées", icon: X },
        { id: "", label: "Toutes" },
    ];

    return (
        <div data-testid="admin-kyc">
            <div className="mb-6 flex flex-wrap gap-2">
                {FILTERS.map(f => {
                    const Icon = f.icon;
                    return (
                        <button key={f.id} onClick={() => setStatus(f.id)}
                            data-testid={`kyc-filter-${f.id || "all"}`}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${status === f.id ? "border-magenta bg-magenta/20 text-white" : "border-white/10 text-white/60 hover:text-white"}`}>
                            {Icon && <Icon size={12} />} {f.label}
                        </button>
                    );
                })}
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/5 bg-surface">
                <table className="w-full text-sm">
                    <thead className="border-b border-white/5 text-left text-[11px] uppercase tracking-widest text-white/40">
                        <tr>
                            <th className="px-4 py-3">Utilisateur</th>
                            <th className="px-4 py-3">Mode</th>
                            <th className="px-4 py-3">Statut</th>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(k => (
                            <tr key={k.session_id} className="border-b border-white/5 last:border-0" data-testid={`kyc-row-${k.user_id}`}>
                                <td className="px-4 py-3">
                                    <div className="font-semibold">{k.user?.name}</div>
                                    <div className="text-xs text-white/40">{k.user?.email}</div>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`rounded-full border px-2 py-0.5 text-xs ${k.mode === "stripe" ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
                                        {k.mode}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`rounded-full border px-2 py-0.5 text-xs ${k.status === "verified" ? "border-green-500/30 bg-green-500/10 text-green-300" : k.status === "rejected" ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
                                        {k.status}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-xs text-white/50">{new Date(k.created_at).toLocaleString("fr-FR")}</td>
                                <td className="px-4 py-3 text-right">
                                    {k.status !== "verified" && k.status !== "rejected" ? (
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => act(k.user_id, "approve")} disabled={busy === k.user_id}
                                                data-testid={`kyc-approve-${k.user_id}`}
                                                className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs text-green-300 hover:bg-green-500/20">
                                                <ShieldCheck size={12} /> Valider
                                            </button>
                                            <button onClick={() => act(k.user_id, "reject")} disabled={busy === k.user_id}
                                                data-testid={`kyc-reject-${k.user_id}`}
                                                className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-300 hover:bg-red-500/20">
                                                <X size={12} /> Refuser
                                            </button>
                                        </div>
                                    ) : <span className="text-xs text-white/30">—</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {items.length === 0 && (
                    <div className="p-10 text-center text-sm text-white/40" data-testid="admin-kyc-empty">
                        Aucune vérification {status || ""}.
                    </div>
                )}
            </div>
        </div>
    );
}
