import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { Login, fetchSession, sessionKey } from "./auth";
import { Spinner } from "./components/ui";
import { useMountEffect } from "./lib/hooks";
import { queryClient } from "./lib/query-client";
import "./index.css";


function App() {
  const qc = useQueryClient();
  const session = useQuery({ queryKey: sessionKey, queryFn: fetchSession, staleTime: Infinity });
  useMountEffect(() => {
    const onUnauthorized = () => qc.invalidateQueries({ queryKey: sessionKey });
    window.addEventListener("glitchtip:unauthorized", onUnauthorized);
    return () => window.removeEventListener("glitchtip:unauthorized", onUnauthorized);
  });
  if (session.isPending) return <div className="grid h-full place-items-center"><Spinner /></div>;
  if (session.data?.status !== 200) return <Login />;
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
