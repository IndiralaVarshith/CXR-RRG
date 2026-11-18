import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the landing page hero", () => {
  render(<App />);
  expect(screen.getByText(/telling you/i)).toBeInTheDocument();
});
