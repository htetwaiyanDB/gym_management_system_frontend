import React, { Suspense, lazy } from "react";

import { Routes, Route, Navigate } from "react-router-dom";

const Login = lazy(() => import("./pages/public/Login"));
const Register = lazy(() => import("./pages/public/Register"));
const VerifyEmail = lazy(() => import("./pages/public/VerifyEmail"));

const AdminLayout = lazy(() => import("./layouts/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminSubscriptions = lazy(() => import("./pages/admin/AdminSubscriptions"));
const AdminPricing = lazy(() => import("./pages/admin/AdminPricing"));
const AdminTrainerBookings = lazy(() => import("./pages/admin/AdminTrainerBookings"));
const AdminAttendance = lazy(() => import("./pages/admin/AdminAttendance"));
const AdminMessages = lazy(() => import("./pages/admin/AdminMessages"));
const AdminBlogs = lazy(() => import("./pages/admin/AdminBlogs"));

const UserScan = lazy(() => import("./pages/user/UserScan"));
const TrainerScan = lazy(() => import("./pages/trainer/TrainerScan"));

//trainer
const TrainerLayout = lazy (()=>import( "./layouts/TrainerLayout"));
const TrainerHome = lazy (() =>import ("./pages/trainer/TrainerHome"));
const TrainerMessages = lazy (() =>import ("./pages/trainer/TrainerMessages"));
const TrainerBookings = lazy (() =>import ("./pages/trainer/TrainerBookings"));
const TrainerBlogDetails = lazy (() =>import ("./pages/trainer/TrainerBlogDetails"));
const TrainerSettings = lazy(()=>import("./pages/trainer/TrainerSettings"));


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
          path="/trainer"
          element={
            <Protected>
              <RoleOnly role="trainer">
                <TrainerLayout />
              </RoleOnly>
            </Protected>
          }
        >

         <Route index element={<TrainerHome />} />
          <Route path="home" element={<TrainerHome />} />
          <Route path="scan" element={<TrainerScan />} />
          <Route path="messages" element={<TrainerMessages />} />
          <Route path="bookings" element={<TrainerBookings />} />
          <Route path="blogs/:id" element={<TrainerBlogDetails />} />
          <Route path="settings" element={<TrainerSettings />} />

        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}
