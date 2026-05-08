import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { Users, ShieldCheck, ShieldAlert, Flag, Coins, LayoutDashboard, Settings, Menu, X, Mail } from "lucide-react";

const SECTIONS = [
    {
        label: "Vue d'ensemble",
        items: [
            { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
        ],
    },
    {
        label: "Utilisateurs",
        items: [
            { to: "/admin/users", label: "Utilisateurs", icon: Users },
            { to: "/admin/kyc", label: "Vérifications âge", icon: ShieldCheck },
            { to: "/admin/broadcast", label: "Email en masse", icon: Mail },
        ],
    },
    {
        label: "Contenu",
        items: [
            { to: "/admin/content", label: "Modération", icon: Flag },
            { to: "/admin/dmca", label: "DMCA", icon: ShieldAlert },
            { to: "/admin/site-config", label: "Config site", icon: Settings },
        ],
    },
    {
        label: "Paiements",
        items: [
            { to: "/admin/payouts", label: "Retraits SEPA", icon: Coins },
        ],
    },
];

export default function AdminLayout() {
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <div className="relative z-10 container-mx py-6 sm:py-8" data-testid="admin-layout">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="overline">Espace admin</div>
                    <h1 className="mt-2 font-display text-2xl font-bold sm:text-3xl">Tableau de bord</h1>
                </div>
                <button
                    onClick={() => setMobileOpen(!mobileOpen)}
                    data-testid="admin-nav-toggle"
                    className="rounded-full border border-white/10 p-2 text-white/70 lg:hidden"
                    aria-label="Toggle menu"
                >
                    {mobileOpen ? <X size={18} /> : <Menu size={18} />}
                </button>
            </div>

            <div className="mt-6 flex flex-col gap-6 lg:flex-row">
                {/* Sidebar navigation */}
                <aside
                    className={`${mobileOpen ? "block" : "hidden"} shrink-0 lg:block lg:w-60`}
                    data-testid="admin-nav"
                >
                    <nav className="space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-3 sm:p-4">
                        {SECTIONS.map((section) => (
                            <div key={section.label}>
                                <div className="overline mb-2 text-[10px]">{section.label}</div>
                                <div className="space-y-1">
                                    {section.items.map((item) => {
                                        const Icon = item.icon;
                                        return (
                                            <NavLink
                                                key={item.to}
                                                to={item.to}
                                                end={item.end}
                                                onClick={() => setMobileOpen(false)}
                                                data-testid={`admin-tab-${item.label}`}
                                                className={({ isActive }) =>
                                                    `flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                                                        isActive
                                                            ? "bg-magenta/15 text-white"
                                                            : "text-white/60 hover:bg-white/[0.03] hover:text-white"
                                                    }`
                                                }
                                            >
                                                <Icon size={14} /> {item.label}
                                            </NavLink>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>
                </aside>

                {/* Main content */}
                <div className="min-w-0 flex-1">
                    <Outlet />
                </div>
            </div>
        </div>
    );
}
