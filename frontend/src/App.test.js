import { act, render, screen } from "@testing-library/react";
import App from "./App";
import { setUser } from "./lib/auth";

afterEach(() => act(() => setUser(null)));

test("signed-out visitors only see the sign-in page", () => {
  window.history.pushState({}, "", "/history");
  render(<App />);
  expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
  expect(window.location.pathname).toBe("/login");
});

test("signed-in users see the app", () => {
  act(() => setUser({ email: "jane@example.test", name: "Jane", role: "user" }));
  window.history.pushState({}, "", "/");
  render(<App />);
  expect(screen.getByText(/telling you/i)).toBeInTheDocument();
});
