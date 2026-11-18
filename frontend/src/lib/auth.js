export const getUser = () => {
  const email = localStorage.getItem("email");
  if (!email) return null;
  const stored = localStorage.getItem("userName");
  const name = stored && stored !== "User" && stored !== "Unknown User" ? stored : email.split("@")[0];
  return { email, name, role: localStorage.getItem("role") || "user" };
};

export const setUser = ({ email, name, role }) => {
  localStorage.setItem("email", email);
  localStorage.setItem("userName", name || "");
  localStorage.setItem("role", role || "user");
};

export const logout = () => {
  ["email", "userName", "role"].forEach((k) => localStorage.removeItem(k));
};

export const initials = (name = "") =>
  name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "U";
