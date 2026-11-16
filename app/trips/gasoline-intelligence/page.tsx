import { Suspense } from "react";
import GasolineIntelligence from "@/components/gasoline-intelligence/GasolineIntelligence";

export default function GasolineIntelligencePage() {
  return <Suspense fallback={<main className="mx-auto max-w-300 p-4">Loading Gasoline Intelligence…</main>}><GasolineIntelligence /></Suspense>;
}
