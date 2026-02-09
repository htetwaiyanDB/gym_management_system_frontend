import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

const Login = lazy(() => import("./pages/public/Login"));
const Register = lazy(() => import("./pages/public/Register"));
const VerifyEmail = lazy(() => import("./pages/public/VerifyEmail"));

/* Admin */
const AdminLayout = lazy(() => import("./layouts/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminSubscriptions = lazy(() => import("./pages/admin/AdminSubscriptions"));
const AdminPricing = lazy(() => import("./pages/admin/AdminPricing"));
const AdminTrainerBookings = lazy(() =>import("./pages/admin/AdminTrainerBookings"));
const AdminBoxingBookings = lazy(() =>import("./pages/admin/AdminBoxingBookings"));
const AdminAttendance = lazy(() => import("./pages/admin/AdminAttendance"));
const AdminRfidRegister = lazy(() => import("./pages/admin/RfidRegister"));
const AdminMessages = lazy(() => import("./pages/admin/AdminMessages"));
const AdminBlogs = lazy(() => import("./pages/admin/AdminBlogs"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminUserHistory = lazy(() => import("./pages/admin/AdminUserHistory"));

/* Trainer */
const TrainerLayout = lazy(() => import("./layouts/TrainerLayout"));
const TrainerHome = lazy(() => import("./pages/trainer/TrainerHome"));
const TrainerScan = lazy(() => import("./pages/trainer/TrainerScan"));
const TrainerMessages = lazy(() => import("./pages/trainer/TrainerMessages"));
const TrainerBookings = lazy(() => import("./pages/trainer/TrainerBookings"));
const TrainerBlogDetails = lazy(() =>
  import("./pages/trainer/TrainerBlogDetails")
);
const TrainerSettings = lazy(() => import("./pages/trainer/TrainerSettings"));
const Notifications = lazy(() => import("./pages/shared/Notifications"));

/* User */
const UserLayout = lazy(() => import("./layouts/UserLayout"));
const UserHome = lazy(() => import("./pages/user/UserHome"));
const UserScan = lazy(() => import("./pages/user/UserScan"));
const UserBlogDetails = lazy(() => import("./pages/user/UserBlogDetails"));
const UserAttendance = lazy(() => import("./pages/user/UserAttendance"));
const UserSubsBookings = lazy(() => import("./pages/user/UserSubsBookings"));
const UserMessages = lazy(() => import("./pages/user/UserMessages"));
const UserSettings = lazy(() => import("./pages/user/UserSettings"));

function getToken() {
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}
function getUser() {
  const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

function normRole(role) {
  return String(role || "").trim().toLowerCase();
}

function Protected({ children }) {
  const token = getToken();
  return token ? children : <Navigate to="/login" replace />;
}

function RoleOnly({ role, children }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;

  const need = normRole(role);
  const have = normRole(user.role);

  // allow "admin" alias
  if (need === "administrator" && (have === "administrator" || have === "admin"))
    return children;

  return have === need ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="d-flex min-vh-100 align-items-center justify-content-center">
          <div className="text-muted">Loading...</div>
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        {/* Admin */}
        <Route
          path="/admin"
          element={
            <Protected>
              <RoleOnly role="administrator">
                <AdminLayout />
              </RoleOnly>
            </Protected>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="users/:id/history" element={<AdminUserHistory />} />
          <Route path="subscriptions" element={<AdminSubscriptions />} />
          <Route path="pricing" element={<AdminPricing />} />
          <Route path="trainer-bookings" element={<AdminTrainerBookings />} />
          <Route path="boxing-bookings" element={<AdminBoxingBookings />} />
          <Route path="attendance" element={<AdminAttendance />} />
          <Route path="attendance/rfid-register" element={<AdminRfidRegister />} />
          <Route path="messages" element={<AdminMessages />} />
          <Route path="blogs" element={<AdminBlogs />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        {/* User ✅ FIXED (nested routes correctly under /user) */}
        <Route
          path="/user"
          element={
            <Protected>
              <RoleOnly role="user">
                <UserLayout />
              </RoleOnly>
            </Protected>
          }
        >
          <Route index element={<Navigate to="/user/home" replace />} />
          <Route path="home" element={<UserHome />} />
          <Route path="scan" element={<UserScan />} />
          <Route path="blogs/:id" element={<UserBlogDetails />} />
          <Route path="attendance" element={<UserAttendance />} />
          <Route path="subs-books" element={<UserSubsBookings />} />
          <Route path="subscriptions" element={<Navigate to="/user/subs-books" replace />} />
          <Route path="bookings" element={<Navigate to="/user/subs-books" replace />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="messages" element={<UserMessages />} />
          <Route path="settings" element={<UserSettings />} />
        </Route>

        {/* Trainer */}
        <Route
          path="/trainer"
          element={
            <Protected>
              <RoleOnly role="trainer">
                <TrainerLayout />
              </RoleOnly>
            </Protected>
          }
        >
          <Route index element={<Navigate to="/trainer/home" replace />} />
          <Route path="home" element={<TrainerHome />} />
          <Route path="scan" element={<TrainerScan />} />
          <Route path="messages" element={<TrainerMessages />} />
          <Route path="bookings" element={<TrainerBookings />} />
          <Route path="blogs/:id" element={<TrainerBlogDetails />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="settings" element={<TrainerSettings />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}
