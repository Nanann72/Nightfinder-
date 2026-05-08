import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { User, KeyRound, Bell, ShieldCheck, Heart, CreditCard, Lock, Trash2, Menu, X } from "lucide-react";

/**
 * Fanvue-inspired Settings shell — sticky left sidebar + outlet on the right.
 * Mobile: sidebar collapses behind a hamburger drawer.
 */
const SECTIONS = [
    {
        label: "Compte",
        items: [
            { to: "/settings/profile",       label: "Profil public",     icon: User },
            { to: "/settings/account",       label: "Email & mot de passe", icon: KeyRound },
            { to: "/settings/notifications", label: "Notifications",     icon: Bell },
            { to: "/settings/security",      label: "Sécurité",          icon: ShieldCheck },
        ],
    },
    {
        label: "Activité",
        items: [
            { to: "/settings/subscriptions", label: "Mes abonnements",   icon: Heart },
            { to: "/settings/payments",      label: "Paiements & wallet",icon: CreditCard },
        ],
    },
    {
        label: "Confidentialité",
        items: [
            { to: "/settings/privacy",       label: "Confidentialité",   icon: Lock },
            { to: "/settings/delete",        label: "Supprimer le compte", icon: Trash2, danger: true },
        ],
    },
];

export default function SettingsLayout() {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative z-10 container-mx py-6 sm:py-10" data-testid="settings-layout">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="overline">Paramètres</div>
                    <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Mon compte</h1>
                    <p className="mt-1 text-sm text-white/55">Gère ton profil, tes notifications et tes paiements.</p>
                </div>
                <button
                    onClick={() => setOpen(o => !o)}
                    data-testid="settings-mobile-toggle"
                    className="rounded-full border border-white/10 bg-white/[0.03] p-2 text-white/70 lg:hidden"
                    aria-label="Menu paramètres"
                >
                    {open ? <X size={18} /> : <Menu size={18} />}
                </button>
            </div>

            <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:gap-10">
                <aside
                    data-testid="settings-sidebar"
                    className={`${open ? "block" : "hidden"} shrink-0 lg:block lg:w-64`}
                >
                    <nav className="sticky top-24 space-y-5 rounded-3xl border border-white/5 bg-[var(--bg-surface)] p-4">
                        {SECTIONS.map(s => (
                            <div key={s.label}>
                                <div className="overline mb-2 text-[10px]">{s.label}</div>
                                <div className="space-y-1">
                                    {s.items.map(it => {
                                        const Icon = it.icon;
                                        return (
                                            <NavLink
                                                key={it.to}
                                                to={it.to}
                                                onClick={() => setOpen(false)}
                                                data-testid={`settings-nav-${it.to.split("/").pop()}`}
                                                className={({ isActive }) => `flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm transition-all ${
                                                    isActive
                                                        ? (it.danger ? "bg-red-500/15 text-red-200" : "bg-magenta/15 text-white")
                                                        : (it.danger ? "text-red-300/80 hover:bg-red-500/10 hover:text-red-200" : "text-white/65 hover:bg-white/[0.04] hover:text-white")
                                                }`}
                                            >
                                                <Icon size={15} />
                                                <span>{it.label}</span>
                                            </NavLink>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>
                </aside>

                <div className="min-w-0 flex-1">
                    <Outlet />
                </div>
            </div>
        </div>
    );
}
