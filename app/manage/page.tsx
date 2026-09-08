import { Suspense } from "react";
import { ManagePage } from "@/components/manage-page";

export default function Page() {
  return <Suspense fallback={null}><ManagePage /></Suspense>;
}
