import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/public/Login";
import Register from "./pages/public/Register";
import VerifyEmail from "./pages/public/VerifyEmail";

import AdminLayout from "./layouts/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminSubscriptions from "./pages/admin/AdminSubscriptions";
import AdminPricing from "./pages/admin/AdminPricing";
import AdminTrainerBookings from "./pages/admin/AdminTrainerBookings";
import AdminAttendance from "./pages/admin/AdminAttendance";
import AdminMessages from "./pages/admin/AdminMessages";
import AdminBlogs from "./pages/admin/AdminBlogs";

import UserScan from "./pages/user/UserScan";
import TrainerScan from "./pages/trainer/TrainerScan";

function getToken() {
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}
function getUser() {
  const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

function Protected({ children }) {
  const token = getToken();
  return token ? children : <Navigate to="/login" replace />;
}

function RoleOnly({ role, children }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  return user.role === role ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
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
        <Route index element={<AdminDashboard />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="subscriptions" element={<AdminSubscriptions />} />
        <Route path="pricing" element={<AdminPricing />} />
        <Route path="trainer-bookings" element={<AdminTrainerBookings />} />
        <Route path="attendance" element={<AdminAttendance />} />
        <Route path="messages" element={<AdminMessages />} />
        <Route path="blogs" element={<AdminBlogs />} />
      </Route>

      {/* User (mobile page) */}
      <Route
        path="/user/scan"
        element={
          <Protected>
            <RoleOnly role="user">
              <UserScan />
            </RoleOnly>
          </Protected>
        }
      />

      {/* Trainer (mobile page) */}
      <Route
        path="/trainer/scan"
        element={
          <Protected>
            <RoleOnly role="trainer">
              <TrainerScan />
            </RoleOnly>
          </Protected>
        }
      />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}