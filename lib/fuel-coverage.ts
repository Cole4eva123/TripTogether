import type { FuelPreferences, RoadRoute, RoutePoint, Station } from "./fuel-types.ts";
import { distanceMiles, findCoverageGaps, selectStops } from "./gasoline-intelligence.ts";
import type { PlanningSearch } from "./gasoline-intelligence.ts";
import { FuelError } from "./fuel-validation.ts";

export function pointAlongRoute(route:RoadRoute,value:number,axis:"minutes"|"miles"="minutes"):RoutePoint {
  const points=route.points;
  if(!points.length)throw new FuelError("The road route has no geometry.",502);
  const target=Math.max(points[0][axis],Math.min(value,points.at(-1)![axis]));
  let lo=0,hi=points.length-1;
  while(lo<hi) {const mid=Math.floor((lo+hi)/2);if(points[mid][axis]<target)lo=mid+1;else hi=mid;}
  const b=points[lo],a=points[Math.max(0,lo-1)],fraction=(target-a[axis])/(b[axis]-a[axis] || 1);
  return {lat:a.lat+fraction*(b.lat-a.lat),lng:a.lng+fraction*(b.lng-a.lng),
    miles:a.miles+fraction*(b.miles-a.miles),minutes:a.minutes+fraction*(b.minutes-a.minutes)};
}

export function coverageSearchPoints(search:PlanningSearch,input:FuelPreferences,limit=6):RoutePoint[] {
  const targetMinutes=Math.min(input.intervalMinutes,150);
  const usableRange=input.vehicle.tankGallons*(1-input.reservePercent/100)*input.vehicle.mpg;
  const startingRange=input.vehicle.tankGallons*(input.initialFuelPercent-input.reservePercent)/100*input.vehicle.mpg;
  const sections=findCoverageGaps(search,input).map(gap=>{
    const targets:RoutePoint[]=[];
    let fromMiles=gap.fromMiles,fromMinutes=gap.fromMinutes;
    for(let i=0;i<12;i++) {
      const remainingMiles=gap.toMiles-fromMiles,remainingMinutes=gap.toMinutes-fromMinutes;
      const range=fromMiles===0?startingRange:usableRange;
      const segments=Math.max(2,Math.ceil(remainingMinutes/targetMinutes),Math.ceil(remainingMiles/(usableRange*0.8)));
      const timePoint=pointAlongRoute(search.route,fromMinutes+remainingMinutes/segments);
      const rangePoint=pointAlongRoute(search.route,fromMiles+Math.max(0,range)*0.8,"miles");
      const point=timePoint.miles<=rangePoint.miles?timePoint:rangePoint;
      if(point.miles<=fromMiles+0.01 || point.miles>=gap.toMiles-0.01)break;
      targets.push(point);fromMiles=point.miles;fromMinutes=point.minutes;
      if(gap.toMinutes-fromMinutes<=targetMinutes && gap.toMiles-fromMiles<=usableRange*0.8)break;
    }
    return targets;
  });
  // Round-robin across sections: a long missing prefix must not crowd out the missing final leg.
  const targets:RoutePoint[]=[];
  for(let i=0;targets.length<limit && sections.some(section=>section[i]);i++) {
    for(const section of sections)if(section[i] && targets.length<limit)targets.push(section[i]);
  }
  return targets.sort((a,b)=>a.minutes-b.minutes);
}

export async function fillStationCoverage(search:PlanningSearch,input:FuelPreferences,
  findMore:(points:RoutePoint[])=>Promise<Station[]>,maxRounds=2) {
  const current:PlanningSearch={...search,stations:[...search.stations]};
  const warnings:string[]=[];
  for(let round=0;round<maxRounds;round++) {
    try {selectStops(current,input);break;}
    catch(error) {if(!(error instanceof FuelError) || error.status!==422)throw error;}
    const points=coverageSearchPoints(current,input);
    if(!points.length)break;
    let additional:Station[];
    try {additional=await findMore(points);}
    catch(error) {warnings.push(`Could not complete the extra station search. ${error instanceof FuelError?error.message:"Try again later."}`);break;}
    let count=0;
    for(const station of additional) {
      const duplicate=current.stations.some(s=>s.id===station.id ||
        (s.name.toLowerCase()===station.name.toLowerCase() && distanceMiles(s.location,station.location)<0.04));
      if(!duplicate){current.stations.push(station);count++;}
    }
    if(!count)break;
    warnings.push(`Expanded the search in uncovered route sections and added ${count} station candidates.`);
  }
  current.stations.sort((a,b)=>a.routeMiles-b.routeMiles);
  return {stations:current.stations,warnings};
}
