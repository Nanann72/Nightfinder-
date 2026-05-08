import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/auth";
import { Save, Plus, Trash2, Settings, HelpCircle, Tag, Mail, FileText } from "lucide-react";

const TABS = [
    { id: "landing", label: "Landing page", icon: FileText },
    { id: "categories", label: "Catégories", icon: Tag },
    { id: "faq", label: "FAQ", icon: HelpCircle },
    { id: "contact", label: "Contact", icon: Mail },
];

export default function AdminSiteConfig() {
    const [tab, setTab] = useState("landing");
    const [config, setConfig] = useState(null);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState("");
    const [err, setErr] = useState("");

    const load = async () => {
        try {
            const { data } = await api.get("/site-config");
            setConfig(data);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail));
        }
    };
    useEffect(() => { load(); }, []);

    const save = async (patch) => {
        setSaving(true); setMsg(""); setErr("");
        try {
            const { data } = await api.patch("/admin/site-config", patch);
            setConfig(data);
            setMsg("Enregistré ✓");
            setTimeout(() => setMsg(""), 2000);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail));
        } finally { setSaving(false); }
    };

    if (!config) return <div className="text-white/40" data-testid="siteconfig-loading">Chargement…</div>;

    return (
        <div data-testid="admin-site-config">
            <div className="flex items-center gap-2">
                <Settings size={18} className="text-magenta-200" />
                <h2 className="font-display text-xl font-bold sm:text-2xl">Configuration du site</h2>
            </div>
            <p className="mt-1 text-sm text-white/50">Édite le contenu public du site : landing, catégories, FAQ, coordonnées.</p>

            {/* Tabs */}
            <div className="mt-5 flex flex-wrap gap-2 border-b border-white/5 pb-3">
                {TABS.map((t) => {
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            data-testid={`siteconfig-tab-${t.id}`}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                                tab === t.id
                                    ? "border-magenta bg-magenta/15 text-white"
                                    : "border-white/10 text-white/60 hover:border-white/20 hover:text-white"
                            }`}
                        >
                            <Icon size={12} /> {t.label}
                        </button>
                    );
                })}
            </div>

            {msg && <div className="mt-4 rounded-lg border border-green-500/30 bg-green-500/10 p-2 text-xs text-green-300" data-testid="siteconfig-msg">{msg}</div>}
            {err && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" data-testid="siteconfig-error">{err}</div>}

            <div className="mt-6">
                {tab === "landing" && <LandingTab config={config} onSave={save} saving={saving} />}
                {tab === "categories" && <CategoriesTab config={config} onSave={save} saving={saving} />}
                {tab === "faq" && <FaqTab config={config} onSave={save} saving={saving} />}
                {tab === "contact" && <ContactTab config={config} onSave={save} saving={saving} />}
            </div>
        </div>
    );
}

function Field({ label, value, onChange, placeholder, textarea, testId }) {
    return (
        <div>
            <label className="text-xs text-white/60">{label}</label>
            {textarea ? (
                <textarea
                    className="input-base mt-1 min-h-[80px] resize-none"
                    rows={3}
                    placeholder={placeholder}
                    value={value || ""}
                    onChange={e => onChange(e.target.value)}
                    data-testid={testId}
                />
            ) : (
                <input
                    className="input-base mt-1"
                    placeholder={placeholder}
                    value={value || ""}
                    onChange={e => onChange(e.target.value)}
                    data-testid={testId}
                />
            )}
        </div>
    );
}

function LandingTab({ config, onSave, saving }) {
    const [form, setForm] = useState({
        hero_title: config.hero_title,
        hero_subtitle: config.hero_subtitle,
        hero_cta: config.hero_cta,
        about_text: config.about_text,
        footer_tagline: config.footer_tagline,
    });
    return (
        <div className="space-y-4">
            <Field label="Titre principal (hero)" value={form.hero_title}
                   onChange={v => setForm({ ...form, hero_title: v })}
                   testId="landing-hero-title" />
            <Field label="Sous-titre (hero)" value={form.hero_subtitle} textarea
                   onChange={v => setForm({ ...form, hero_subtitle: v })}
                   testId="landing-hero-subtitle" />
            <Field label="Bouton d'appel (CTA)" value={form.hero_cta}
                   onChange={v => setForm({ ...form, hero_cta: v })}
                   testId="landing-hero-cta" />
            <Field label="Texte « À propos »" value={form.about_text} textarea
                   onChange={v => setForm({ ...form, about_text: v })}
                   testId="landing-about" />
            <Field label="Slogan footer" value={form.footer_tagline} textarea
                   onChange={v => setForm({ ...form, footer_tagline: v })}
                   testId="landing-footer" />
            <button onClick={() => onSave(form)} disabled={saving}
                    className="btn-primary" data-testid="landing-save">
                <Save size={14} /> {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
        </div>
    );
}

function CategoriesTab({ config, onSave, saving }) {
    const [cats, setCats] = useState(config.categories || []);
    const [newCat, setNewCat] = useState("");

    const add = () => {
        const v = newCat.trim();
        if (!v || cats.includes(v)) return;
        setCats([...cats, v]);
        setNewCat("");
    };
    const remove = (c) => setCats(cats.filter(x => x !== c));

    return (
        <div>
            <p className="text-sm text-white/50">Ces catégories sont proposées aux créatrices lors de la personnalisation de leur profil.</p>
            <div className="mt-4 flex flex-wrap gap-2" data-testid="categories-list">
                {cats.map(c => (
                    <span key={c} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm" data-testid={`category-${c}`}>
                        #{c}
                        <button onClick={() => remove(c)} className="rounded-full p-0.5 text-white/40 hover:bg-red-500/20 hover:text-red-300" data-testid={`category-remove-${c}`}>
                            <Trash2 size={11} />
                        </button>
                    </span>
                ))}
            </div>
            <div className="mt-4 flex gap-2">
                <input className="input-base flex-1" placeholder="Nouvelle catégorie…"
                       value={newCat}
                       onChange={e => setNewCat(e.target.value)}
                       onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())}
                       data-testid="category-input" />
                <button onClick={add} className="btn-outline-magenta" data-testid="category-add">
                    <Plus size={14} /> Ajouter
                </button>
            </div>
            <div className="mt-4">
                <button onClick={() => onSave({ categories: cats })} disabled={saving} className="btn-primary" data-testid="categories-save">
                    <Save size={14} /> {saving ? "Enregistrement…" : "Enregistrer la liste"}
                </button>
            </div>
        </div>
    );
}

function FaqTab({ config, onSave, saving }) {
    const [faq, setFaq] = useState(config.faq || []);

    const update = (i, key, v) => {
        const next = [...faq]; next[i] = { ...next[i], [key]: v }; setFaq(next);
    };
    const add = () => setFaq([...faq, { q: "", a: "" }]);
    const remove = (i) => setFaq(faq.filter((_, idx) => idx !== i));

    return (
        <div className="space-y-4">
            {faq.map((item, i) => (
                <div key={i} className="rounded-xl border border-white/5 bg-white/[0.02] p-4" data-testid={`faq-item-${i}`}>
                    <div className="flex items-start justify-between gap-2">
                        <div className="overline">Question {i + 1}</div>
                        <button onClick={() => remove(i)} className="rounded-full p-1 text-white/40 hover:bg-red-500/20 hover:text-red-300" data-testid={`faq-remove-${i}`}>
                            <Trash2 size={12} />
                        </button>
                    </div>
                    <input className="input-base mt-2" placeholder="Question"
                           value={item.q} onChange={e => update(i, "q", e.target.value)}
                           data-testid={`faq-q-${i}`} />
                    <textarea className="input-base mt-2 min-h-[60px] resize-none" rows={2}
                              placeholder="Réponse"
                              value={item.a} onChange={e => update(i, "a", e.target.value)}
                              data-testid={`faq-a-${i}`} />
                </div>
            ))}
            <div className="flex gap-2">
                <button onClick={add} className="btn-outline-magenta" data-testid="faq-add">
                    <Plus size={14} /> Ajouter une question
                </button>
                <button onClick={() => onSave({ faq })} disabled={saving} className="btn-primary" data-testid="faq-save">
                    <Save size={14} /> {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
            </div>
        </div>
    );
}

function ContactTab({ config, onSave, saving }) {
    const [email, setEmail] = useState(config.contact_email || "");
    return (
        <div className="space-y-4">
            <Field label="Adresse email de contact (affichée dans le footer)"
                   value={email} onChange={setEmail}
                   placeholder="contact@meandyou.fans"
                   testId="contact-email" />
            <button onClick={() => onSave({ contact_email: email })} disabled={saving} className="btn-primary" data-testid="contact-save">
                <Save size={14} /> {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
        </div>
    );
}
