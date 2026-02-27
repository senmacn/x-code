"use client";

import { SWRConfig } from "swr";

export const SWRProvider = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig
    value={{
      dedupingInterval: 5000,
      errorRetryCount: 3,
      errorRetryInterval: 3000,
      revalidateOnFocus: false,
      shouldRetryOnError: (err) => {
        // Don't retry on 4xx client errors
        if (err?.message?.includes("4")) return false;
        return true;
      },
    }}
  >
    {children}
  </SWRConfig>
);
