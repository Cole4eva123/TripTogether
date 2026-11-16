import { identifyVehicle } from "@/lib/gasoline-intelligence/ai";
import { fuelFailure, fuelUser } from "@/lib/gasoline-intelligence/service";
import { text } from "@/lib/gasoline-intelligence/validation";
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
