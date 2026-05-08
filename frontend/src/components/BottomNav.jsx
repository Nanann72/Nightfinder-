import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Home, Compass, Radio, MessageCircle, User } from "lucide-react";

/**
 * iOS-style mobile bottom tab bar — visible only on mobile (md:hidden).
 * Hidden on /admin, /live/:id, /legal/* routes (immersive screens).
 *
 * 5 tabs:
 *  - Accueil (/)            — Landing / feed entry
 *  - Découvrir (/createurs) — search creators
 *  - Live (/live)           — live streams
 *  - Messages (/messages)   — DMs (auth required)
 *  - Profil (/dashboard or /wallet) — depends on role/auth
 */

const HIDE_PREFIXES = ["/admin", "/legal/", "/live/cam/", "/auth/"];

const tabClass = ({ isActive }) =>
    `relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors ${
        isActive ? "text-magenta-200" : "text-white/55 hover:text-white"
    }`;

export default function BottomNav() {
    const { user } = useAuth();
    const loc = useLocation();
    const hidden = HIDE_PREFIXES.some(p => loc.pathname.startsWith(p));
    if (hidden) return null;

    // Hide on a live room (/live/:sessionId is immersive) but keep on /live (lobby)
    if (/^\/live\/[^/]+$/.test(loc.pathname) && loc.pathname !== "/live") return null;

    const profilePath = !user
        ? "/login"
        : user.role === "creator" || user.role === "admin"
            ? "/dashboard"
            : "/settings/profile";

    return (
        <nav
            data-testid="bottom-nav"
            className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-obsidian/85 backdrop-blur-xl"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.25rem)" }}
        >
            <div className="mx-auto flex max-w-md items-stretch">
                <Tab to="/" end icon={Home} label="Accueil" testId="bottomnav-home" />
                <Tab to="/createurs" icon={Compass} label="Découvrir" testId="bottomnav-discover" />
                <Tab to="/live" icon={Radio} label="Live" testId="bottomnav-live" />
                <Tab to={user ? "/messages" : "/login?next=/messages"} icon={MessageCircle} label="Messages" testId="bottomnav-messages" />
                <Tab to={profilePath} icon={User} label="Profil" testId="bottomnav-profile" />
            </div>
        </nav>
    );
}

function Tab({ to, icon: Icon, label, testId, end = false }) {
    return (
        <NavLink to={to} end={end} className={tabClass} data-testid={testId}>
            {({ isActive }) => (
                <>
                    {isActive && <span className="absolute inset-x-3 top-0 h-0.5 rounded-b-full bg-magenta" />}
                    <Icon size={20} strokeWidth={isActive ? 2.4 : 1.8} />
                    <span className={isActive ? "font-semibold" : ""}>{label}</span>
                </>
            )}
        </NavLink>
    );
}
