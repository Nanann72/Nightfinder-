import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
    Bot, Save, AlertTriangle, ShieldCheck, Flag, CheckCircle2, Trash2, Ban,
    UserX, Eye, X, Plus,
} from "lucide-react";
import { toast } from "sonner";

const FILTERS = [
    { key: "ban_nudity",            label: "Nudité",                 hint: "Photos/vidéos sexuellement explicites" },
    { key: "ban_violence",          label: "Violence",               hint: "Scènes violentes, gore" },
    { key: "ban_hate_speech",       label: "Discours de haine",      hint: "Insultes, racisme, homophobie" },
    { key: "ban_spam",              label: "Spam",                   hint: "Posts répétés, promotionnels" },
    { key: "ban_scam_links",        label: "Liens arnaque",          hint: "URLs suspectes (bit.ly, tinyurl)" },
    { key: "ban_drugs",             label: "Drogues",                hint: "Mentions de stupéfiants" },
    { key: "ban_weapons",           label: "Armes",                  hint: "Armes à feu, blanches" },
    { key: "ban_minors",            label: "Mineurs",                hint: "Détection mineurs (toujours actif)" , locked: true },
    { key: "ban_copyright",         label: "Copyright",              hint: "Œuvres protégées sans droits" },
    { key: "ban_external_contacts", label: "Contacts externes",      hint: "Numéros de tél, Telegram, WhatsApp…" },
    { key: "ban_doxxing",           label: "Doxxing",                hint: "Diffusion d'infos personnelles" },
    { key: "ban_off_topic",         label: "Hors sujet",             hint: "Contenu sans rapport avec la plateforme" },
];

const SCAN_TARGETS = [
    { key: "scan_content",   label: "Contenus publiés",   hint: "Posts feed, photos, vidéos" },
    { key: "scan_profiles",  label: "Profils créateurs",  hint: "Bio, nom, handle" },
    { key: "scan_messages",  label: "Messages privés",    hint: "DMs (coût LLM élevé)" },
    { key: "scan_live_chat", label: "Chat live",          hint: "Tchats en direct (coût LLM élevé)" },
];

const ACTIONS = ["warn", "hide", "delete", "report", "ban_user"];
const ACTION_LABEL = {
    warn:   "Avertir",
    hide:   "Masquer",
    delete: "Supprimer",
    report: "Signaler",
    ban_user: "Bannir",
};

export default function AdminModeration() {
    const [tab, setTab] = useState("policy");  // "policy" | "reports" | "flagged"
    return (
        <div data-testid="admin-moderation">
            {/* Tabs */}
            <div className="mb-4 flex flex-wrap gap-2">
                {[
                    { id: "policy",  label: "Règles IA",     icon: Bot },
                    { id: "reports", label: "Rapports IA",   icon: Flag },
                    { id: "flagged", label: "Signalés fans", icon: AlertTriangle },
                ].map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        data-testid={`mod-tab-${id}`}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
                            tab === id
                                ? "border-magenta/60 bg-magenta/20 text-white"
                                : "border-white/10 bg-white/[0.03] text-white/60 hover:text-white"
                        }`}
                    >
                        <Icon size={12} /> {label}
                    </button>
                ))}
            </div>
            {tab === "policy"  && <PolicyTab />}
            {tab === "reports" && <ReportsTab />}
            {tab === "flagged" && <FlaggedTab />}
        </div>
    );
}

// ===========================================================================
//  POLICY EDITOR
// ===========================================================================
function PolicyTab() {
    const [policy, setPolicy] = useState(null);
    const [saving, setSaving] = useState(false);
    const [keyword, setKeyword] = useState("");

    const load = async () => {
        const { data } = await api.get("/admin/moderation/policy");
        setPolicy(data);
    };
    useEffect(() => { load().catch(() => {}); }, []);

    const save = async (patch) => {
        setSaving(true);
        try {
            const { data } = await api.patch("/admin/moderation/policy", patch);
            setPolicy(data);
        } catch (e) {
            toast.error("Échec de la sauvegarde");
        } finally { setSaving(false); }
    };

    const addKeyword = async () => {
        const k = keyword.trim().toLowerCase();
        if (!k || policy.keyword_blacklist?.includes(k)) return;
        await save({ keyword_blacklist: [...(policy.keyword_blacklist || []), k] });
        setKeyword("");
    };
    const removeKeyword = (k) => {
        save({ keyword_blacklist: (policy.keyword_blacklist || []).filter((x) => x !== k) });
    };

    if (!policy) return <div className="text-white/40">Chargement…</div>;

    return (
        <div className="space-y-5">
            {/* Master switch */}
            <div className="surface-card flex items-center justify-between gap-3 border-magenta/30">
                <div>
                    <div className="flex items-center gap-2 font-semibold">
                        <Bot size={16} className="text-magenta-200" /> Modération IA Lou
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${policy.enabled ? "bg-green-500/20 text-green-300" : "bg-white/10 text-white/50"}`}>
                            {policy.enabled ? "Active" : "Désactivée"}
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-white/50">
                        L'IA scanne automatiquement le contenu publié et applique tes règles avant qu'il ne soit visible.
                    </p>
                </div>
                <Toggle checked={policy.enabled}
                        onChange={(v) => save({ enabled: v })}
                        testId="policy-enabled" />
            </div>

            {/* Scan targets */}
            <div className="surface-card">
                <div className="overline mb-3">Que faut-il scanner ?</div>
                <div className="grid gap-2 sm:grid-cols-2">
                    {SCAN_TARGETS.map((t) => (
                        <ToggleRow
                            key={t.key}
                            label={t.label} hint={t.hint}
                            checked={!!policy[t.key]}
                            disabled={saving}
                            onChange={(v) => save({ [t.key]: v })}
                            testId={`policy-${t.key}`}
                        />
                    ))}
                </div>
            </div>

            {/* Filters */}
            <div className="surface-card">
                <div className="overline mb-3">Filtres de contenu</div>
                <div className="grid gap-2 sm:grid-cols-2">
                    {FILTERS.map((f) => (
                        <ToggleRow
                            key={f.key}
                            label={f.label} hint={f.hint}
                            checked={!!policy[f.key]}
                            disabled={saving || f.locked}
                            onChange={(v) => save({ [f.key]: v })}
                            testId={`policy-${f.key}`}
                            locked={f.locked}
                        />
                    ))}
                </div>
            </div>

            {/* Per-violation actions */}
            <div className="surface-card">
                <div className="overline mb-3">Action par type de violation</div>
                <div className="space-y-2">
                    {[
                        { key: "action_nudity",      label: "Nudité" },
                        { key: "action_violence",    label: "Violence" },
                        { key: "action_hate_speech", label: "Haine" },
                        { key: "action_spam",        label: "Spam" },
                        { key: "action_scam_links",  label: "Arnaque" },
                        { key: "action_minors",      label: "Mineurs" },
                        { key: "action_default",     label: "Par défaut" },
                    ].map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                            <span className="text-sm text-white/80">{label}</span>
                            <div className="flex gap-1">
                                {ACTIONS.map((a) => (
                                    <button
                                        key={a}
                                        type="button"
                                        onClick={() => save({ [key]: a })}
                                        disabled={saving}
                                        data-testid={`${key}-${a}`}
                                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                                            policy[key] === a
                                                ? "bg-magenta/30 text-white"
                                                : "bg-white/[0.03] text-white/50 hover:text-white"
                                        }`}
                                    >
                                        {ACTION_LABEL[a]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Account-level + auto suspend */}
            <div className="surface-card">
                <div className="overline mb-3">Comptes & seuils</div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <ToggleRow
                        label="Identité fausse" hint="Détection profils trompeurs"
                        checked={!!policy.ban_fake_identity}
                        onChange={(v) => save({ ban_fake_identity: v })}
                        testId="policy-fake-id" />
                    <ToggleRow
                        label="Alerte mineur signup" hint="Email admin à chaque inscription suspecte"
                        checked={!!policy.alert_on_minor_signup}
                        onChange={(v) => save({ alert_on_minor_signup: v })}
                        testId="policy-alert-minor" />
                    <ToggleRow
                        label="Faire confiance aux créateurs vérifiés"
                        hint="Skipper les filtres pour les comptes ✓ (sauf mineurs)"
                        checked={!!policy.trust_verified_creators}
                        onChange={(v) => save({ trust_verified_creators: v })}
                        testId="policy-trust-verified" />
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                        <div>
                            <div className="text-sm font-semibold text-white">Auto-suspension après…</div>
                            <div className="text-[11px] text-white/50">Compte suspendu après N violations en attente</div>
                        </div>
                        <input
                            type="number" min={1} max={20}
                            value={policy.auto_suspend_after_violations || 3}
                            onChange={(e) => save({ auto_suspend_after_violations: Number(e.target.value) })}
                            data-testid="policy-auto-suspend"
                            className="w-16 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-center font-mono text-sm text-white"
                        />
                    </div>
                </div>
            </div>

            {/* Custom blacklist */}
            <div className="surface-card">
                <div className="overline mb-3 flex items-center justify-between">
                    <span>Liste noire de mots-clés</span>
                    <span className="text-[10px] text-white/40">{policy.keyword_blacklist?.length || 0} entrée(s)</span>
                </div>
                <div className="flex gap-2">
                    <input
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                        placeholder="Ajouter un mot ou expression…"
                        data-testid="policy-keyword-input"
                        className="input-base flex-1 text-sm"
                    />
                    <button
                        type="button"
                        onClick={addKeyword}
                        data-testid="policy-keyword-add"
                        className="btn-primary !px-3"
                    >
                        <Plus size={14} />
                    </button>
                </div>
                {policy.keyword_blacklist?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5" data-testid="policy-keyword-list">
                        {policy.keyword_blacklist.map((k) => (
                            <button
                                key={k}
                                type="button"
                                onClick={() => removeKeyword(k)}
                                data-testid={`policy-keyword-${k}`}
                                title="Cliquer pour retirer"
                                className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-200 transition-colors hover:bg-red-500/20"
                            >
                                {k} <X size={10} />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function Toggle({ checked, onChange, disabled, testId }) {
    return (
        <button
            type="button"
            onClick={() => !disabled && onChange(!checked)}
            disabled={disabled}
            data-testid={testId}
            aria-pressed={checked}
            className={`relative h-6 w-11 rounded-full transition-colors ${
                checked ? "bg-magenta" : "bg-white/10"
            } ${disabled ? "opacity-40" : ""}`}
        >
            <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : ""}`} />
        </button>
    );
}

function ToggleRow({ label, hint, checked, onChange, disabled, testId, locked }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
                    {label}
                    {locked && <ShieldCheck size={11} className="text-amber-300" />}
                </div>
                <div className="text-[11px] text-white/40">{hint}</div>
            </div>
            <Toggle checked={checked} onChange={onChange} disabled={disabled} testId={testId} />
        </div>
    );
}

// ===========================================================================
//  AI REPORTS
// ===========================================================================
function ReportsTab() {
    const [status, setStatus] = useState("pending");
    const [reports, setReports] = useState([]);
    const [busy, setBusy] = useState(null);

    const load = async () => {
        const { data } = await api.get("/admin/moderation/reports", { params: { status } });
        setReports(data);
    };
    useEffect(() => { load().catch(() => {}); }, [status]);

    const act = async (id, action) => {
        setBusy(id);
        try {
            await api.post(`/admin/moderation/reports/${id}/action`, { action });
            await load();
            toast.success(`Action "${action}" appliquée`);
        } finally { setBusy(null); }
    };

    return (
        <div data-testid="reports-tab">
            <div className="mb-3 flex gap-1 rounded-full border border-white/10 bg-black/30 p-1">
                {["pending", "approve", "delete_content", "ban_user", "dismiss"].map((s) => (
                    <button
                        key={s}
                        onClick={() => setStatus(s)}
                        data-testid={`reports-filter-${s}`}
                        className={`flex-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                            status === s ? "bg-magenta/25 text-magenta-100" : "text-white/50 hover:text-white"
                        }`}
                    >
                        {s === "pending" ? "En attente"
                            : s === "approve" ? "Approuvés"
                            : s === "delete_content" ? "Supprimés"
                            : s === "ban_user" ? "Bannis"
                            : "Rejetés"}
                    </button>
                ))}
            </div>
            {reports.length === 0 ? (
                <div className="rounded-2xl border border-white/5 bg-surface p-10 text-center text-sm text-white/40" data-testid="reports-empty">
                    Aucun rapport pour ce filtre ✨
                </div>
            ) : (
                <div className="space-y-2">
                    {reports.map((r) => (
                        <div key={r.report_id} className="surface-card border-amber-500/30" data-testid={`report-${r.report_id}`}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
                                        <span className={`rounded-full px-2 py-0.5 font-bold uppercase tracking-widest ${
                                            r.severity === "high" ? "bg-red-500/30 text-red-200"
                                                : r.severity === "medium" ? "bg-amber-500/30 text-amber-200"
                                                : "bg-white/10 text-white/60"
                                        }`}>{r.severity}</span>
                                        {r.categories?.map((c) => (
                                            <span key={c} className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/70">{c}</span>
                                        ))}
                                        <span className="text-[10px] text-white/40">{r.kind}</span>
                                    </div>
                                    <div className="text-sm font-semibold text-white">{r.summary || "—"}</div>
                                    {r.source_text && (
                                        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded-lg border border-white/5 bg-black/30 p-2 text-[11px] text-white/70">{r.source_text}</pre>
                                    )}
                                    <div className="mt-1 text-[10px] text-white/40">
                                        Cible : {r.target_user_id || "?"} {r.target_content_id ? `· content=${r.target_content_id}` : ""}
                                    </div>
                                </div>
                                {status === "pending" && (
                                    <div className="flex flex-col gap-1">
                                        <button onClick={() => act(r.report_id, "approve")} disabled={busy === r.report_id}
                                                data-testid={`report-approve-${r.report_id}`}
                                                className="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-[10px] font-semibold text-green-300 hover:bg-green-500/20">
                                            <CheckCircle2 size={10} className="mr-1 inline" /> Approuver
                                        </button>
                                        <button onClick={() => act(r.report_id, "delete_content")} disabled={busy === r.report_id || !r.target_content_id}
                                                data-testid={`report-delete-${r.report_id}`}
                                                className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[10px] font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-30">
                                            <Trash2 size={10} className="mr-1 inline" /> Supprimer
                                        </button>
                                        <button onClick={() => act(r.report_id, "suspend_user")} disabled={busy === r.report_id || !r.target_user_id}
                                                data-testid={`report-suspend-${r.report_id}`}
                                                className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/20 disabled:opacity-30">
                                            <UserX size={10} className="mr-1 inline" /> Suspendre
                                        </button>
                                        <button onClick={() => act(r.report_id, "ban_user")} disabled={busy === r.report_id || !r.target_user_id}
                                                data-testid={`report-ban-${r.report_id}`}
                                                className="rounded-full border border-red-500/40 bg-red-500/15 px-3 py-1 text-[10px] font-semibold text-red-200 hover:bg-red-500/25 disabled:opacity-30">
                                            <Ban size={10} className="mr-1 inline" /> Bannir
                                        </button>
                                        <button onClick={() => act(r.report_id, "dismiss")} disabled={busy === r.report_id}
                                                data-testid={`report-dismiss-${r.report_id}`}
                                                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-semibold text-white/60 hover:bg-white/[0.07]">
                                            <X size={10} className="mr-1 inline" /> Rejeter
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ===========================================================================
//  USER-FLAGGED CONTENT (existing)
// ===========================================================================
function FlaggedTab() {
    const [items, setItems] = useState([]);
    const [busy, setBusy] = useState(null);

    const load = async () => {
        const { data } = await api.get("/admin/content", { params: { flagged: true, limit: 100 } });
        setItems(data);
    };
    useEffect(() => { load().catch(() => {}); }, []);

    const approve = async (id) => {
        setBusy(id);
        try { await api.post(`/admin/content/${id}/approve`); await load(); }
        finally { setBusy(null); }
    };
    const del = async (id) => {
        if (!window.confirm("Supprimer définitivement ce contenu ?")) return;
        setBusy(id);
        try { await api.delete(`/admin/content/${id}`); await load(); }
        finally { setBusy(null); }
    };

    return (
        <div data-testid="flagged-tab">
            <div className="mb-4 flex items-center gap-2 text-sm text-white/60">
                <AlertTriangle size={14} className="text-amber-400" />
                {items.length} contenu(s) signalé(s) par les fans
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {items.map((c) => (
                    <div key={c.content_id} data-testid={`flagged-${c.content_id}`} className="surface-card border-amber-500/30">
                        <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10">
                            <img src={c.media_url} alt={c.title} className="h-full w-full object-cover" />
                            <div className="absolute right-2 top-2 rounded-full bg-red-500/80 px-2 py-0.5 text-[10px] font-bold">
                                <Flag size={10} className="mr-1 inline" /> {c.flag_count}
                            </div>
                        </div>
                        <div className="mt-3">
                            <div className="font-semibold">{c.title}</div>
                            <div className="text-xs text-white/40">Par {c.creator?.display_name || "?"}</div>
                        </div>
                        <div className="mt-4 flex gap-2">
                            <button onClick={() => approve(c.content_id)} disabled={busy === c.content_id}
                                    data-testid={`mod-approve-${c.content_id}`}
                                    className="flex-1 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-300 hover:bg-green-500/20">
                                <CheckCircle2 size={12} className="mr-1 inline" /> Approuver
                            </button>
                            <button onClick={() => del(c.content_id)} disabled={busy === c.content_id}
                                    data-testid={`mod-delete-${c.content_id}`}
                                    className="flex-1 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/20">
                                <Trash2 size={12} className="mr-1 inline" /> Supprimer
                            </button>
                        </div>
                    </div>
                ))}
                {items.length === 0 && (
                    <div className="col-span-full rounded-2xl border border-white/5 bg-surface p-10 text-center text-sm text-white/40" data-testid="admin-mod-empty">
                        Aucun contenu signalé — tout est clean ✨
                    </div>
                )}
            </div>
        </div>
    );
}
