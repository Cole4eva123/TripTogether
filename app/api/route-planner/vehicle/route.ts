import { identifyVehicle } from "@/lib/route-planner/ai";
import { fuelFailure, fuelUser } from "@/lib/route-planner/service";
import { text } from "@/lib/route-planner/validation";
import { readJson } from "@/lib/server";

export const maxDuration=240;
export async function POST(request: Request) {
  try {
    const user=await fuelUser("vehicle");
    if (user instanceof Response) return user;
    const body=await readJson(request);
    return Response.json(await identifyVehicle(text(body.description,"Vehicle description",500)));
  } catch (error) { return fuelFailure(error); }
}
