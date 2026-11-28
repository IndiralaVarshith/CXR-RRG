import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/global.css";
import App from "./App";
import { installAuthInterceptors, loadSession } from "./lib/auth";

installAuthInterceptors();

const root = ReactDOM.createRoot(document.getElementById("root"));
// Find out who is signed in on this device before showing any page
loadSession().finally(() =>
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
);
