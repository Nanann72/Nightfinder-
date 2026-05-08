import { NavLink, Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import {
    Home, Compass, Bell, MessageCircle, Bookmark, Wallet, User, Settings,
    Crown, Heart, BarChart3, Radio, ShieldCheck, LogOut, Plus, MoreHorizontal,
    Coins, X
} from "lucide-react";

/**
 * Fanvue-style left sidebar nav.
 * Desktop: fixed 260px column on the left.
 * Mobile: drawer triggered from a hamburger handled by AuthedShell.
 */
export default function SidebarNav({ open, onClose }) {
    const { user, logout } = useAuth();
    const loc = useLocation();
    const [unread, setUnread] = useState(0);
    const [balance, setBalance] = useState(null);

    useEffect(() => { onClose?.(); }, [loc.pathname]); // eslint-disable-line

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        const tick = async () => {
            try {
                const { data } = await api.get("/wallet");
                if (!cancelled) setBalance(data.coin_balance);
            } catch {}
        };
        tick();
        const id = setInterval(tick, 15000);
        const handler = () => tick();
        window.addEventListener("wallet-refresh", handler);
        return () => { cancelled = true; clearInterval(id); window.removeEventListener("wallet-refresh", handler); };
    }, [user]);

    const isCreator = user?.role === "creator";
    const isAdmin = user?.role === "admin";

    const primary = [
        { to: "/feed", label: "Accueil", icon: Home, testId: "side-home" },
        { to: "/createurs", label: "Découvrir", icon: Compass, testId: "side-discover" },
        { to: "/live", label: "Live", icon: Radio, testId: "side-live" },
        { to: "/messages", label: "Messages", icon: MessageCircle, testId: "side-messages", badge: unread > 0 ? unread : null },
        { to: "/subscriptions", label: "Abonnements", icon: Heart, testId: "side-subscriptions" },
        { to: "/wallet", label: "Wallet", icon: Wallet, testId: "side-wallet" },
        ...(isCreator ? [
            { to: "/dashboard", label: "Tableau de bord", icon: BarChart3, testId: "side-dashboard" },
            { to: "/dashboard/analytics", label: "Analytics", icon: BarChart3, testId: "side-analytics" },
        ] : []),
        ...(isAdmin ? [
            { to: "/admin", label: "Admin", icon: ShieldCheck, testId: "side-admin" },
        ] : []),
        { to: "/settings/profile", label: "Paramètres", icon: Settings, testId: "side-settings" },
    ];

    return (
        <>
            {/* Mobile drawer overlay */}
            {open && (
                <div
                    onClick={onClose}
                    className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
                    data-testid="sidebar-overlay"
                />
            )}

            <aside
                data-testid="sidebar-nav"
                className={`fixed inset-y-0 left-0 z-50 w-[260px] shrink-0 border-r border-white/[0.06] bg-[var(--bg-base)] transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
                    open ? "translate-x-0" : "-translate-x-full"
                }`}
            >
                <div className="flex h-full flex-col">
                    {/* Logo */}
                    <div className="flex items-center justify-between p-5">
                        <Link to="/feed" className="flex items-center gap-2" onClick={onClose}>
                            <span className="font-display text-2xl font-bold tracking-tight">
                                me<span className="text-magenta">&</span>you
                            </span>
                        </Link>
                        <button onClick={onClose} className="rounded-full p-1.5 text-white/50 hover:text-white lg:hidden">
                            <X size={18} />
                        </button>
                    </div>

                    {/* Primary nav */}
                    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
                        {primary.map((it) => (
                            <SideLink key={it.to} {...it} />
                        ))}

                        {isCreator && (
                            <Link
                                to="/live/start"
                                onClick={onClose}
                                data-testid="side-go-live"
                                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-red-500 to-pink-600 px-5 py-3 font-semibold text-white shadow-lg shadow-red-500/25 transition-transform hover:scale-[1.02]"
                            >
                                <Radio size={16} className="animate-pulse" /> Aller en Live
                            </Link>
                        )}

                        {!isCreator && (
                            <Link
                                to="/wallet"
                                onClick={onClose}
                                data-testid="side-buy-coins"
                                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-magenta to-magenta-dark px-5 py-3 font-semibold text-white shadow-lg shadow-magenta/25 transition-transform hover:scale-[1.02]"
                            >
                                <Coins size={16} /> Acheter des coins
                            </Link>
                        )}
                    </nav>

                    {/* Profile chip footer */}
                    {user && (
                        <div className="border-t border-white/[0.06] p-3">
                            <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-2.5">
                                <Link to={isCreator ? "/dashboard" : "/settings/profile"} className="flex flex-1 items-center gap-2.5 min-w-0" onClick={onClose}>
                                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-2xl border border-magenta/30 bg-magenta/15">
                                        {user.avatar_url ? (
                                            <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-sm font-bold">
                                                {(user.name || user.email)[0]?.toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="truncate text-sm font-semibold text-white">{user.name || "—"}</div>
                                        <div className="flex items-center gap-1 text-[11px] text-magenta-200">
                                            <Coins size={10} /> {(balance ?? user.coin_balance ?? 0).toLocaleString("fr-FR")}
                                        </div>
                                    </div>
                                </Link>
                                <button
                                    onClick={() => { onClose?.(); logout?.(); }}
                                    data-testid="side-logout"
                                    className="rounded-full p-1.5 text-white/40 hover:bg-white/5 hover:text-red-300 transition-colors"
                                    title="Déconnexion"
                                >
                                    <LogOut size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}

function SideLink({ to, label, icon: Icon, testId, badge }) {
    return (
        <NavLink
            to={to}
            data-testid={testId}
            end={to === "/feed"}
            className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] transition-all ${
                isActive
                    ? "bg-magenta/15 text-white"
                    : "text-white/65 hover:bg-white/[0.04] hover:text-white"
            }`}
        >
            {({ isActive }) => (
                <>
                    <Icon size={20} className={isActive ? "text-magenta-200" : ""} />
                    <span className="flex-1 font-medium">{label}</span>
                    {badge && (
                        <span className="rounded-full bg-magenta px-2 py-0.5 text-[10px] font-bold text-white">
                            {badge > 99 ? "99+" : badge}
                        </span>
                    )}
                </>
            )}
        </NavLink>
    );
}
