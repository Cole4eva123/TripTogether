import { createHash } from "node:crypto";
import type { RoadRoute, RoutePoint, Station } from "./types";
import { geocode, nearbyTown, normalizeState } from "./maps";
import { researchStationAddresses, type ResearchedStation } from "./ai";
import { projectOnRoute } from "./planner";
import { ResearchCache } from "./ai-cache";

const shared=globalThis as typeof globalThis & { fuelStationDirectories?:ResearchCache<ResearchedStation[]> };
const directories=shared.fuelStationDirectories ??=new ResearchCache<ResearchedStation[]>(32,6*3600000);

export async function webStations(route:RoadRoute,points:RoutePoint[],focused=false) {
  const towns=await Promise.all(points.map(point=>nearbyTown(point)));
  const stations:Station[]=[];
  let unmatchedAddresses=0;
  for(const draft of await directories.run(JSON.stringify({towns,focused,model:process.env.DEEPSEEK_MODEL}),()=>researchStationAddresses(route,towns,focused),result=>result.length>0)) {
    try {
      const location=await geocode(draft.address),projection=projectOnRoute(location,route);
      if(projection.offRoute>3 || projection.miles>=route.miles-0.2)continue;
      const detourMiles=projection.offRoute*2.6;
      // Stable IDs let repeated searches add candidates without overwriting an unrelated web:0 stop.
      const id=createHash("sha256").update(draft.address.toLowerCase().replace(/[^a-z0-9]/g,"")).digest("hex").slice(0,20);
      stations.push({id:`web:${id}`,name:draft.name,brand:draft.brand,address:draft.address,state:normalizeState(draft.state),
        location,routeMiles:projection.miles,routeMinutes:projection.minutes,detourMiles,detourMinutes:detourMiles/25*60+2,
        amenities:draft.amenities,membersOnly:/costco|sam.?s club/i.test(draft.name),price:null,open:"Hours not confirmed",
        mapUrl:`https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=18/${location.lat}/${location.lng}`,source:draft.source});
    }catch{unmatchedAddresses++;}
  }
  stations.sort((a,b)=>a.routeMiles-b.routeMiles);
  return {stations,unmatchedAddresses};
}
