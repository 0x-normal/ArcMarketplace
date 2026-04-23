import React from "react";
import ReactDOM from "react-dom/client";
import { Providers } from "./providers";
import { ErrorBoundary } from "./ErrorBoundary";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Providers>
        <App />
      </Providers>
    </ErrorBoundary>
  </React.StrictMode>
);
