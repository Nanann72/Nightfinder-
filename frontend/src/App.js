import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import ChatAssistant from "@/components/ChatAssistant";
import AgeGate from "@/components/AgeGate";
import PublicLayout from "@/components/PublicLayout";
import AuthedShellLayout from "@/components/AuthedShell";
import SmartShell from "@/components/SmartShell";
import Landing from "@/pages/Landing";
import { LoginPage, RegisterPage } from "@/pages/AuthPages";
import AuthCallback from "@/pages/AuthCallback";
import GoogleDirectCallback from "@/pages/GoogleDirectCallback";
import CreatorsList from "@/pages/CreatorsList";
import CreatorProfile from "@/pages/CreatorProfile";
import Messages from "@/pages/Messages";
import Dashboard from "@/pages/Dashboard";
import CreatorAnalytics from "@/pages/CreatorAnalytics";
import Verification from "@/pages/Verification";
import PaymentSuccess from "@/pages/PaymentSuccess";
import BecomeCreator from "@/pages/BecomeCreator";
import Referral from "@/pages/Referral";
import Leaderboard from "@/pages/Leaderboard";
import Promotions from "@/pages/Promotions";
import CustomRequests from "@/pages/CustomRequests";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Feed from "@/pages/Feed";
import Wallet from "@/pages/Wallet";
import Subscriptions from "@/pages/Subscriptions";
import BankAccount from "@/pages/BankAccount";
import SettingsLayout from "@/pages/settings/SettingsLayout";
import SettingsProfile from "@/pages/settings/SettingsProfile";
import SettingsAccount from "@/pages/settings/SettingsAccount";
import SettingsNotifications from "@/pages/settings/SettingsNotifications";
import SettingsSecurity from "@/pages/settings/SettingsSecurity";
import SettingsSubscriptions from "@/pages/settings/SettingsSubscriptions";
import SettingsPayments from "@/pages/settings/SettingsPayments";
import SettingsPrivacy from "@/pages/settings/SettingsPrivacy";
import SettingsDelete from "@/pages/settings/SettingsDelete";
import Live from "@/pages/Live";
import LiveRoom from "@/pages/LiveRoom";
import GoLive from "@/pages/GoLive";
import CamRoom from "@/pages/CamRoom";
import AdminLayout from "@/pages/admin/AdminLayout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminKYC from "@/pages/admin/AdminKYC";
import AdminModeration from "@/pages/admin/AdminModeration";
import AdminBroadcast from "@/pages/admin/AdminBroadcast";
import AdminSiteConfig from "@/pages/admin/AdminSiteConfig";
import AdminPayouts from "@/pages/AdminPayouts";
import AdminDMCA from "@/pages/admin/AdminDMCA";
import DMCA from "@/pages/DMCA";
import CreatorShortLink from "@/pages/CreatorShortLink";
import AcceptableUse from "@/pages/legal/AcceptableUse";
import Terms from "@/pages/legal/Terms";
import Privacy from "@/pages/legal/Privacy";
import BottomNav from "@/components/BottomNav";

function RequireAuth({ children }) {
    const { user, loading } = useAuth();
    const loc = useLocation();
    if (loading) return <div className="container-mx py-24 text-white/40">Chargement…</div>;
    if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
    return children;
}

function RequireAdmin({ children }) {
    const { user, loading } = useAuth();
    if (loading) return <div className="container-mx py-24 text-white/40">Chargement…</div>;
    if (!user) return <Navigate to="/login" replace />;
    if (user.role !== "admin") {
        return (
            <div className="container-mx py-24 text-center" data-testid="admin-forbidden">
                <div className="font-display text-2xl font-bold">Accès refusé</div>
                <p className="mt-2 text-white/60">Cette section est réservée aux administrateurs.</p>
            </div>
        );
    }
    return children;
}

function AppShell() {
    const loc = useLocation();
    if (loc.hash?.includes("session_id=")) return <AuthCallback />;
    return (
        <div className="relative min-h-screen overflow-x-hidden">
            <AgeGate />
            <Routes>
                {/* === PUBLIC LAYOUT (top Navbar + Footer + BottomNav) === */}
                <Route element={<PublicLayout />}>
                    <Route path="/" element={<Navigate to="/feed" replace />} />
                    <Route path="/welcome" element={<Landing />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/auth/callback" element={<AuthCallback />} />
                    <Route path="/auth/google" element={<GoogleDirectCallback />} />
                    <Route path="/devenir-createur" element={<BecomeCreator />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/legal/acceptable-use" element={<AcceptableUse />} />
                    <Route path="/legal/terms" element={<Terms />} />
                    <Route path="/legal/privacy" element={<Privacy />} />
                    <Route path="/dmca" element={<DMCA />} />
                </Route>

                {/* === SMART HYBRID SHELL (auto picks Public/Authed) === */}
                <Route element={<SmartShell />}>
                    <Route path="/createurs" element={<CreatorsList />} />
                    <Route path="/createur/:id" element={<CreatorProfile />} />
                    <Route path="/c/:handle" element={<CreatorShortLink />} />
                    <Route path="/live" element={<Live />} />
                    <Route path="/live/cam/:username" element={<CamRoom />} />
                </Route>

                {/* === AUTHED SHELL (3-column Fanvue style) === */}
                <Route element={<RequireAuth><AuthedShellLayout /></RequireAuth>}>
                    <Route path="/feed" element={<Feed />} />
                    <Route path="/messages" element={<Messages />} />
                    <Route path="/wallet" element={<Wallet />} />
                    <Route path="/subscriptions" element={<Subscriptions />} />
                    <Route path="/parrainage" element={<Referral />} />
                    <Route path="/leaderboard" element={<Leaderboard />} />
                    <Route path="/promotions" element={<Promotions />} />
                    <Route path="/commandes" element={<CustomRequests />} />
                    <Route path="/verification" element={<Verification />} />
                    <Route path="/bank" element={<BankAccount />} />
                    <Route path="/account" element={<Navigate to="/settings/profile" replace />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/dashboard/analytics" element={<CreatorAnalytics />} />
                    <Route path="/payment/success" element={<PaymentSuccess />} />
                    <Route path="/live/start" element={<GoLive />} />
                    <Route path="/live/:sessionId" element={<LiveRoom />} />
                    <Route path="/settings" element={<SettingsLayout />}>
                        <Route index element={<Navigate to="/settings/profile" replace />} />
                        <Route path="profile" element={<SettingsProfile />} />
                        <Route path="account" element={<SettingsAccount />} />
                        <Route path="notifications" element={<SettingsNotifications />} />
                        <Route path="security" element={<SettingsSecurity />} />
                        <Route path="subscriptions" element={<SettingsSubscriptions />} />
                        <Route path="payments" element={<SettingsPayments />} />
                        <Route path="privacy" element={<SettingsPrivacy />} />
                        <Route path="delete" element={<SettingsDelete />} />
                    </Route>
                    <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
                        <Route index element={<AdminDashboard />} />
                        <Route path="users" element={<AdminUsers />} />
                        <Route path="kyc" element={<AdminKYC />} />
                        <Route path="content" element={<AdminModeration />} />
                        <Route path="broadcast" element={<AdminBroadcast />} />
                        <Route path="site-config" element={<AdminSiteConfig />} />
                        <Route path="payouts" element={<AdminPayouts />} />
                        <Route path="dmca" element={<AdminDMCA />} />
                    </Route>
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <ChatAssistant />
        </div>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <AppShell />
            </AuthProvider>
        </BrowserRouter>
    );
}
