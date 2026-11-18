import { Navigate, useLocation } from "react-router-dom";
import { getUser } from "../lib/auth";

export default function RequireAuth({ children }) {
  const loc = useLocation();
  if (!getUser()) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}
