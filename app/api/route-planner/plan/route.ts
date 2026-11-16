import { fuelFailure, fuelUser, planFuel } from "@/lib/route-planner/service";
import { readJson } from "@/lib/server";

export const maxDuration=120;
export async function POST(request: Request) {
  try {
    const user=await fuelUser("plan",20);
    if (user instanceof Response) return user;
    return Response.json(await planFuel(user.id,await readJson(request)));
  } catch (error) { return fuelFailure(error); }
}
