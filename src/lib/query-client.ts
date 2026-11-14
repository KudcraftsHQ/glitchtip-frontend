import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (n, e) => n < 2 && !/^40[13]/.test(String(e?.message)), refetchOnWindowFocus: true } },
});
