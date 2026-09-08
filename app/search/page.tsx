import { Suspense } from "react";
import { SearchPage } from "@/components/search-page";

export default function Page() {
  return <Suspense fallback={<div className="min-h-screen bg-parchment" />}><SearchPage /></Suspense>;
}
