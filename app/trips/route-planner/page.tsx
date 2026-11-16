import { Suspense } from "react";
import RoutePlanner from "@/components/route-planner/RoutePlanner";

export default function RoutePlannerPage() {
  return <Suspense fallback={<main className="mx-auto max-w-300 p-4">Loading route planner…</main>}><RoutePlanner /></Suspense>;
}
