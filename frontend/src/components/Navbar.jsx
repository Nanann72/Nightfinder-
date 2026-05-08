import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import NotificationsBell from "@/components/NotificationsBell";
import WalletChip from "@/components/WalletChip";
import FidelityBadge from "@/components/FidelityBadge";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { LogOut, Sparkles, Menu, X, ChevronDown } from "lucide-react";

export default function Navbar() {
    const { user, logout } = useAuth();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const isCreator = user?.role === "creator";
    const isAdmin = user?.role === "admin";

    const closeMenu = () => setMenuOpen(false);

    return (
        <nav
            data-testid="main-navbar"
            className="sticky top-0 z-40 glass-header"
        >
            <div className="container-mx flex h-[68px] items-center justify-between gap-2">
                <Link to="/" data-testid="logo-link" className="flex items-center gap-2 shrink-0 group">
                    <span className="font-display text-xl sm:text-2xl font-extrabold tracking-tight leading-none" aria-label="me&you">
                        <span className="text-white">me</span>
                        <span className="text-magenta-400 text-[1.15em] font-black px-0.5 drop-shadow-[0_0_10px_rgba(217,70,239,0.55)] transition-transform group-hover:scale-110 inline-block">&amp;</span>
                        <span className="text-white">you</span>
                    </span>
                    <span className="hidden sm:inline overline">.fans</span>
                </Link>

                <div className="hidden md:flex items-center gap-7 text-sm text-white/65">
                    <NavLink to="/feed" data-testid="nav-feed"
                        className={({ isActive }) => `transition-colors hover:text-white ${isActive ? "text-white" : ""}`}>
                        {t("nav.feed")}
                    </NavLink>
                    <NavLink to="/createurs" data-testid="nav-creators"
                        className={({ isActive }) => `transition-colors hover:text-white ${isActive ? "text-white" : ""}`}>
                        {t("nav.creators")}
                    </NavLink>
                    <NavLink to="/live" data-testid="nav-live"
                        className={({ isActive }) => `flex items-center gap-1.5 transition-colors hover:text-white ${isActive ? "text-red-300" : "text-white/65"}`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" /> {t("nav.live")}
                    </NavLink>
                    {user && (
                        <NavLink to="/messages" data-testid="nav-messages"
                            className={({ isActive }) => isActive ? "text-white" : "hover:text-white"}>
                            {t("nav.messages")}
                        </NavLink>
                    )}
                    {isCreator && (
                        <NavLink to="/dashboard" data-testid="nav-dashboard"
                            className={({ isActive }) => isActive ? "text-white" : "hover:text-white"}>
                            {t("nav.dashboard")}
                        </NavLink>
                    )}
                    {isAdmin && (
                        <NavLink to="/admin" data-testid="nav-admin"
                            className={({ isActive }) => isActive ? "text-magenta-200" : "text-magenta-300 hover:text-white"}>
                            {t("nav.admin")}
                        </NavLink>
                    )}
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                    <LanguageSwitcher />
                    {user ? (
                        <>
                            {!user.age_verified && (
                                <Link to="/verification" data-testid="nav-verify"
                                    className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-magenta/40 bg-magenta/10 px-3 py-1.5 text-xs font-semibold text-magenta-200 hover:bg-magenta/20">
                                    <Sparkles size={14} /> Confirmer mon âge
                                </Link>
                            )}
                            {!isCreator && (
                                <Link to="/devenir-createur" data-testid="nav-become-creator"
                                    className="hidden lg:inline text-xs text-white/60 hover:text-white">
                                    Devenir créatrice
                                </Link>
                            )}
                            <NotificationsBell />
                            <WalletChip />
                            {user.badge && (
                                <Link to="/parrainage" className="hidden lg:inline-flex" data-testid="nav-badge-chip">
                                    <FidelityBadge badge={user.badge} size="sm" />
                                </Link>
                            )}
                            <Link to={isCreator ? "/dashboard" : "/settings/profile"} data-testid="nav-profile-chip"
                                className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:border-white/20">
                                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-magenta to-magenta-700 flex items-center justify-center text-xs font-bold">
                                    {user.name?.[0]?.toUpperCase() || "U"}
                                </div>
                                <span className="hidden md:inline">{user.name}</span>
                            </Link>
                            <button
                                data-testid="nav-logout-btn"
                                onClick={async () => { await logout(); navigate("/"); }}
                                className="hidden sm:flex rounded-full p-2 text-white/60 hover:bg-white/5 hover:text-white"
                                title="Déconnexion">
                                <LogOut size={18} />
                            </button>
                        </>
                    ) : (
                        <>
                            <Link to="/login" data-testid="nav-login" className="text-sm text-white/70 hover:text-white">{t("nav.login")}</Link>
                            <Link to="/register" data-testid="nav-register" className="btn-primary text-sm px-3 py-2 sm:px-4">{t("nav.signup")}</Link>
                        </>
                    )}
                    <button
                        onClick={() => setMenuOpen(!menuOpen)}
                        data-testid="nav-mobile-toggle"
                        className="rounded-full border border-white/10 p-2 text-white/70 md:hidden"
                        aria-label="Menu"
                    >
                        {menuOpen ? <X size={16} /> : <Menu size={16} />}
                    </button>
                </div>
            </div>

            {/* Mobile menu */}
            {menuOpen && (
                <div className="border-t border-white/5 bg-obsidian/95 backdrop-blur-xl md:hidden" data-testid="nav-mobile-menu">
                    <div className="container-mx flex flex-col gap-1 py-3">
                        <CollapsibleSection title="Navigation" testId="mobile-section-navigation" defaultOpen>
                            <MobileLink to="/feed" onClick={closeMenu} testId="mobile-nav-feed">Feed</MobileLink>
                            <MobileLink to="/createurs" onClick={closeMenu} testId="mobile-nav-creators">Créatrices</MobileLink>
                            <MobileLink to="/live" onClick={closeMenu} testId="mobile-nav-live">🔴 Lives en direct</MobileLink>
                            {user && <MobileLink to="/messages" onClick={closeMenu} testId="mobile-nav-messages">Messages</MobileLink>}
                        </CollapsibleSection>

                        {user && (
                            <CollapsibleSection title="Mon compte" testId="mobile-section-account">
                                <MobileLink to="/wallet" onClick={closeMenu} testId="mobile-nav-wallet">Wallet</MobileLink>
                                <MobileLink to="/subscriptions" onClick={closeMenu} testId="mobile-nav-subs">Mes abonnements</MobileLink>
                                {isCreator && <MobileLink to="/bank" onClick={closeMenu} testId="mobile-nav-bank">Compte bancaire</MobileLink>}
                                {!user.age_verified && <MobileLink to="/verification" onClick={closeMenu} testId="mobile-nav-verify" accent>Confirmer mon âge</MobileLink>}
                                {!isCreator && <MobileLink to="/commandes" onClick={closeMenu} testId="mobile-nav-orders">📦 Mes commandes</MobileLink>}
                            </CollapsibleSection>
                        )}

                        {isCreator && (
                            <CollapsibleSection title="Espace Créatrice" testId="mobile-section-creator" accent>
                                <MobileLink to="/dashboard" onClick={closeMenu} testId="mobile-nav-dashboard">Dashboard créatrice</MobileLink>
                                <MobileLink to="/commandes" onClick={closeMenu} testId="mobile-nav-requests">📦 Demandes reçues</MobileLink>
                                <MobileLink to="/promotions" onClick={closeMenu} testId="mobile-nav-promotions">🏷️ Promotions</MobileLink>
                                <MobileLink to="/leaderboard" onClick={closeMenu} testId="mobile-nav-leaderboard">🏆 Classement</MobileLink>
                            </CollapsibleSection>
                        )}

                        {isAdmin && (
                            <CollapsibleSection title="Administration" testId="mobile-section-admin" accent>
                                <MobileLink to="/admin" onClick={closeMenu} testId="mobile-nav-admin" accent>Admin · Tableau de bord</MobileLink>
                            </CollapsibleSection>
                        )}

                        {user && (
                            <CollapsibleSection title="Extras" testId="mobile-section-extras">
                                <MobileLink to="/parrainage" onClick={closeMenu} testId="mobile-nav-referral">🎁 Parrainage · +100 coins</MobileLink>
                                {!isCreator && <MobileLink to="/leaderboard" onClick={closeMenu} testId="mobile-nav-leaderboard-fan">🏆 Classement créatrices</MobileLink>}
                                {!isCreator && <MobileLink to="/devenir-createur" onClick={closeMenu} testId="mobile-nav-become">Devenir créatrice</MobileLink>}
                                <button
                                    onClick={async () => { closeMenu(); await logout(); navigate("/"); }}
                                    data-testid="mobile-nav-logout"
                                    className="mt-1 flex w-full items-center gap-2 rounded-xl border border-white/5 px-3 py-2.5 text-sm text-white/70 hover:bg-white/[0.03]"
                                >
                                    <LogOut size={14} /> Déconnexion
                                </button>
                            </CollapsibleSection>
                        )}
                    </div>
                </div>
            )}
        </nav>
    );
}

function MobileLink({ to, onClick, testId, children, accent }) {
    return (
        <NavLink
            to={to}
            onClick={onClick}
            data-testid={testId}
            className={({ isActive }) =>
                `rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    isActive
                        ? "bg-magenta/15 text-white"
                        : accent
                            ? "text-magenta-200 hover:bg-magenta/10"
                            : "text-white/70 hover:bg-white/[0.03] hover:text-white"
                }`
            }
        >
            {children}
        </NavLink>
    );
}

function CollapsibleSection({ title, testId, children, defaultOpen = false, accent = false }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="mt-1" data-testid={testId}>
            <button
                onClick={() => setOpen(!open)}
                data-testid={`${testId}-toggle`}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-[11px] font-semibold uppercase tracking-widest transition-colors ${accent ? "text-magenta-200 hover:bg-magenta/5" : "text-white/50 hover:bg-white/[0.03] hover:text-white/80"}`}
                aria-expanded={open}
            >
                <span>{title}</span>
                <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                />
            </button>
            {open && (
                <div className="mt-1 flex flex-col gap-1 border-l border-white/5 pl-2 ml-2" data-testid={`${testId}-content`}>
                    {children}
                </div>
            )}
        </div>
    );
}
