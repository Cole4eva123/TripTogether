import { fuelFailure, fuelUser, searchFuel } from "@/lib/gasoline-intelligence/service";
import { parseFuelPreferences } from "@/lib/gasoline-intelligence/validation";
import { readJson } from "@/lib/server";

export const maxDuration=300;
export async function POST(request: Request) {
  try {
    const user=await fuelUser("search",4);
    if (user instanceof Response) return user;
    return Response.json(await searchFuel(user.id,parseFuelPreferences(await readJson(request))));
  } catch (error) { return fuelFailure(error); }
}
