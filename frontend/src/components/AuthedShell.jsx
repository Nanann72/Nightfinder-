import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Menu, Bell } from "lucide-react";
import { useAuth } from "@/lib/auth";
import SidebarNav from "@/components/SidebarNav";
import SuggestedSidebar from "@/components/SuggestedSidebar";
import AuthedBottomTabs from "@/components/AuthedBottomTabs";
import WalletChip from "@/components/WalletChip";

/**
 * Fanvue-style 3-column shell for authenticated routes.
 * Desktop: fixed left sidebar (260px) + center outlet + right suggestions (320px, ≥xl)
 * Mobile (<lg): top compact bar + outlet + bottom tab bar (Fanvue-style); sidebar via drawer
 */
export default function AuthedShell() {
    const [open, setOpen] = useState(false);
    const { user } = useAuth();
    const loc = useLocation();

    // Hide right "Suggested" column on dense pages
    const HIDE_RIGHT_PREFIXES = ["/messages", "/admin", "/dashboard", "/live/", "/settings", "/payment/"];
    const hideRight = HIDE_RIGHT_PREFIXES.some(
        p => loc.pathname === p || loc.pathname.startsWith(p + "/") || loc.pathname.startsWith(p)
    );

    // Hide bottom tabs in immersive views (live room only — keep them on /messages list)
    const HIDE_BOTTOM = loc.pathname.startsWith("/live/") && loc.pathname !== "/live";
    const showBottomTabs = !HIDE_BOTTOM;

    return (
        <div className="relative flex min-h-screen w-full" data-testid="authed-shell">
            <SidebarNav open={open} onClose={() => setOpen(false)} />

            <div className="flex min-w-0 flex-1 flex-col">
                {/* Mobile top bar */}
                <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-white/[0.06] bg-[var(--bg-base)]/85 px-3 py-2.5 backdrop-blur lg:hidden">
                    <button
                        onClick={() => setOpen(true)}
                        data-testid="authed-mobile-menu"
                        className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-white/80 active:scale-95"
                        aria-label="Menu"
                    >
                        <Menu size={18} />
                    </button>
                    <Link to="/feed" className="font-display text-base font-bold tracking-tight">
                        me<span className="text-magenta">&</span>you
                    </Link>
                    <div className="ml-auto flex items-center gap-2">
                        <WalletChip />
                        <Link
                            to="/messages"
                            data-testid="authed-mobile-bell"
                            className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-white/80 active:scale-95"
                            aria-label="Messages"
                        >
                            <Bell size={15} />
                        </Link>
                    </div>
                </header>

                <main className={`relative z-10 flex flex-1 justify-center ${showBottomTabs ? "pb-20 lg:pb-10" : "pb-10"}`}>
                    <div className="flex w-full max-w-[1280px]">
                        {/* Center column */}
                        <div className="min-w-0 flex-1 px-3 sm:px-6 lg:px-8">
                            <Outlet />
                        </div>

                        {/* Right suggestions column */}
                        {!hideRight && <SuggestedSidebar />}
                    </div>
                </main>
            </div>

            {showBottomTabs && <AuthedBottomTabs />}
        </div>
    );
}
