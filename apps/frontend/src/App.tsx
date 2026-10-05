import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Outlet, Routes, Route } from "react-router-dom";

import { useAuth } from "./hooks/useAuth.ts";
import { AuthProvider } from "./context/AuthProvider.tsx";
import { CustomerAuthProvider } from "./context/CustomerAuthProvider.tsx";
import { RequireAuth, RequireCustomerAuth, RequirePermission } from "./components/Guards.tsx";
import { AppLayout } from "./components/AppLayout.tsx";

const LoginPage = lazy(() => import("./pages/LoginPage.tsx").then(({ LoginPage }) => ({ default: LoginPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage.tsx").then(({ RegisterPage }) => ({ default: RegisterPage })));
const ConfirmCustomerRegistrationPage = lazy(() => import("./pages/ConfirmCustomerRegistrationPage.tsx").then(({ ConfirmCustomerRegistrationPage }) => ({ default: ConfirmCustomerRegistrationPage })));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage.tsx").then(({ VerifyEmailPage }) => ({ default: VerifyEmailPage })));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage.tsx").then(({ ForgotPasswordPage }) => ({ default: ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage.tsx").then(({ ResetPasswordPage }) => ({ default: ResetPasswordPage })));
const CustomerForgotPasswordPage = lazy(() => import("./pages/CustomerForgotPasswordPage.tsx").then(({ CustomerForgotPasswordPage }) => ({ default: CustomerForgotPasswordPage })));
const CustomerResetPasswordPage = lazy(() => import("./pages/CustomerResetPasswordPage.tsx").then(({ CustomerResetPasswordPage }) => ({ default: CustomerResetPasswordPage })));
const CustomerLoginPage = lazy(() => import("./pages/CustomerLoginPage.tsx").then(({ CustomerLoginPage }) => ({ default: CustomerLoginPage })));
const CustomerAccountPortalPage = lazy(() => import("./pages/CustomerAccountPortalPage.tsx").then(({ CustomerAccountPortalPage }) => ({ default: CustomerAccountPortalPage })));
const CustomerServiceOrderDetailPage = lazy(() => import("./pages/CustomerServiceOrderDetailPage.tsx").then(({ CustomerServiceOrderDetailPage }) => ({ default: CustomerServiceOrderDetailPage })));
const CustomerPortalPage = lazy(() => import("./pages/CustomerPortalPage.tsx").then(({ CustomerPortalPage }) => ({ default: CustomerPortalPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage.tsx").then(({ DashboardPage }) => ({ default: DashboardPage })));
const ServiceOrdersListPage = lazy(() => import("./pages/ServiceOrdersListPage.tsx").then(({ ServiceOrdersListPage }) => ({ default: ServiceOrdersListPage })));
const ServiceOrderNewPage = lazy(() => import("./pages/ServiceOrderNewPage.tsx").then(({ ServiceOrderNewPage }) => ({ default: ServiceOrderNewPage })));
const ServiceOrderDetailPage = lazy(() => import("./pages/ServiceOrderDetailPage.tsx").then(({ ServiceOrderDetailPage }) => ({ default: ServiceOrderDetailPage })));
const CustomersListPage = lazy(() => import("./pages/CustomersListPage.tsx").then(({ CustomersListPage }) => ({ default: CustomersListPage })));
const CustomerNewPage = lazy(() => import("./pages/CustomerNewPage.tsx").then(({ CustomerNewPage }) => ({ default: CustomerNewPage })));
const CustomerDetailPage = lazy(() => import("./pages/CustomerDetailPage.tsx").then(({ CustomerDetailPage }) => ({ default: CustomerDetailPage })));
const TechniciansListPage = lazy(() => import("./pages/TechniciansListPage.tsx").then(({ TechniciansListPage }) => ({ default: TechniciansListPage })));
const UsersListPage = lazy(() => import("./pages/UsersListPage.tsx").then(({ UsersListPage }) => ({ default: UsersListPage })));
const UserNewPage = lazy(() => import("./pages/UserNewPage.tsx").then(({ UserNewPage }) => ({ default: UserNewPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage.tsx").then(({ NotFoundPage }) => ({ default: NotFoundPage })));

function RoleHome() {
  const { user } = useAuth();
  return user?.role === "CUSTOMER" ? <Navigate to="/minha-area" replace /> : <DashboardPage />;
}

function RouteLoading() {
  return <div className="page-loading" role="status"><span className="spinner" />Carregando página...</div>;
}

function InternalAuthScope() {
  return <AuthProvider><Outlet /></AuthProvider>;
}

function CustomerAuthScope() {
  return <CustomerAuthProvider><Outlet /></CustomerAuthProvider>;
}

function App() {
  return (
    <BrowserRouter>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
          <Route path="/registrar" element={<RegisterPage />} />
          <Route path="/confirmar-cadastro" element={<ConfirmCustomerRegistrationPage />} />
          <Route path="/verificar-email" element={<VerifyEmailPage />} />
          <Route path="/customer/forgot-password" element={<CustomerForgotPasswordPage />} />
          <Route path="/customer/reset-password" element={<CustomerResetPasswordPage />} />

          <Route path="/customer" element={<CustomerAuthScope />}>
            <Route path="login" element={<CustomerLoginPage />} />
            <Route element={<RequireCustomerAuth><Outlet /></RequireCustomerAuth>}>
              <Route path="area" element={<CustomerAccountPortalPage />} />
              <Route path="service-orders/:id" element={<CustomerServiceOrderDetailPage />} />
            </Route>
          </Route>

          <Route element={<InternalAuthScope />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
          <Route path="/resetar-senha" element={<ResetPasswordPage />} />

          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<RoleHome />} />
            <Route path="/minha-area" element={<CustomerPortalPage />} />

            <Route
              path="/service-orders"
              element={
                <RequirePermission permission="OS_READ">
                  <ServiceOrdersListPage />
                </RequirePermission>
              }
            />
            <Route
              path="/service-orders/new"
              element={
                <RequirePermission permission="OS_CREATE">
                  <ServiceOrderNewPage />
                </RequirePermission>
              }
            />
            <Route
              path="/service-orders/:id"
              element={
                <RequirePermission permission="OS_READ">
                  <ServiceOrderDetailPage />
                </RequirePermission>
              }
            />

            <Route
              path="/customers"
              element={
                <RequirePermission permission="CUSTOMER_READ">
                  <CustomersListPage />
                </RequirePermission>
              }
            />
            <Route
              path="/customers/new"
              element={
                <RequirePermission permission="CUSTOMER_CREATE">
                  <CustomerNewPage />
                </RequirePermission>
              }
            />
            <Route
              path="/customers/:id"
              element={
                <RequirePermission permission="CUSTOMER_READ">
                  <CustomerDetailPage />
                </RequirePermission>
              }
            />

            <Route
              path="/technicians"
              element={
                <RequirePermission permission="USER_READ">
                  <TechniciansListPage />
                </RequirePermission>
              }
            />

            <Route
              path="/users"
              element={
                <RequirePermission permission="USER_READ">
                  <UsersListPage />
                </RequirePermission>
              }
            />
            <Route
              path="/users/new"
              element={
                <RequirePermission permission="USER_CREATE">
                  <UserNewPage />
                </RequirePermission>
              }
            />

            <Route path="*" element={<NotFoundPage />} />
          </Route>
          </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
  );
}

export default App;
