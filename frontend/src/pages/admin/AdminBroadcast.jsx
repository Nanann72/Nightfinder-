import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Mail, Send, Eye, Users, AlertTriangle, Clock, ArrowRight, Sparkles } from "lucide-react";

const SEGMENTS = [
    { id: "all",                label: "Tous les utilisateurs" },
    { id: "fans",               label: "Fans uniquement" },
    { id: "creators",           label: "Créatrices/créateurs" },
    { id: "active_subscribers", label: "Abonnés actifs" },
    { id: "inactive_30d",       label: "Inactifs 30j+" },
];

/**
 * Admin mass-email composer with segment-targeting + dry-run preview.
 *
 *  - Pick a segment → fetch live recipient count
 *  - Compose subject + HTML body (basic textarea — markdown-style rendering
 *    happens server-side via the branded email layout)
 *  - Send a test email to yourself before broadcasting
 *  - Once broadcast queued, watch progress on the right column
 */
export default function AdminBroadcast() {
    const [segment, setSegment] = useState("all");
    const [count, setCount] = useState(null);
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [ctaText, setCtaText] = useState("");
    const [ctaUrl, setCtaUrl] = useState("");
    const [optedInOnly, setOptedInOnly] = useState(true);
    const [testEmail, setTestEmail] = useState("");
    const [sending, setSending] = useState(false);
    const [history, setHistory] = useState([]);

    const fetchCount = async (seg = segment) => {
        setCount(null);
        try {
            const { data } = await api.get("/admin/broadcast/preview", {
                params: { segment: seg, only_email_opted_in: optedInOnly },
            });
            setCount(data.count);
        } catch { setCount("?"); }
    };
    const fetchHistory = async () => {
        try {
            const { data } = await api.get("/admin/broadcasts");
            setHistory(Array.isArray(data) ? data : []);
        } catch { /* noop */ }
    };
    useEffect(() => { fetchCount(); fetchHistory(); /* eslint-disable-line */ }, [segment, optedInOnly]);

    const sendTest = async () => {
        if (!testEmail || !subject || !body) {
            toast.error("Email test, sujet et corps requis"); return;
        }
        setSending(true);
        try {
            await api.post("/admin/broadcast/send", {
                subject, body_html: body, segment,
                only_email_opted_in: optedInOnly,
                cta_text: ctaText || null, cta_url: ctaUrl || null,
                test_email: testEmail,
            });
            toast.success(`Email test envoyé à ${testEmail}`);
        } catch (e) {
            toast.error("Échec : " + (e.response?.data?.detail || "erreur"));
        } finally { setSending(false); }
    };

    const broadcast = async () => {
        if (!subject || !body) { toast.error("Sujet et corps requis"); return; }
        if (!window.confirm(`Confirmer l'envoi à ${count} destinataires ?`)) return;
        setSending(true);
        try {
            const { data } = await api.post("/admin/broadcast/send", {
                subject, body_html: body, segment,
                only_email_opted_in: optedInOnly,
                cta_text: ctaText || null, cta_url: ctaUrl || null,
            });
            toast.success(`Broadcast lancé · ${data.queued} destinataires en file`);
            setSubject(""); setBody(""); setCtaText(""); setCtaUrl("");
            await fetchHistory();
        } catch (e) {
            toast.error("Échec : " + (e.response?.data?.detail || "erreur"));
        } finally { setSending(false); }
    };

    return (
        <div data-testid="admin-broadcast" className="grid gap-6 lg:grid-cols-3">
            {/* Composer */}
            <div className="space-y-4 lg:col-span-2">
                <h1 className="font-display text-2xl font-bold flex items-center gap-2">
                    <Mail size={20} className="text-magenta-200" /> Email en masse
                </h1>
                <p className="text-sm text-white/50">
                    Envoie un email à un segment précis. Toujours respecter le RGPD —
                    seuls les utilisateurs opt-in reçoivent les emails marketing.
                </p>

                {/* Segment + count */}
                <div className="surface-card">
                    <div className="overline mb-3">Audience</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {SEGMENTS.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => setSegment(s.id)}
                                data-testid={`broadcast-seg-${s.id}`}
                                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                                    segment === s.id
                                        ? "border-magenta/60 bg-magenta/15"
                                        : "border-white/10 bg-white/[0.02] hover:border-white/30"
                                }`}
                            >
                                <span className="text-sm">{s.label}</span>
                                {segment === s.id && <Sparkles size={12} className="text-magenta-200" />}
                            </button>
                        ))}
                    </div>
                    <label className="mt-3 flex items-center gap-2 text-xs text-white/70">
                        <input
                            type="checkbox" checked={optedInOnly}
                            onChange={(e) => setOptedInOnly(e.target.checked)}
                            data-testid="broadcast-opted-in"
                            className="h-3.5 w-3.5 accent-magenta"
                        />
                        Seulement les utilisateurs opt-in (recommandé)
                    </label>
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-magenta/30 bg-magenta/10 p-2.5 text-sm">
                        <Users size={14} className="text-magenta-200" />
                        <span className="text-magenta-100" data-testid="broadcast-count">
                            {count === null ? "…" : `${count} destinataire(s)`}
                        </span>
                    </div>
                </div>

                {/* Composer */}
                <div className="surface-card">
                    <div className="overline mb-3">Composition</div>
                    <input
                        value={subject} onChange={(e) => setSubject(e.target.value)}
                        placeholder="Sujet de l'email"
                        maxLength={200}
                        data-testid="broadcast-subject"
                        className="input-base text-sm font-semibold"
                    />
                    <textarea
                        value={body} onChange={(e) => setBody(e.target.value)}
                        placeholder="Corps de l'email — HTML autorisé (<b>, <a href=...>, <p>, <ul>, <li>…)"
                        rows={10}
                        maxLength={20000}
                        data-testid="broadcast-body"
                        className="input-base mt-2 text-sm font-mono"
                    />
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <input
                            value={ctaText} onChange={(e) => setCtaText(e.target.value)}
                            placeholder="Texte du bouton (optionnel)" maxLength={60}
                            data-testid="broadcast-cta-text"
                            className="input-base text-sm"
                        />
                        <input
                            value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)}
                            placeholder="URL du bouton (https://…)" maxLength={500}
                            data-testid="broadcast-cta-url"
                            className="input-base text-sm"
                        />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
                        <AlertTriangle size={12} />
                        Vérifie toujours avec un email test avant de lancer un broadcast.
                    </div>
                </div>

                {/* Test + Send */}
                <div className="surface-card">
                    <div className="overline mb-3">Test & envoi</div>
                    <div className="flex flex-wrap gap-2">
                        <input
                            value={testEmail} onChange={(e) => setTestEmail(e.target.value)}
                            placeholder="ton@email.com"
                            type="email"
                            data-testid="broadcast-test-email"
                            className="input-base !flex-1 text-sm"
                        />
                        <button onClick={sendTest} disabled={sending}
                                data-testid="broadcast-send-test"
                                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/20">
                            <Eye size={12} /> Envoyer un test
                        </button>
                    </div>
                    <button
                        onClick={broadcast} disabled={sending || !subject || !body || count === 0 || count === null}
                        data-testid="broadcast-send-all"
                        className="btn-primary mt-3 w-full justify-center"
                    >
                        <Send size={14} /> {sending ? "Envoi en cours…" : `Envoyer à ${count ?? "?"} destinataires`}
                    </button>
                </div>
            </div>

            {/* History */}
            <div className="space-y-3">
                <div className="overline flex items-center gap-1.5"><Clock size={11} /> Historique</div>
                {history.length === 0 ? (
                    <div className="rounded-2xl border border-white/5 bg-surface p-6 text-center text-xs text-white/40">
                        Pas encore de broadcast.
                    </div>
                ) : history.slice(0, 12).map((b) => (
                    <div key={b.broadcast_id} data-testid={`broadcast-history-${b.broadcast_id}`}
                         className="surface-card !p-3">
                        <div className="flex items-center justify-between gap-1">
                            <div className="text-xs font-semibold text-white truncate">{b.subject}</div>
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                                b.status === "done" ? "bg-green-500/20 text-green-300" : "bg-amber-500/20 text-amber-200"
                            }`}>{b.status}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-white/50">
                            <Users size={10} /> {b.sent_count ?? 0}/{b.recipients_count}
                            <ArrowRight size={10} /> {b.segment}
                        </div>
                        <div className="text-[10px] text-white/30">
                            {new Date(b.created_at).toLocaleString("fr-FR")}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
