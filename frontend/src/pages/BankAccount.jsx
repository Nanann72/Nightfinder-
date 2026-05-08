import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/auth";
import { Building2, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";

export default function BankAccount() {
    const [bank, setBank] = useState(null);
    const [form, setForm] = useState({ iban: "", bic: "", holder_name: "", country: "FR" });
    const [editing, setEditing] = useState(false);
    const [err, setErr] = useState("");
    const [msg, setMsg] = useState("");
    const [loading, setLoading] = useState(false);

    const load = async () => {
        try {
            const { data } = await api.get("/payouts/bank");
            setBank(data);
            if (!data) setEditing(true);
        } catch (e) { setErr(formatApiError(e.response?.data?.detail)); }
    };
    useEffect(() => { load(); }, []);

    const submit = async (e) => {
        e.preventDefault(); setErr(""); setMsg(""); setLoading(true);
        try {
            await api.post("/payouts/bank", form);
            setMsg("Compte bancaire enregistré ✓");
            setEditing(false);
            await load();
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail));
        } finally { setLoading(false); }
    };

    const remove = async () => {
        if (!window.confirm("Supprimer ton compte bancaire ? Tu devras le ressaisir avant ta prochaine demande de retrait.")) return;
        setLoading(true);
        try { await api.delete("/payouts/bank"); setBank(null); setEditing(true); }
        finally { setLoading(false); }
    };

    return (
        <div className="relative z-10 container-mx py-10" data-testid="bank-page">
            <div className="mx-auto max-w-2xl">
                <div className="overline">Paramètres créatrice</div>
                <h1 className="mt-2 font-display text-3xl font-bold">Compte bancaire</h1>
                <p className="mt-2 text-white/60">
                    Renseigne ton IBAN pour recevoir tes retraits en euros par virement SEPA.
                </p>

                <div className="mt-8 surface-card">
                    {bank && !editing ? (
                        <div data-testid="bank-saved">
                            <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-magenta/30 bg-magenta/10 text-magenta-200">
                                    <Building2 size={22} />
                                </div>
                                <div>
                                    <div className="font-display text-xl font-semibold">{bank.holder_name}</div>
                                    <div className="font-mono text-sm text-white/60">{bank.iban_masked}</div>
                                    {bank.bic && <div className="text-xs text-white/40">BIC: {bank.bic}</div>}
                                </div>
                            </div>
                            <div className="mt-4 flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 p-2 text-xs text-green-300">
                                <CheckCircle2 size={12} /> Compte vérifié — tu peux demander un retrait
                            </div>
                            <div className="mt-4 flex gap-2">
                                <button onClick={() => { setForm({ iban: "", bic: bank.bic, holder_name: bank.holder_name, country: bank.country }); setEditing(true); }}
                                    data-testid="bank-edit-btn" className="btn-ghost text-sm">
                                    Modifier
                                </button>
                                <button onClick={remove} disabled={loading}
                                    data-testid="bank-delete-btn"
                                    className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300 hover:bg-red-500/20">
                                    <Trash2 size={14} /> Supprimer
                                </button>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={submit} className="space-y-4" data-testid="bank-form">
                            <div>
                                <label className="text-xs text-white/60">Nom du titulaire</label>
                                <input className="input-base mt-1" required data-testid="bank-holder"
                                       value={form.holder_name} placeholder="Prénom NOM"
                                       onChange={e => setForm({ ...form, holder_name: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-xs text-white/60">IBAN</label>
                                <input className="input-base mt-1 font-mono" required data-testid="bank-iban"
                                       value={form.iban} placeholder="FR76 1234 5678 9012 3456 7890 123"
                                       onChange={e => setForm({ ...form, iban: e.target.value.toUpperCase() })} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-white/60">BIC / SWIFT <span className="text-white/30">(optionnel)</span></label>
                                    <input className="input-base mt-1 font-mono" data-testid="bank-bic"
                                           value={form.bic} placeholder="PSSTFRPPPAR"
                                           onChange={e => setForm({ ...form, bic: e.target.value.toUpperCase() })} />
                                </div>
                                <div>
                                    <label className="text-xs text-white/60">Pays</label>
                                    <select className="input-base mt-1" data-testid="bank-country"
                                            value={form.country}
                                            onChange={e => setForm({ ...form, country: e.target.value })}>
                                        {["FR","BE","DE","ES","IT","NL","PT","CH","LU","GB"].map(c =>
                                            <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" data-testid="bank-error">{err}</div>}
                            {msg && <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">{msg}</div>}
                            <div className="flex gap-2">
                                <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center" data-testid="bank-submit">
                                    {loading ? "Enregistrement…" : "Enregistrer"}
                                </button>
                                {bank && (
                                    <button type="button" onClick={() => setEditing(false)} className="btn-ghost">
                                        Annuler
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-200">
                                <AlertTriangle size={12} /> Tes infos bancaires sont chiffrées côté serveur et uniquement visibles par toi et l'équipe comptable.
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
