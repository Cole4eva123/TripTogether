import { fuelFailure, fuelUser, searchFuel } from "@/lib/route-planner/service";
import { parseFuelPreferences } from "@/lib/route-planner/validation";
import { readJson } from "@/lib/server";

export const maxDuration=300;
export async function POST(request: Request) {
  try {
    const user=await fuelUser("search",4);
    if (user instanceof Response) return user;
    return Response.json(await searchFuel(user.id,parseFuelPreferences(await readJson(request))));
  } catch (error) { return fuelFailure(error); }
}
