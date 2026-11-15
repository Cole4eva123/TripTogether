"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RoadRoute, Station } from "@/lib/fuel-types";

type Props = { route:RoadRoute|null;stations:Station[];selectedIds:string[];activeId:string|null;onPick:(id:string) => void };
export default function FuelMap({route,stations,selectedIds,activeId,onPick}:Props) {
  const element=useRef<HTMLDivElement>(null), map=useRef<Leaflet.Map|null>(null), library=useRef<typeof Leaflet|null>(null);
  const layers=useRef<Leaflet.LayerGroup|null>(null), fitted=useRef<RoadRoute|null>(null);
  const [ready,setReady]=useState(false), [error,setError]=useState("");
  useEffect(() => {
    let disposed=false;
    import("leaflet").then(L => {
      if (disposed || !element.current) return;
      library.current=L;
      const instance=L.map(element.current,{scrollWheelZoom:false}).setView([39.8,-96.6],4);
      map.current=instance;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(instance);
      layers.current=L.layerGroup().addTo(instance);
      setReady(true);
    }).catch(() => setError("The interactive map could not load. Station details remain available below."));
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
      const info=document.createElement("p");info.textContent=[station.address || "Address not mapped",station.state,`${station.routeMiles.toFixed(1)} mi along original route`,station.price?`Reported $${station.price.perGallon.toFixed(3)}/gal`:"Station price unknown"].filter(Boolean).join(" · ");
      popup.append(title,info);marker.bindPopup(popup);
      marker.on("click",() => onPick(station.id));
      if (active) marker.openPopup();
    }
  },[ready,route,stations,selectedIds,activeId,onPick]);
  return <div className="overflow-hidden rounded-xl border-2 border-line bg-white">
    <div ref={element} className="relative z-0 h-[460px] w-full max-sm:h-[340px]" aria-label="Interactive map of the route and gas stations" />
    <p className="px-4 py-2 text-[13px] text-muted">Green numbers: selected stops · Gray dots: alternatives. Click a station to see details. Map tiles: OpenStreetMap.</p>
    {error && <p role="alert" className="p-4 font-semibold text-red">{error}</p>}
  </div>;
}
