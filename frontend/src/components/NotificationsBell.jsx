import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Bell, MessageCircle, Heart, CreditCard, Sparkles } from "lucide-react";

const ICONS = {
    message: MessageCircle,
    tip: Heart,
    payment: CreditCard,
    subscription: Sparkles,
    welcome: Sparkles,
};

export default function NotificationsBell() {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [unread, setUnread] = useState(0);
    const wrapRef = useRef(null);

    const fetchAll = async () => {
        try {
            const { data } = await api.get("/notifications", { params: { limit: 15 } });
            setItems(data.items);
            setUnread(data.unread);
        } catch {}
    };

    const fetchCount = async () => {
        try {
            const { data } = await api.get("/notifications/unread-count");
            setUnread(data.unread);
        } catch {}
    };

    useEffect(() => {
        if (!user) return;
        fetchAll();
        const id = setInterval(fetchCount, 30000);
        return () => clearInterval(id);
    }, [user]);

    useEffect(() => {
        const onClick = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        if (open) document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, [open]);

    const toggle = async () => {
        const next = !open;
        setOpen(next);
        if (next) {
            await fetchAll();
            try { await api.post("/notifications/mark-read"); } catch {}
            setUnread(0);
        }
    };

    if (!user) return null;
    return (
        <div ref={wrapRef} className="relative">
            <button
                data-testid="notifications-bell"
                onClick={toggle}
                className="relative rounded-full border border-white/10 bg-white/[0.03] p-2 text-white/70 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white"
                aria-label="Notifications"
            >
                <Bell size={16} />
                {unread > 0 && (
                    <span data-testid="notifications-badge"
                          className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-magenta px-1 text-[10px] font-bold text-white shadow-glow">
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>
            {open && (
                <div data-testid="notifications-panel"
                     className="fixed sm:absolute right-2 sm:right-0 left-2 sm:left-auto top-16 sm:top-auto sm:mt-2 sm:w-[340px] max-h-[calc(100vh-6rem)] overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-xl backdrop-blur-xl z-50">
                    <div className="border-b border-white/5 px-4 py-3">
                        <div className="overline">Notifications</div>
                        <h3 className="font-display text-base font-semibold">Activité récente</h3>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto divide-y divide-white/5">
                        {items.length === 0 && (
                            <div className="px-4 py-10 text-center text-sm text-white/40" data-testid="notifications-empty">
                                Pas encore d'activité.
                            </div>
                        )}
                        {items.map((n) => {
                            const Icon = ICONS[n.kind] || Bell;
                            return (
                                <div key={n.notification_id} className={`flex gap-3 px-4 py-3 ${!n.read ? "bg-magenta/5" : ""}`}
                                     data-testid={`notification-item-${n.notification_id}`}>
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-magenta/30 bg-magenta/10 text-magenta-200">
                                        <Icon size={14} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-semibold">{n.title}</div>
                                        <div className="line-clamp-2 text-xs text-white/50">{n.body}</div>
                                        <div className="mt-1 text-[10px] uppercase tracking-widest text-white/30">
                                            {timeAgo(n.created_at)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="border-t border-white/5 p-2">
                        <Link to="/messages" onClick={() => setOpen(false)}
                              className="block rounded-xl px-3 py-2 text-center text-xs text-white/60 hover:bg-white/5 hover:text-white">
                            Voir tous les messages
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}

function timeAgo(iso) {
    const d = new Date(iso);
    const s = (Date.now() - d.getTime()) / 1000;
    if (s < 60) return "à l'instant";
    if (s < 3600) return `${Math.floor(s / 60)}min`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}j`;
}
