import { getPersistedToken } from "../utils/authSession";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const token = getPersistedToken();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}
