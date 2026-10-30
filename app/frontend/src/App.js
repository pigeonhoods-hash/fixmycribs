import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth, getDefaultDashboard, hasRole } from "@/lib/auth";
import { SubscriptionProvider } from "@/lib/subscription";
import { Toaster } from "@/components/ui/sonner";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import VerifyEmail from "@/pages/VerifyEmail";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AcceptInvite from "@/pages/AcceptInvite";
import AcceptFacilityManagerInvite from "@/pages/AcceptFacilityManagerInvite";
import MockCheckout from "@/pages/MockCheckout";
import DashboardLayout from "@/components/DashboardLayout";
import FeatureGate from "@/components/FeatureGate";
import DashboardHome from "@/pages/DashboardHome";
import Properties from "@/pages/Properties";
import PropertyDetail from "@/pages/PropertyDetail";
import Tenants from "@/pages/Tenants";
import TenantDetail from "@/pages/TenantDetail";
import RentRecords from "@/pages/RentRecords";
import Payments from "@/pages/Payments";
import Overdue from "@/pages/Overdue";
import Reminders from "@/pages/Reminders";
import Reports from "@/pages/Reports";
import Expenses from "@/pages/Expenses";
import Billing from "@/pages/Billing";
import Settings from "@/pages/Settings";
import Messages from "@/pages/Messages";
import Bills from "@/pages/Bills";
import PropertyBills from "@/pages/PropertyBills";
import PropertyExpenses from "@/pages/PropertyExpenses";
import PropertyRent from "@/pages/PropertyRent";
import Maintenance from "@/pages/Maintenance";
import FacilityManagers from "@/pages/FacilityManagers";
import SupportInbox from "@/pages/SupportInbox";
import PastTenants from "@/pages/PastTenants";
import LegalPage from "@/pages/LegalPage";
// Tenant portal
import TenantLayout from "@/pages/tenant/TenantLayout";
import TenantDashboard from "@/pages/tenant/TenantDashboard";
import TenantMessages from "@/pages/tenant/TenantMessages";
import TenantSettings from "@/pages/tenant/TenantSettings";
import TenantBills from "@/pages/tenant/TenantBills";
import TenantComplaints from "@/pages/tenant/TenantComplaints";
// Admin portal
import AdminLayout from "@/pages/admin/AdminLayout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminUserDetail from "@/pages/admin/AdminUserDetail";
import AdminSubscriptions from "@/pages/admin/AdminSubscriptions";
import AdminPlans from "@/pages/admin/AdminPlans";
import AdminAuditLogs from "@/pages/admin/AdminAuditLogs";
import AdminSupportTickets from "@/pages/admin/AdminSupportTickets";
import AdminSupportStaff from "@/pages/admin/AdminSupportStaff";
import AdminSettings from "@/pages/admin/AdminSettings";
// Facility manager portal
import FacilityManagerLayout from "@/pages/facility/FacilityManagerLayout";
import FacilityManagerDashboard from "@/pages/facility/FacilityManagerDashboard";
import FacilityManagerExpenses from "@/pages/facility/FacilityManagerExpenses";
// Support portal
import SupportLayout from "@/pages/support/SupportLayout";
import SupportTickets from "@/pages/support/SupportTickets";

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "owner" && user.email_verified === false) return <Navigate to="/verify-email" replace />;
  if (roles && !hasRole(user, roles)) return <Navigate to={getDefaultDashboard(user)} replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <SubscriptionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/verify-email/:token" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/invite/:token" element={<AcceptInvite />} />
          <Route path="/fm-invite/:token" element={<AcceptFacilityManagerInvite />} />
          <Route path="/mock-checkout" element={<Protected roles={["owner"]}><MockCheckout /></Protected>} />
          <Route path="/legal/:doc" element={<LegalPage />} />

          {/* Owner dashboard */}
          <Route path="/dashboard" element={<Protected roles={["owner"]}><DashboardLayout /></Protected>}>
            <Route index element={<DashboardHome />} />
            <Route path="properties" element={<Properties />} />
            <Route path="properties/:id" element={<PropertyDetail />} />
            <Route path="tenants" element={<Tenants />} />
            <Route path="tenants/:id" element={<TenantDetail />} />
            <Route path="past-tenants" element={<PastTenants />} />
            <Route path="rent" element={<RentRecords />} />
            <Route path="rent/property/:propertyId" element={<PropertyRent />} />
            <Route path="payments" element={<Payments />} />
            <Route path="overdue" element={<Overdue />} />
            <Route path="reminders" element={<Reminders />} />
            <Route path="reports" element={<FeatureGate feature="reports" title="Reports & exports"><Reports /></FeatureGate>} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="expenses/property/:propertyId" element={<PropertyExpenses />} />
            <Route path="messages" element={<Messages />} />
            <Route path="messages/:conversationId" element={<Messages />} />
            <Route path="bills" element={<FeatureGate feature="bills" title="Utility bills"><Bills /></FeatureGate>} />
            <Route path="bills/property/:propertyId" element={<FeatureGate feature="bills" title="Utility bills"><PropertyBills /></FeatureGate>} />
            <Route path="maintenance" element={<FeatureGate feature="maintenance" title="Maintenance workflow"><Maintenance /></FeatureGate>} />
            <Route path="facility-managers" element={<FeatureGate feature="maintenance" title="Facility managers"><FacilityManagers /></FeatureGate>} />
            <Route path="support" element={<SupportInbox />} />
            <Route path="billing" element={<Billing />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Tenant portal */}
          <Route path="/tenant" element={<Protected roles={["tenant"]}><TenantLayout /></Protected>}>
            <Route index element={<TenantDashboard />} />
            <Route path="bills" element={<TenantBills />} />
            <Route path="complaints" element={<TenantComplaints />} />
            <Route path="messages" element={<TenantMessages />} />
            <Route path="support" element={<SupportInbox />} />
            <Route path="settings" element={<TenantSettings />} />
          </Route>

          {/* Admin portal */}
          <Route path="/admin" element={<Protected roles={["admin"]}><AdminLayout /></Protected>}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="users/:id" element={<AdminUserDetail />} />
            <Route path="subscriptions" element={<AdminSubscriptions />} />
            <Route path="plans" element={<AdminPlans />} />
            <Route path="audit-logs" element={<AdminAuditLogs />} />
            <Route path="support-tickets" element={<AdminSupportTickets />} />
            <Route path="support-staff" element={<AdminSupportStaff />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          {/* Facility manager portal */}
          <Route path="/facility-manager" element={<Protected roles={["facility_manager"]}><FacilityManagerLayout /></Protected>}>
            <Route index element={<FacilityManagerDashboard />} />
            <Route path="complaints" element={<FacilityManagerDashboard />} />
            <Route path="expenses" element={<FacilityManagerExpenses />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Support portal */}
          <Route path="/support" element={<Protected roles={["support", "admin"]}><SupportLayout /></Protected>}>
            <Route index element={<SupportTickets />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster richColors position="top-right" />
      </BrowserRouter>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export default App;
