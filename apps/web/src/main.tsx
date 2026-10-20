import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { queryClient } from "./api/client";
import { App } from "./app";
import "@radix-ui/themes/styles.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </QueryClientProvider>,
);
