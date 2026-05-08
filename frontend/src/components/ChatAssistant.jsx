import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Floating AI support chat bubble. Bottom-right on desktop and mobile.
 * - Persists session_id in localStorage so the same conversation resumes
 *   on page reload.
 * - Public endpoint (no auth required) — anyone can ask questions.
 */
const STORAGE_KEY = "meandyou_chat_session";
const SUGGESTIONS = [
    "Comment fonctionnent les coins ?",
    "Comment m'abonner à une créatrice ?",
    "Comment débloquer une photo ?",
    "Comment devenir créatrice ?",
];

function getSessionId() {
    try {
        let s = localStorage.getItem(STORAGE_KEY);
        if (!s) {
            s = "ch_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
            localStorage.setItem(STORAGE_KEY, s);
        }
        return s;
    } catch { return "ch_" + Date.now().toString(36); }
}

export default function ChatAssistant() {
    const [open, setOpen] = useState(false);
    const [msg, setMsg] = useState("");
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const feedRef = useRef(null);
    const sessionId = useRef(getSessionId());

    // Load history on first open
    useEffect(() => {
        if (!open || messages.length > 0) return;
        (async () => {
            try {
                const { data } = await api.get(`/chat/history?session_id=${encodeURIComponent(sessionId.current)}`);
                if (Array.isArray(data) && data.length > 0) {
                    setMessages(data.map(m => ({ role: m.role, content: m.content })));
                } else {
                    setMessages([{
                        role: "assistant",
                        content: "Salut ! Je suis Lou, l'assistante de me&you. Je peux t'expliquer les coins, les abonnements, les retraits, ou te guider sur le site. Pose-moi ta question ✨",
                    }]);
                }
            } catch {
                setMessages([{
                    role: "assistant",
                    content: "Salut ! Pose-moi ta question, je fais au mieux pour t'aider.",
                }]);
            }
        })();
    }, [open, messages.length]);

    useEffect(() => {
        if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }, [messages, loading]);

    const send = async (text) => {
        const body = (text ?? msg).trim();
        if (!body || loading) return;
        setMsg(""); setErr("");
        setMessages(m => [...m, { role: "user", content: body }]);
        setLoading(true);
        try {
            const { data } = await api.post("/chat/ask", {
                session_id: sessionId.current,
                message: body,
            });
            setMessages(m => [...m, { role: "assistant", content: data.reply }]);
        } catch (e) {
            const d = e.response?.data?.detail;
            setErr(typeof d === "string" ? d : (e.message || "Erreur"));
        } finally { setLoading(false); }
    };

    return (
        <>
            {/* Floating bubble */}
            {!open && (
                <button
                    onClick={() => setOpen(true)}
                    data-testid="chat-open-btn"
                    aria-label="Ouvrir l'assistant"
                    className="fixed bottom-20 right-4 z-[60] inline-flex items-center gap-2 rounded-full border border-magenta/40 bg-gradient-to-br from-magenta-500 to-magenta-700 px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_28px_rgba(217,70,239,0.45)] hover:scale-105 transition-transform sm:bottom-20"
                >
                    <MessageCircle size={18} />
                    <span className="hidden sm:inline">Besoin d'aide ?</span>
                </button>
            )}

            {/* Panel */}
            {open && (
                <div
                    data-testid="chat-panel"
                    className="fixed bottom-20 right-4 z-[60] flex w-[calc(100vw-2rem)] max-w-md flex-col rounded-2xl border border-magenta/30 bg-surface shadow-2xl sm:bottom-6 sm:right-6"
                    style={{ height: "min(600px, calc(100vh - 6rem))" }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between rounded-t-2xl border-b border-white/10 bg-gradient-to-r from-magenta/20 to-magenta/5 px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-magenta/40 bg-magenta/20">
                                <Sparkles size={16} className="text-magenta-200" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">Lou · Assistante me&you</div>
                                <div className="text-[11px] text-white/50">Propulsé par IA · Réponses ~3s</div>
                            </div>
                        </div>
                        <button onClick={() => setOpen(false)} data-testid="chat-close-btn"
                                className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
                            <X size={16} />
                        </button>
                    </div>

                    {/* Messages */}
                    <div ref={feedRef} data-testid="chat-feed" className="flex-1 space-y-3 overflow-y-auto p-4">
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                                    m.role === "user"
                                        ? "bg-magenta/25 border border-magenta/40 text-white"
                                        : "bg-white/[0.04] border border-white/10 text-white/90"
                                }`} data-testid={`chat-msg-${m.role}-${i}`}>
                                    {m.content}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start" data-testid="chat-loading">
                                <div className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-magenta-300" />
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-magenta-300 [animation-delay:0.15s]" />
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-magenta-300 [animation-delay:0.3s]" />
                                </div>
                            </div>
                        )}
                        {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300" data-testid="chat-error">{err}</div>}
                    </div>

                    {/* Suggestions (only when conversation is fresh) */}
                    {messages.length <= 1 && !loading && (
                        <div className="flex flex-wrap gap-1.5 border-t border-white/5 px-3 pt-3" data-testid="chat-suggestions">
                            {SUGGESTIONS.map((s, i) => (
                                <button key={i} onClick={() => send(s)}
                                        data-testid={`chat-suggestion-${i}`}
                                        className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/70 hover:border-magenta/40 hover:bg-magenta/10 hover:text-white transition-colors">
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Composer */}
                    <form
                        onSubmit={(e) => { e.preventDefault(); send(); }}
                        className="flex items-end gap-2 border-t border-white/10 p-3"
                    >
                        <textarea
                            value={msg}
                            onChange={e => setMsg(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                            }}
                            placeholder="Pose ta question…"
                            maxLength={2000}
                            rows={1}
                            className="input-base max-h-28 resize-none text-sm"
                            data-testid="chat-input"
                        />
                        <button type="submit" disabled={!msg.trim() || loading}
                                data-testid="chat-send-btn"
                                className="btn-primary shrink-0 px-3 py-2 disabled:opacity-50">
                            <Send size={14} />
                        </button>
                    </form>
                </div>
            )}
        </>
    );
}
