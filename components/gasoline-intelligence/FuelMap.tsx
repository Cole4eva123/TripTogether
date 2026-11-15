"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FuelStop, RoadRoute, Station } from "@/lib/fuel-types";
import { formatDistance, type DistanceUnit, type StationDistances } from "@/lib/fuel-display";
import { duration } from "./FuelResults";

type MapStation = Station & { displayPrice:{value:number;kind:FuelStop["priceKind"]}|null;distances:StationDistances };
type Props = { route:RoadRoute|null;stations:MapStation[];selectedIds:string[];activeId:string|null;onPick:(id:string) => void;distanceUnit:DistanceUnit };
const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
export default function FuelMap({route,stations,selectedIds,activeId,onPick,distanceUnit}:Props) {
  const element=useRef<HTMLDivElement>(null), map=useRef<Leaflet.Map|null>(null), library=useRef<typeof Leaflet|null>(null);
  const layers=useRef<Leaflet.LayerGroup|null>(null), fitted=useRef<RoadRoute|null>(null);
  const [ready,setReady]=useState(false), [error,setError]=useState("");
  useEffect(() => {
    let disposed=false;
    import("leaflet").then(L => {
      if (disposed || !element.current) return;
      library.current=L;
      const instance=L.map(element.current,{scrollWheelZoom:true}).setView([39.8,-96.6],4);
      map.current=instance;
      instance.attributionControl.setPosition("bottomleft");
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(instance);
      layers.current=L.layerGroup().addTo(instance);
      setReady(true);
    }).catch(() => setError("Map unavailable. Use the station list below."));
    return () => {disposed=true;map.current?.remove();map.current=null;layers.current=null;fitted.current=null;};
  },[]);
  useEffect(() => {
    const L=library.current, instance=map.current, group=layers.current;
    if (!ready || !L || !instance || !group) return;
    group.clearLayers();
    if (!route) return;
    const line=L.polyline(route.points.map(p => [p.lat,p.lng] as [number,number]),{color:"#0a6e4f",weight:5,opacity:0.85}).addTo(group);
    if (fitted.current !== route) {instance.fitBounds(line.getBounds(),{padding:[35,35]});fitted.current=route;}
    const endpoint=(lat:number,lng:number,label:string) => {
      const node=document.createElement("strong");node.textContent=label;
      L.circleMarker([lat,lng],{radius:9,color:"#23272b",fillColor:"#fff",fillOpacity:1,weight:3}).bindTooltip(node).addTo(group);
    };
    endpoint(route.origin.lat,route.origin.lng,"Start");endpoint(route.destination.lat,route.destination.lng,"Destination");
    for (const station of stations) {
      const index=selectedIds.indexOf(station.id), selected=index>=0, active=station.id===activeId;
      const node=document.createElement("div");
      node.textContent=selected ? String(index+1) : "•";
      node.className="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-green text-[15px] font-bold text-white shadow-lg";
      if (!selected) node.className="grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-muted text-[16px] text-white shadow";
      if (active) node.style.outline="3px solid #f2b705";
      const marker=L.marker([station.location.lat,station.location.lng],{
        icon:L.divIcon({html:node,className:"",iconSize:selected?[32,32]:[20,20],iconAnchor:selected?[16,16]:[10,10]}),
        title:station.name,keyboard:true,zIndexOffset:selected?100:0,
      }).addTo(group);
      const popup=document.createElement("div");
      const title=document.createElement("strong");title.textContent=station.name;
      const price=station.displayPrice;
      const info=document.createElement("p");info.textContent=station.address || "Address not mapped";
      const distances=document.createElement("div");distances.className="grid gap-1";
      const prefix=station.distances.estimated?"~":"";
      for(const [miles,label] of [
        [station.distances.fromStart,"from start"],
        [station.distances.fromPrevious,`from ${station.distances.previousLabel}`],
        [station.distances.toDestination,"to destination"],
      ] as const) {
        const row=document.createElement("div");row.textContent=`${prefix}${formatDistance(miles,distanceUnit)} ${label}`;distances.append(row);
      }
      const cost=document.createElement("p");cost.className="font-semibold";cost.textContent=price?`${money.format(price.value)}/gal`:"Price unavailable";
      popup.append(title,info,distances,cost);marker.bindPopup(popup);
      marker.on("click",() => onPick(station.id));
      if (active) marker.openPopup();
    }
  },[ready,route,stations,selectedIds,activeId,onPick,distanceUnit]);
  return <div className="overflow-hidden rounded-xl border-2 border-line bg-white">
    <div ref={element} className="relative z-0 h-[460px] w-full max-sm:h-[340px]" aria-label="Interactive map of the route and gas stations" />
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-[13px]">
      {route && <p className="font-semibold">{formatDistance(route.miles,distanceUnit,0)} · {duration(route.minutes)} driving</p>}
      <p className="text-muted">Scroll to zoom. Click a station to preview.</p>
    </div>
    {error && <p role="alert" className="p-4 font-semibold text-red">{error}</p>}
  </div>;
}
