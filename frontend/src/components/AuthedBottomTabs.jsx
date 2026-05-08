import { NavLink, Link } from "react-router-dom";
import { Home, Compass, Radio, MessageCircle, User } from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * Fanvue/Twitter-style mobile bottom tab bar for the AuthedShell.
 * Visible only below lg breakpoint (<1024px). Keeps essentials within thumb reach.
 */
export default function AuthedBottomTabs() {
    const { user } = useAuth();
    const isCreator = user?.role === "creator" || user?.role === "admin";
    const profilePath = isCreator ? "/dashboard" : "/settings/profile";

    const TABS = [
        { to: "/feed",       label: "Accueil",   icon: Home,          testId: "btab-home", end: true },
        { to: "/createurs",  label: "Explorer",  icon: Compass,       testId: "btab-discover" },
        { to: "/live",       label: "Live",      icon: Radio,         testId: "btab-live", live: true },
        { to: "/messages",   label: "Messages",  icon: MessageCircle, testId: "btab-messages" },
        { to: profilePath,   label: "Profil",    icon: User,          testId: "btab-profile" },
    ];

    return (
        <nav
            data-testid="authed-bottom-tabs"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[var(--bg-base)]/95 backdrop-blur-xl lg:hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
            <div className="grid grid-cols-5">
                {TABS.map((t) => {
                    const Icon = t.icon;
                    return (
                        <NavLink
                            key={t.to}
                            to={t.to}
                            end={t.end}
                            data-testid={t.testId}
                            className={({ isActive }) => `relative flex h-14 flex-col items-center justify-center gap-0.5 transition-colors ${
                                isActive ? "text-white" : "text-white/55 active:text-white"
                            }`}
                        >
                            {({ isActive }) => (
                                <>
                                    <span className={`relative ${t.live ? "" : ""}`}>
                                        <Icon
                                            size={22}
                                            className={isActive ? "text-magenta" : ""}
                                            strokeWidth={isActive ? 2.4 : 1.85}
                                        />
                                        {t.live && (
                                            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                                        )}
                                    </span>
                                    <span className={`text-[10px] font-semibold ${isActive ? "text-white" : ""}`}>{t.label}</span>
                                    {isActive && (
                                        <span className="absolute top-0 h-0.5 w-8 rounded-b-full bg-magenta" />
                                    )}
                                </>
                            )}
                        </NavLink>
                    );
                })}
            </div>
        </nav>
    );
}
