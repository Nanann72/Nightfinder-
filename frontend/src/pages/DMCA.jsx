import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ShieldAlert, Send, Check, Mail, FileText, Link as LinkIcon, AlertTriangle, Building2, User } from "lucide-react";

/**
 * Public DMCA takedown form. No auth required.
 * Submits to POST /api/dmca/submit and shows a confirmation reference id.
 */
export default function DMCA() {
    const [form, setForm] = useState({
        claimant_name: "",
        claimant_email: "",
        claimant_company: "",
        claimant_role: "self",
        target_url: "",
        target_creator: "",
        description: "",
        original_work_url: "",
        sworn_statement: false,
        accept_perjury: false,
    });
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(null);
    const [err, setErr] = useState("");

    const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const submit = async (e) => {
        e.preventDefault();
        if (!form.sworn_statement || !form.accept_perjury) {
            setErr("Tu dois accepter les déclarations sous serment.");
            return;
        }
        setSubmitting(true); setErr("");
        try {
            const { data } = await api.post("/dmca/submit", form);
            setDone(data.report_id);
        } catch (e) {
            setErr(e.response?.data?.detail || "Erreur lors de l'envoi du signalement.");
        } finally {
            setSubmitting(false);
        }
    };

    if (done) {
        return (
            <div className="container-mx py-16" data-testid="dmca-success">
                <div className="mx-auto max-w-xl rounded-3xl border border-emerald-500/40 bg-emerald-500/[0.05] p-8 sm:p-10 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
                        <Check size={28} />
                    </div>
                    <h1 className="mt-5 font-display text-2xl font-bold sm:text-3xl">Signalement reçu</h1>
                    <p className="mt-3 text-sm text-white/65">
                        Ton signalement a bien été enregistré. Notre équipe l'examinera sous 48h ouvrées
                        et te répondra à l'email <span className="font-mono text-magenta-200">{form.claimant_email}</span>.
                    </p>
                    <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 font-mono text-xs text-white/70">
                        Référence · <span className="text-white">{done}</span>
                    </div>
                    <div className="mt-8">
                        <Link to="/" className="btn-primary inline-flex">Retour à l'accueil</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="container-mx py-12 sm:py-16" data-testid="dmca-page">
            <div className="mx-auto max-w-2xl">
                <header className="mb-8 text-center">
                    <div className="mx-auto inline-flex items-center justify-center rounded-2xl border border-magenta/30 bg-magenta/10 p-3 text-magenta-200">
                        <ShieldAlert size={22} />
                    </div>
                    <h1 className="mt-5 font-display text-3xl font-bold sm:text-4xl">Signalement DMCA</h1>
                    <p className="mt-3 text-sm text-white/60">
                        Tu penses qu'un contenu publié sur me&you.fans viole tes droits d'auteur ?
                        Remplis ce formulaire pour demander son retrait.
                    </p>
                </header>

                <div className="rounded-3xl border border-amber-500/30 bg-amber-500/[0.05] p-4 mb-6 flex items-start gap-3">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
                    <div className="text-xs leading-relaxed text-white/75">
                        Ce formulaire constitue une déclaration officielle. Les fausses déclarations peuvent entraîner
                        des poursuites judiciaires conformément au DMCA (États-Unis) et à la directive européenne sur le droit d'auteur.
                    </div>
                </div>

                <form onSubmit={submit} className="space-y-5" data-testid="dmca-form">
                    {/* Claimant */}
                    <div className="surface-card">
                        <div className="overline mb-4 flex items-center gap-1.5"><User size={11} /> Tes informations</div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Nom complet" required>
                                <input
                                    required value={form.claimant_name}
                                    onChange={e => update("claimant_name", e.target.value)}
                                    minLength={2} maxLength={120}
                                    data-testid="dmca-name"
                                    className="input-base" placeholder="Jean Dupont" />
                            </Field>
                            <Field label="Email" required>
                                <input
                                    required type="email" value={form.claimant_email}
                                    onChange={e => update("claimant_email", e.target.value)}
                                    data-testid="dmca-email"
                                    className="input-base" placeholder="contact@example.com" />
                            </Field>
                            <Field label="Société / Studio (optionnel)">
                                <input
                                    value={form.claimant_company}
                                    onChange={e => update("claimant_company", e.target.value)}
                                    maxLength={120}
                                    data-testid="dmca-company"
                                    className="input-base" placeholder="Nom de la société" />
                            </Field>
                            <Field label="Rôle" required>
                                <select
                                    value={form.claimant_role}
                                    onChange={e => update("claimant_role", e.target.value)}
                                    data-testid="dmca-role"
                                    className="input-base">
                                    <option value="self">Je suis l'auteur·rice</option>
                                    <option value="agent">Agent·e mandaté·e</option>
                                    <option value="lawyer">Avocat·e</option>
                                    <option value="company">Société / Studio</option>
                                </select>
                            </Field>
                        </div>
                    </div>

                    {/* Target */}
                    <div className="surface-card">
                        <div className="overline mb-4 flex items-center gap-1.5"><LinkIcon size={11} /> Contenu à retirer</div>
                        <div className="space-y-4">
                            <Field label="URL exacte du contenu visé" required>
                                <input
                                    required type="url" value={form.target_url}
                                    onChange={e => update("target_url", e.target.value)}
                                    minLength={4} maxLength={500}
                                    data-testid="dmca-target-url"
                                    className="input-base font-mono text-xs"
                                    placeholder="https://meandyou.fans/createur/..." />
                            </Field>
                            <Field label="Pseudo de la créatrice (optionnel)">
                                <input
                                    value={form.target_creator}
                                    onChange={e => update("target_creator", e.target.value)}
                                    maxLength={80}
                                    data-testid="dmca-target-creator"
                                    className="input-base" placeholder="@nom_du_compte" />
                            </Field>
                            <Field label="URL de l'œuvre originale (optionnel)">
                                <input
                                    type="url" value={form.original_work_url}
                                    onChange={e => update("original_work_url", e.target.value)}
                                    maxLength={500}
                                    data-testid="dmca-original-url"
                                    className="input-base font-mono text-xs"
                                    placeholder="https://..." />
                            </Field>
                            <Field label="Description de l'infraction" required>
                                <textarea
                                    required value={form.description}
                                    onChange={e => update("description", e.target.value)}
                                    minLength={10} maxLength={4000}
                                    rows={5}
                                    data-testid="dmca-description"
                                    className="input-base resize-none"
                                    placeholder="Décris précisément en quoi le contenu viole tes droits (œuvre, date de création, preuves, etc.)" />
                                <div className="mt-1 text-[11px] text-white/40 text-right">{form.description.length} / 4000</div>
                            </Field>
                        </div>
                    </div>

                    {/* Sworn statements */}
                    <div className="surface-card">
                        <div className="overline mb-4 flex items-center gap-1.5"><FileText size={11} /> Déclarations sous serment</div>
                        <div className="space-y-3">
                            <Checkbox
                                checked={form.sworn_statement}
                                onChange={v => update("sworn_statement", v)}
                                testId="dmca-sworn"
                            >
                                Je déclare sous peine de parjure que les informations fournies sont exactes et que je suis
                                titulaire des droits, ou autorisé·e à agir au nom du titulaire des droits exclusifs prétendument violés.
                            </Checkbox>
                            <Checkbox
                                checked={form.accept_perjury}
                                onChange={v => update("accept_perjury", v)}
                                testId="dmca-perjury"
                            >
                                Je comprends qu'une fausse déclaration peut engager ma responsabilité civile et pénale,
                                et que je peux être tenu·e de rembourser les frais de procédure liés à un retrait abusif.
                            </Checkbox>
                        </div>
                    </div>

                    {err && (
                        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300" data-testid="dmca-error">
                            {err}
                        </div>
                    )}

                    <div className="flex flex-col items-center gap-3 pt-2">
                        <button
                            type="submit"
                            disabled={submitting || !form.sworn_statement || !form.accept_perjury}
                            data-testid="dmca-submit"
                            className="btn-primary w-full sm:w-auto disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Send size={14} /> {submitting ? "Envoi…" : "Envoyer le signalement"}
                        </button>
                        <p className="text-[11px] text-white/40">
                            Pour toute question : <a href="mailto:dmca@meandyou.fans" className="text-magenta-200 hover:text-white">dmca@meandyou.fans</a>
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
}

function Field({ label, required, children }) {
    return (
        <label className="block">
            <span className="text-xs text-white/55">
                {label}
                {required && <span className="text-magenta-300"> *</span>}
            </span>
            <div className="mt-1.5">{children}</div>
        </label>
    );
}

function Checkbox({ checked, onChange, testId, children }) {
    return (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 transition-colors hover:border-white/15">
            <input
                type="checkbox"
                checked={checked}
                onChange={e => onChange(e.target.checked)}
                data-testid={testId}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-magenta"
            />
            <span className="text-sm leading-relaxed text-white/75">{children}</span>
        </label>
    );
}
