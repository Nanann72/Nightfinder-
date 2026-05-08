import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ShieldAlert, Search, Mail, ExternalLink, Check, X, Eye, Clock, AlertTriangle, MessageSquare } from "lucide-react";
import { toast } from "sonner";

const STATUS = [
    { id: "all", label: "Tous", color: "border-white/10" },
    { id: "pending", label: "En attente", color: "border-amber-500/40 text-amber-200" },
    { id: "in_review", label: "En cours", color: "border-blue-500/40 text-blue-200" },
    { id: "approved", label: "Approuvés", color: "border-emerald-500/40 text-emerald-200" },
    { id: "rejected", label: "Rejetés", color: "border-red-500/40 text-red-200" },
];

export default function AdminDMCA() {
    const [data, setData] = useState({ items: [], counts: {}, total: 0 });
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [active, setActive] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const params = filter === "all" ? {} : { status: filter };
            const { data } = await api.get("/admin/dmca", { params });
            setData(data);
        } catch (e) { toast.error("Erreur chargement"); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [filter]);

    const filtered = data.items.filter(r => {
        if (!search) return true;
        const q = search.toLowerCase();
        return [r.claimant_name, r.claimant_email, r.target_url, r.target_creator, r.report_id]
            .some(v => v && v.toLowerCase().includes(q));
    });

    return (
        <div className="space-y-6" data-testid="admin-dmca">
            <header className="flex items-start justify-between gap-3">
                <div>
                    <div className="overline">Modération</div>
                    <h1 className="mt-1 font-display text-3xl font-bold flex items-center gap-2">
                        <ShieldAlert size={26} className="text-magenta-300" /> DMCA Takedown
                    </h1>
                    <p className="mt-1 text-sm text-white/55">{data.total} signalements au total.</p>
                </div>
            </header>

            {/* Counters */}
            <div className="grid gap-3 sm:grid-cols-4">
                {STATUS.filter(s => s.id !== "all").map(s => (
                    <button key={s.id} onClick={() => setFilter(s.id)}
                            data-testid={`dmca-stat-${s.id}`}
                            className={`rounded-2xl border bg-white/[0.02] p-4 text-left transition-all hover:border-magenta/30 ${
                                filter === s.id ? "border-magenta/50 bg-magenta/5" : "border-white/[0.06]"
                            }`}>
                        <div className="text-[10px] uppercase tracking-widest text-white/40">{s.label}</div>
                        <div className="mt-1 font-display text-2xl font-bold">{data.counts[s.id] || 0}</div>
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
                {STATUS.map(s => (
                    <button
                        key={s.id}
                        onClick={() => setFilter(s.id)}
                        data-testid={`dmca-filter-${s.id}`}
                        className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-all ${
                            filter === s.id
                                ? "border-magenta bg-magenta/15 text-white"
                                : "border-white/10 bg-white/[0.02] text-white/55 hover:border-white/20 hover:text-white"
                        }`}
                    >
                        {s.label}{s.id !== "all" ? ` · ${data.counts[s.id] || 0}` : ""}
                    </button>
                ))}
                <div className="relative ml-auto">
                    <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Rechercher…"
                        data-testid="dmca-search"
                        className="rounded-full border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-xs text-white placeholder:text-white/35 focus:border-magenta/50 focus:outline-none"
                    />
                </div>
            </div>

            {/* List */}
            <div className="rounded-3xl border border-white/[0.06] bg-[var(--bg-surface)]">
                {loading ? (
                    <div className="p-10 text-center text-white/40">Chargement…</div>
                ) : filtered.length === 0 ? (
                    <div className="p-10 text-center text-white/45" data-testid="dmca-empty">
                        Aucun signalement {filter !== "all" ? `(${STATUS.find(s => s.id === filter)?.label.toLowerCase()})` : ""}.
                    </div>
                ) : (
                    <div className="divide-y divide-white/[0.05]">
                        {filtered.map(r => (
                            <button
                                key={r.report_id}
                                onClick={() => setActive(r)}
                                data-testid={`dmca-row-${r.report_id}`}
                                className="flex w-full items-start gap-4 p-4 text-left transition-colors hover:bg-white/[0.02]"
                            >
                                <StatusBadge status={r.status} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                                        {r.claimant_name}
                                        <span className="text-white/40 font-normal text-xs">· {r.claimant_email}</span>
                                    </div>
                                    <div className="mt-1 truncate font-mono text-[11px] text-white/55">{r.target_url}</div>
                                    <div className="mt-1 line-clamp-1 text-xs text-white/45">{r.description}</div>
                                </div>
                                <div className="text-right text-[11px] text-white/40 shrink-0">
                                    <div>{new Date(r.created_at).toLocaleDateString("fr-FR")}</div>
                                    <div className="font-mono">{r.report_id.slice(0, 8)}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {active && <ReportDrawer report={active} onClose={() => setActive(null)} onUpdated={() => { setActive(null); load(); }} />}
        </div>
    );
}

function StatusBadge({ status }) {
    const map = {
        pending: { icon: Clock, color: "border-amber-500/40 bg-amber-500/10 text-amber-200", label: "En attente" },
        in_review: { icon: Eye, color: "border-blue-500/40 bg-blue-500/10 text-blue-200", label: "En cours" },
        approved: { icon: Check, color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200", label: "Approuvé" },
        rejected: { icon: X, color: "border-red-500/40 bg-red-500/10 text-red-200", label: "Rejeté" },
    };
    const m = map[status] || map.pending;
    const Icon = m.icon;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${m.color}`}>
            <Icon size={10} /> {m.label}
        </span>
    );
}

function ReportDrawer({ report, onClose, onUpdated }) {
    const [notes, setNotes] = useState(report.admin_notes || "");
    const [saving, setSaving] = useState(false);

    const update = async (status) => {
        if (status === "approved" && !window.confirm("Approuver ce signalement et notifier le·la déclarant·e ?")) return;
        if (status === "rejected" && !window.confirm("Rejeter ce signalement et notifier le·la déclarant·e ?")) return;
        setSaving(true);
        try {
            await api.patch(`/admin/dmca/${report.report_id}`, { status, admin_notes: notes });
            toast.success("Mis à jour");
            onUpdated();
        } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
        finally { setSaving(false); }
    };

    const saveNotes = async () => {
        setSaving(true);
        try {
            await api.patch(`/admin/dmca/${report.report_id}`, { admin_notes: notes });
            toast.success("Notes sauvegardées");
        } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
        finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex" data-testid="dmca-drawer">
            <div className="flex-1 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="w-full max-w-xl overflow-y-auto bg-[var(--bg-base)] border-l border-white/[0.06] shadow-2xl">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-[var(--bg-base)]/90 px-6 py-4 backdrop-blur">
                    <div>
                        <div className="overline">Signalement DMCA</div>
                        <div className="font-mono text-xs text-white/45">{report.report_id}</div>
                    </div>
                    <button onClick={onClose} data-testid="dmca-drawer-close"
                            className="rounded-full p-1.5 text-white/50 hover:bg-white/5 hover:text-white">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    <div className="flex items-center gap-2">
                        <StatusBadge status={report.status} />
                        <span className="text-xs text-white/45">
                            Déposé le {new Date(report.created_at).toLocaleString("fr-FR")}
                        </span>
                    </div>

                    <Section title="Déclarant·e">
                        <Row label="Nom" value={report.claimant_name} />
                        <Row label="Email" value={
                            <a href={`mailto:${report.claimant_email}`} className="inline-flex items-center gap-1 text-magenta-200 hover:text-white">
                                <Mail size={11} /> {report.claimant_email}
                            </a>
                        } />
                        {report.claimant_company && <Row label="Société" value={report.claimant_company} />}
                        <Row label="Rôle" value={report.claimant_role} />
                    </Section>

                    <Section title="Contenu visé">
                        <Row label="URL" value={
                            <a href={report.target_url} target="_blank" rel="noopener noreferrer"
                               className="inline-flex items-center gap-1 break-all font-mono text-xs text-magenta-200 hover:text-white">
                                {report.target_url} <ExternalLink size={10} />
                            </a>
                        } />
                        {report.target_creator && <Row label="Créatrice" value={report.target_creator} />}
                        {report.original_work_url && <Row label="Œuvre originale" value={
                            <a href={report.original_work_url} target="_blank" rel="noopener noreferrer"
                               className="inline-flex items-center gap-1 break-all font-mono text-xs text-magenta-200 hover:text-white">
                                {report.original_work_url} <ExternalLink size={10} />
                            </a>
                        } />}
                        <div className="mt-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                            <div className="overline mb-1.5">Description</div>
                            <p className="whitespace-pre-line text-sm leading-relaxed text-white/80">{report.description}</p>
                        </div>
                    </Section>

                    <Section title="Métadonnées">
                        {report.ip_address && <Row label="IP" value={<span className="font-mono">{report.ip_address}</span>} />}
                        {report.user_agent && <Row label="User-Agent" value={<span className="font-mono text-xs">{report.user_agent}</span>} />}
                    </Section>

                    {/* Notes */}
                    <div>
                        <label className="overline mb-2 block flex items-center gap-1.5">
                            <MessageSquare size={11} /> Notes admin
                        </label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={4}
                            maxLength={2000}
                            data-testid="dmca-admin-notes"
                            placeholder="Justification, échanges email, mesures prises…"
                            className="input-base resize-none"
                        />
                        <div className="mt-2 flex justify-end">
                            <button onClick={saveNotes} disabled={saving} className="btn-ghost text-xs"
                                    data-testid="dmca-save-notes">
                                Sauvegarder les notes
                            </button>
                        </div>
                    </div>

                    {/* Actions */}
                    {report.status !== "approved" && report.status !== "rejected" && (
                        <div className="rounded-3xl border border-magenta/20 bg-magenta/[0.04] p-5">
                            <div className="overline mb-3 flex items-center gap-1.5"><AlertTriangle size={11} /> Décision</div>
                            <div className="grid gap-2 sm:grid-cols-3">
                                <button
                                    onClick={() => update("in_review")} disabled={saving || report.status === "in_review"}
                                    data-testid="dmca-action-in-review"
                                    className="rounded-full border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-xs font-semibold text-blue-200 hover:bg-blue-500/20 transition-all disabled:opacity-40">
                                    <Eye size={11} className="mr-1 inline" /> En cours d'examen
                                </button>
                                <button
                                    onClick={() => update("approved")} disabled={saving}
                                    data-testid="dmca-action-approve"
                                    className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 transition-all disabled:opacity-40">
                                    <Check size={11} className="mr-1 inline" /> Approuver
                                </button>
                                <button
                                    onClick={() => update("rejected")} disabled={saving}
                                    data-testid="dmca-action-reject"
                                    className="rounded-full border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20 transition-all disabled:opacity-40">
                                    <X size={11} className="mr-1 inline" /> Rejeter
                                </button>
                            </div>
                            <p className="mt-3 text-[11px] text-white/40">
                                L'approbation/rejet déclenchera un email automatique au·à la déclarant·e.
                            </p>
                        </div>
                    )}

                    {report.resolved_at && (
                        <div className="text-center text-xs text-white/45">
                            Résolu le {new Date(report.resolved_at).toLocaleString("fr-FR")}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Section({ title, children }) {
    return (
        <section>
            <div className="overline mb-2">{title}</div>
            <div className="space-y-1.5">{children}</div>
        </section>
    );
}

function Row({ label, value }) {
    return (
        <div className="grid grid-cols-3 gap-3 text-sm">
            <span className="text-[11px] text-white/40 uppercase tracking-widest">{label}</span>
            <span className="col-span-2 text-white/85">{value}</span>
        </div>
    );
}
