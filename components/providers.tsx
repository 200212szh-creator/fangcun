"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { messages, type MessageSchema } from "@/lib/translations";
import type { Locale } from "@/lib/types";

const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({ locale: "zh", setLocale: () => undefined });
export function useAppLocale() { return useContext(LocaleContext); }

export function Providers({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>("zh");
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }));
  useEffect(() => { const stored = window.localStorage.getItem("library-locale"); if (stored === "zh" || stored === "en") setLocale(stored); }, []);
  const changeLocale = (next: Locale) => { setLocale(next); window.localStorage.setItem("library-locale", next); document.documentElement.lang = next === "zh" ? "zh-CN" : "en"; };
  const value = useMemo(() => ({ locale, setLocale: changeLocale }), [locale]);
  return <LocaleContext.Provider value={value}><NextIntlClientProvider locale={locale} timeZone="Asia/Shanghai" messages={messages[locale] as unknown as MessageSchema}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></NextIntlClientProvider></LocaleContext.Provider>;
}
