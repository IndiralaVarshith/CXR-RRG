import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getUser, onUserChange } from "../lib/auth";

export function useUser() {
  const [user, setUser] = useState(getUser());
  useEffect(() => onUserChange(setUser), []);
  return user;
}

/** Pages behind sign-in: anyone without a valid session is sent to the login page. */
export default function RequireAuth({ children }) {
  const loc = useLocation();
  const user = useUser();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return children;
}

/** Login / register: already signed-in users go straight to the app. */
export function GuestOnly({ children }) {
  const user = useUser();
  const loc = useLocation();
  const from = loc.state?.from;
  const safe = typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : "/dashboard";
  if (user) return <Navigate to={safe} replace />;
  return children;
}
