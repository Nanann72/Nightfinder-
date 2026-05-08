import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/auth";
import {
    Wallet, Copy, Check, Loader2, Search, CreditCard, ExternalLink,
    AlertCircle, CheckCircle2, Euro, Banknote, RefreshCw,
} from "lucide-react";

export default function AdminPayouts() {
    const [creators, setCreators] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(null); // creator details
    const [detailLoading, setDetailLoading] = useState(false);
    const [copied, setCopied] = useState("");
    const [markingPaid, setMarkingPaid] = useState(null);
    const [reapplying, setReapplying] = useState(false);
    const [reapplyResult, setReapplyResult] = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setErr("");
        try {
            const { data } = await api.get("/admin/creators/payouts");
            setCreators(data);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const openDetail = async (creator_id) => {
        setDetailLoading(true); setSelected({ loading: true });
        try {
            const { data } = await api.get(`/admin/creators/${creator_id}/bank`);
            setSelected(data);
        } catch (e) {
            setSelected(null);
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setDetailLoading(false); }
    };

    const copy = async (text, label) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(label);
            setTimeout(() => setCopied(""), 1500);
        } catch { /* ignore */ }
    };

    const markPaid = async (request_id) => {
        if (!window.confirm("Confirmer que ce retrait a bien été viré ?")) return;
        setMarkingPaid(request_id);
        try {
            const note = window.prompt("Référence bancaire (optionnel)") || "";
            await api.post(`/admin/payouts/${request_id}/mark-paid`, { note });
            await load();
            if (selected?.creator_id) await openDetail(selected.creator_id);
        } catch (e) {
            alert(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setMarkingPaid(null); }
    };

    const reapplyStuck = async () => {
        if (!window.confirm("Cela va re-créditer les coins de toutes les transactions Stripe payées qui n'ont jamais été appliquées. Continuer ?")) return;
        setReapplying(true); setReapplyResult(null); setErr("");
        try {
            const { data } = await api.post("/admin/payments/reapply");
            setReapplyResult(data);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setReapplying(false); }
    };

    const filtered = creators.filter(c => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (c.display_name || "").toLowerCase().includes(s)
            || (c.handle || "").toLowerCase().includes(s)
            || (c.email || "").toLowerCase().includes(s);
    });

    if (loading) return <div className="container-mx py-16 text-center text-white/40" data-testid="admin-payouts-loading"><Loader2 size={18} className="inline animate-spin" /> Chargement…</div>;

    return (
        <div className="container-mx py-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <div className="overline flex items-center gap-2"><Wallet size={12} /> Admin</div>
                    <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">Retraits créatrices</h1>
                    <p className="mt-1 text-sm text-white/50">Visualise les IBAN, traite les demandes de retrait et marque les virements comme payés.</p>
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                    <button
                        onClick={reapplyStuck}
                        disabled={reapplying}
                        data-testid="admin-reapply-btn"
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-200 transition-all hover:bg-amber-500/20 disabled:opacity-50"
                    >
                        {reapplying ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                        {reapplying ? "Rejeu en cours…" : "Rejouer les paiements bloqués"}
                    </button>
                    <div className="relative">
                        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                        <input type="text" placeholder="Rechercher une créatrice…"
                               value={search} onChange={e => setSearch(e.target.value)}
                               data-testid="admin-payouts-search"
                               className="input-base pl-8 w-full sm:w-72" />
                    </div>
                </div>
            </div>

            {reapplyResult && (
                <div data-testid="admin-reapply-result"
                     className={`mt-4 rounded-2xl border p-4 text-sm ${
                         reapplyResult.fixed_count > 0
                             ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                             : "border-white/10 bg-white/[0.03] text-white/65"
                     }`}>
                    <div className="flex items-center gap-2 font-semibold">
                        <CheckCircle2 size={14} className="text-emerald-300" />
                        {reapplyResult.fixed_count > 0
                            ? `${reapplyResult.fixed_count} transaction${reapplyResult.fixed_count > 1 ? "s" : ""} re-créditée${reapplyResult.fixed_count > 1 ? "s" : ""}`
                            : "Aucune transaction bloquée trouvée"}
                        <span className="font-normal text-white/45">· {reapplyResult.skipped_count || 0} déjà OK</span>
                    </div>
                    {reapplyResult.fixed_count > 0 && (
                        <div className="mt-3 space-y-1.5 max-h-60 overflow-auto">
                            {reapplyResult.fixed.slice(0, 30).map((f, i) => (
                                <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/20 bg-black/20 px-3 py-1.5 text-[11px] font-mono">
                                    <span className="truncate">user={f.user_id.slice(0, 10)} · session={(f.session_id || "—").slice(0, 18)}</span>
                                    <span className="shrink-0 text-emerald-200 font-bold">+{f.coins} coins ({f.amount.toFixed(2)} €)</span>
                                </div>
                            ))}
                            {reapplyResult.fixed.length > 30 && (
                                <div className="pt-2 text-[11px] text-white/45">… +{reapplyResult.fixed.length - 30} autres</div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {err && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" data-testid="admin-payouts-error">{err}</div>}

            {/* Creator list */}
            <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]" data-testid="admin-payouts-table">
                <table className="w-full min-w-[700px] text-sm">
                    <thead className="border-b border-white/10 bg-white/[0.02]">
                        <tr className="text-left text-[10px] uppercase tracking-wider text-white/50">
                            <th className="p-3">Créatrice</th>
                            <th className="p-3">Solde</th>
                            <th className="p-3 hidden md:table-cell">IBAN</th>
                            <th className="p-3">Retraits</th>
                            <th className="p-3 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <tr><td colSpan={5} className="p-8 text-center text-white/40">Aucune créatrice trouvée</td></tr>
                        )}
                        {filtered.map((c) => {
                            const hasIban = !!c.bank?.iban;
                            const pending = (c.pending_payouts || []).length;
                            return (
                                <tr key={c.creator_id}
                                    data-testid={`admin-payout-row-${c.creator_id}`}
                                    className={`border-b border-white/5 transition-colors hover:bg-white/[0.03] ${pending > 0 ? "bg-amber-500/5" : ""}`}>
                                    <td className="p-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                                                {c.avatar_url && <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate font-semibold">{c.display_name || "—"}</div>
                                                <div className="truncate text-[11px] text-white/50">{c.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-3">
                                        <div className="font-mono text-xs font-bold">{c.balance_coins} coins</div>
                                        <div className="text-[11px] text-white/50">≈ {c.balance_eur.toFixed(2)} € net</div>
                                    </td>
                                    <td className="p-3 hidden md:table-cell">
                                        {hasIban ? (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-semibold text-green-300">
                                                <CheckCircle2 size={11} /> Renseigné
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                                                <AlertCircle size={11} /> Manquant
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-3">
                                        {pending > 0 ? (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-200">
                                                {pending} en attente
                                            </span>
                                        ) : (
                                            <span className="text-[11px] text-white/40">
                                                {c.completed_payouts_count} payés
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-3 text-right">
                                        <button onClick={() => openDetail(c.creator_id)}
                                                data-testid={`admin-payout-open-${c.creator_id}`}
                                                className="inline-flex items-center gap-1 rounded-full border border-magenta/40 bg-magenta/10 px-3 py-1 text-xs font-semibold text-magenta-200 hover:bg-magenta/20 transition-colors">
                                            Détails <ExternalLink size={11} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Detail modal */}
            {selected && (
                <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto"
                     onClick={() => setSelected(null)}
                     data-testid="admin-payout-detail-modal">
                    <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-surface p-6 my-8 shadow-2xl"
                         onClick={e => e.stopPropagation()}>
                        {selected.loading && !selected.creator_id ? (
                            <div className="py-8 text-center text-white/40"><Loader2 size={18} className="inline animate-spin" /> Chargement…</div>
                        ) : (
                            <>
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="overline">Détails paiement</div>
                                        <div className="mt-1 font-display text-2xl font-bold">{selected.display_name}</div>
                                        <div className="text-xs text-white/50">@{selected.handle} · {selected.email}</div>
                                    </div>
                                    <button onClick={() => setSelected(null)}
                                            data-testid="admin-payout-detail-close"
                                            className="rounded-full p-1.5 text-white/50 hover:bg-white/5 hover:text-white">✕</button>
                                </div>

                                {/* Bank info */}
                                <div className="mt-6 rounded-xl border border-magenta/30 bg-magenta/5 p-4" data-testid="admin-payout-bank">
                                    <div className="overline flex items-center gap-2 text-magenta-200"><Banknote size={12} /> IBAN / RIB</div>
                                    {!selected.bank ? (
                                        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                                            Cette créatrice n'a pas encore renseigné son IBAN. Elle doit aller dans son dashboard → Bank pour l'ajouter avant de pouvoir recevoir un virement.
                                        </div>
                                    ) : (
                                        <div className="mt-3 space-y-2.5 text-sm">
                                            <Row label="Titulaire" value={selected.bank.holder_name} onCopy={() => copy(selected.bank.holder_name, "holder")} copied={copied === "holder"} testId="bank-holder" />
                                            <Row label="IBAN" value={selected.bank.iban} onCopy={() => copy(selected.bank.iban, "iban")} copied={copied === "iban"} testId="bank-iban" mono />
                                            {selected.bank.bic && <Row label="BIC/SWIFT" value={selected.bank.bic} onCopy={() => copy(selected.bank.bic, "bic")} copied={copied === "bic"} testId="bank-bic" mono />}
                                            <Row label="Email" value={selected.email} onCopy={() => copy(selected.email, "email")} copied={copied === "email"} testId="bank-email" />
                                        </div>
                                    )}
                                </div>

                                {/* Pending payouts */}
                                {(selected.pending_payouts || []).length > 0 && (
                                    <div className="mt-5" data-testid="admin-payout-pending">
                                        <div className="overline flex items-center gap-2"><CreditCard size={12} /> Retraits en attente ({selected.pending_payouts.length})</div>
                                        <div className="mt-3 space-y-2">
                                            {selected.pending_payouts.map(p => (
                                                <div key={p.request_id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                                                    <div className="min-w-0">
                                                        <div className="font-mono text-xs font-bold text-amber-100">{p.eur_value?.toFixed(2)} € · {p.coins} coins</div>
                                                        <div className="text-[11px] text-white/50">Demande {p.request_id} · {new Date(p.created_at).toLocaleDateString("fr-FR")}</div>
                                                    </div>
                                                    <button onClick={() => markPaid(p.request_id)}
                                                            disabled={markingPaid === p.request_id}
                                                            data-testid={`mark-paid-${p.request_id}`}
                                                            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-green-500/50 bg-green-500/20 px-3 py-1 text-xs font-bold text-green-100 hover:bg-green-500/35 disabled:opacity-40 transition-colors">
                                                        {markingPaid === p.request_id ? <Loader2 size={12} className="animate-spin" /> : <Euro size={12} />}
                                                        {markingPaid === p.request_id ? "Enregistrement…" : "Marquer payé"}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Payout history */}
                                {(selected.payout_history || []).length > 0 && (
                                    <div className="mt-5" data-testid="admin-payout-history">
                                        <div className="overline">Historique</div>
                                        <div className="mt-3 space-y-1.5 max-h-60 overflow-y-auto">
                                            {selected.payout_history.map(p => (
                                                <div key={p.request_id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
                                                    <span>{new Date(p.created_at).toLocaleDateString("fr-FR")} · {p.coins} coins</span>
                                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${
                                                        p.status === "paid" ? "border border-green-500/30 bg-green-500/10 text-green-300" :
                                                        p.status === "rejected" ? "border border-red-500/30 bg-red-500/10 text-red-300" :
                                                        "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                                                    }`}>{p.status}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function Row({ label, value, onCopy, copied, testId, mono = false }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/30 px-3 py-2">
            <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
                <div className={`mt-0.5 truncate ${mono ? "font-mono" : ""} text-sm font-semibold`} data-testid={testId}>
                    {value || "—"}
                </div>
            </div>
            <button onClick={onCopy}
                    data-testid={`${testId}-copy`}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-white/70 hover:border-magenta/40 hover:bg-magenta/10 hover:text-white transition-colors">
                {copied ? <><Check size={11} /> Copié</> : <><Copy size={11} /> Copier</>}
            </button>
        </div>
    );
}
