import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext.tsx";
import { RequireAuth, RequirePermission } from "./components/Guards.tsx";
import { AppLayout } from "./components/AppLayout.tsx";

import { LoginPage } from "./pages/LoginPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { ServiceOrdersListPage } from "./pages/ServiceOrdersListPage.tsx";
import { ServiceOrderNewPage } from "./pages/ServiceOrderNewPage.tsx";
import { ServiceOrderDetailPage } from "./pages/ServiceOrderDetailPage.tsx";
import { CustomersListPage } from "./pages/CustomersListPage.tsx";
import { CustomerNewPage } from "./pages/CustomerNewPage.tsx";
import { CustomerDetailPage } from "./pages/CustomerDetailPage.tsx";
import { TechniciansListPage } from "./pages/TechniciansListPage.tsx";
import { UsersListPage } from "./pages/UsersListPage.tsx";
import { UserNewPage } from "./pages/UserNewPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<DashboardPage />} />

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
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
