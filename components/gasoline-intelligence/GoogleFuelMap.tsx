"use client";

import { useEffect, useRef, useState } from "react";
import type { Coordinate, RoadRoute, Source } from "@/lib/gasoline-intelligence/types";
import { formatDistance, type DistanceUnit } from "@/lib/gasoline-intelligence/display";
import { createMapDisclosure } from "./AnimatedDisclosure";
import { duration } from "./FuelResults";
import type { FuelMapProps, MapStation } from "./FuelMap";

// Keep the Google integration independent of SDK packages and of server credentials.
type MapListener = { remove(): void };
type MapBounds = { extend(position: Coordinate): void };
type GoogleMap = { fitBounds(bounds: MapBounds, padding: number): void };
type GoogleMarker = {
  map: GoogleMap | null;
  addListener(event: "click", callback: () => void): MapListener;
};
type GooglePolyline = { setMap(map: GoogleMap | null): void };
type GoogleInfoWindow = {
  setContent(content: HTMLElement): void;
  open(options: { map: GoogleMap; anchor: GoogleMarker; shouldFocus: boolean }): void;
  close(): void;
};
type GoogleMapsApi = {
  Map: new (element: HTMLElement, options: {
    center: Coordinate; zoom: number; mapId: string; gestureHandling: string;
    scrollwheel: boolean; streetViewControl: boolean; mapTypeControl: boolean;
  }) => GoogleMap;
  LatLngBounds: new () => MapBounds;
  Polyline: new (options: {
    map: GoogleMap; path: Coordinate[]; strokeColor: string; strokeOpacity: number; strokeWeight: number;
  }) => GooglePolyline;
  InfoWindow: new (options: { maxWidth: number }) => GoogleInfoWindow;
  marker: {
    AdvancedMarkerElement: new (options: {
      map: GoogleMap; position: Coordinate; content: HTMLElement; title: string; zIndex: number;
    }) => GoogleMarker;
  };
  event: { clearInstanceListeners(instance: GoogleMap): void };
};
type GoogleMapsWindow = Window & {
  google?: { maps?: GoogleMapsApi };
  __tripTogetherGoogleMapsReady?: () => void;
};
type MapOverlays = { markers: GoogleMarker[]; listeners: MapListener[]; line: GooglePolyline | null };

const browserKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const missingKeyMessage = "Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local and restart the dev server to display this Google map.";
let mapsPromise: Promise<GoogleMapsApi> | null = null;

/** One script is shared across mounts; an unmounted map never removes another map's script. */
function loadGoogleMaps(key: string): Promise<GoogleMapsApi> {
  const mapsWindow = window as GoogleMapsWindow;
  const available = mapsWindow.google?.maps;
  if (available?.Map && available.marker?.AdvancedMarkerElement) return Promise.resolve(available);
  if (mapsPromise) return mapsPromise;
  const attempt = new Promise<GoogleMapsApi>((resolve, reject) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => fail(), 20_000);
    const clean = () => {
      window.clearTimeout(timer);
      delete mapsWindow.__tripTogetherGoogleMapsReady;
      script.onerror = null;
    };
    const fail = () => {
      clean();
      script.remove();
      reject(new Error("Google Maps could not load."));
    };
    mapsWindow.__tripTogetherGoogleMapsReady = () => {
      const api = mapsWindow.google?.maps;
      if (!api?.Map || !api.marker?.AdvancedMarkerElement) { fail(); return; }
      clean();
      resolve(api);
    };
    const params = new URLSearchParams({
      key, loading: "async", callback: "__tripTogetherGoogleMapsReady", libraries: "maps,marker", v: "weekly",
      language: "en", region: "US",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = fail;
    document.head.append(script);
  });
  mapsPromise = attempt.catch(error => {
    mapsPromise = null;
    throw error;
  });
  return mapsPromise;
}

function clearOverlays(overlays: MapOverlays) {
  overlays.listeners.forEach(listener => listener.remove());
  overlays.markers.forEach(marker => { marker.map = null; });
  overlays.line?.setMap(null);
  overlays.listeners = [];
  overlays.markers = [];
  overlays.line = null;
}

function uniqueAttributions(sources: Source[]): Source[] {
  const unique = new Map<string, Source>();
  for (const source of sources) {
    try {
      const url = new URL(source.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      if (!unique.has(url.href)) unique.set(url.href, { title: source.title.trim() || url.hostname, url: url.href });
    } catch { /* Ignore malformed attribution links. */ }
  }
  return [...unique.values()];
}

function stationPopup(station: MapStation, distanceUnit: DistanceUnit): HTMLElement {
  const popup = document.createElement("div");
  popup.className = "text-[14px] text-asphalt";
  const title = document.createElement("strong");
  title.textContent = station.name;
  const address = document.createElement("p");
  address.className = "mt-1";
  address.textContent = station.address || "Address not mapped";
  const price = document.createElement("p");
  price.className = "mt-2 font-semibold";
  price.textContent = station.displayPrice ? `${money.format(station.displayPrice.value)}/gal` : "Price unavailable";
  const distances = document.createElement("div");
  distances.className = "grid gap-1";
  const prefix = station.distances.estimated ? "~" : "";
  for (const [miles, label] of [
    [station.distances.fromStart, "from start"],
    [station.distances.fromPrevious, `from ${station.distances.previousLabel}`],
    [station.distances.toDestination, "to destination"],
  ] as const) {
    const row = document.createElement("div");
    row.textContent = `${prefix}${formatDistance(miles, distanceUnit)} ${label}`;
    distances.append(row);
  }
  popup.append(title, address, price, createMapDisclosure("Distance Details", distances));
  const sources = uniqueAttributions(station.attributions ?? []);
  if (sources.length) {
    const attribution = document.createElement("p");
    attribution.className = "mt-3 text-[12px] text-muted";
    attribution.append(document.createTextNode("Place data: "));
    sources.forEach((source, index) => {
      if (index) attribution.append(document.createTextNode(" · "));
      const link = document.createElement("a");
      link.href = source.url;
      link.textContent = source.title;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "underline underline-offset-2";
      attribution.append(link);
    });
    popup.append(attribution);
  }
  return popup;
}

export default function GoogleFuelMap({ route, stations, selectedIds, activeId, onPick, distanceUnit }: FuelMapProps) {
  const element = useRef<HTMLDivElement>(null);
  const api = useRef<GoogleMapsApi | null>(null);
  const map = useRef<GoogleMap | null>(null);
  const infoWindow = useRef<GoogleInfoWindow | null>(null);
  const fitted = useRef<RoadRoute | null>(null);
  const overlays = useRef<MapOverlays>({ markers: [], listeners: [], line: null });
  const [ready, setReady] = useState(0);
  const [error, setError] = useState(browserKey ? "" : missingKeyMessage);
  const attributions = uniqueAttributions(stations.flatMap(station => station.attributions ?? []));

  useEffect(() => {
    if (!browserKey) return;
    let disposed = false;
    const container = element.current;
    const ownOverlays = overlays.current;
    loadGoogleMaps(browserKey).then(library => {
      if (disposed || !container) return;
      api.current = library;
      map.current = new library.Map(container, {
        center: { lat: 39.8, lng: -96.6 }, zoom: 4, mapId,
        gestureHandling: "greedy", scrollwheel: true, streetViewControl: false, mapTypeControl: false,
      });
      infoWindow.current = new library.InfoWindow({ maxWidth: 320 });
      setReady(value => value + 1);
    }).catch(() => {
      if (!disposed) setError("Google map unavailable. Check the browser key and Maps JavaScript API access, then reload the page.");
    });
    return () => {
      disposed = true;
      clearOverlays(ownOverlays);
      infoWindow.current?.close();
      if (map.current) api.current?.event.clearInstanceListeners(map.current);
      map.current = null;
      infoWindow.current = null;
      api.current = null;
      fitted.current = null;
      container?.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const library = api.current, instance = map.current, popup = infoWindow.current;
    if (!ready || !library || !instance || !popup) return;
    const currentOverlays = overlays.current;
    clearOverlays(currentOverlays);
    popup.close();
    if (!route) return;
    currentOverlays.line = new library.Polyline({
      map: instance, path: route.points.map(({ lat, lng }) => ({ lat, lng })), strokeColor: "#0a6e4f", strokeOpacity: 0.85, strokeWeight: 5,
    });
    if (fitted.current !== route) {
      const bounds = new library.LatLngBounds();
      bounds.extend(route.origin);
      route.points.forEach(({ lat, lng }) => bounds.extend({ lat, lng }));
      bounds.extend(route.destination);
      instance.fitBounds(bounds, 35);
      fitted.current = route;
    }
    for (const [position, label, text] of [
      [route.origin, "Start", "A"], [route.destination, "Destination", "B"],
    ] as const) {
      const node = document.createElement("div");
      node.className = "grid h-7 w-7 place-items-center rounded-full border-[3px] border-asphalt bg-white text-[13px] font-bold text-asphalt shadow";
      node.textContent = text;
      currentOverlays.markers.push(new library.marker.AdvancedMarkerElement({ map: instance, position, content: node, title: label, zIndex: 200 }));
    }
    for (const station of stations) {
      const index = selectedIds.indexOf(station.id), selected = index >= 0, active = station.id === activeId;
      const node = document.createElement("div");
      node.textContent = selected ? String(index + 1) : "\u2022";
      node.className = selected
        ? "grid h-8 w-8 cursor-pointer place-items-center rounded-full border-2 border-white bg-green text-[15px] font-bold text-white shadow-lg"
        : "grid h-5 w-5 cursor-pointer place-items-center rounded-full border-2 border-white bg-muted text-[16px] text-white shadow";
      if (active) node.style.outline = "3px solid #f2b705";
      const marker = new library.marker.AdvancedMarkerElement({
        map: instance, position: station.location, content: node, title: station.name, zIndex: active ? 300 : selected ? 100 : 1,
      });
      currentOverlays.markers.push(marker);
      const preview = () => {
        popup.setContent(stationPopup(station, distanceUnit));
        popup.open({ map: instance, anchor: marker, shouldFocus: false });
      };
      currentOverlays.listeners.push(marker.addListener("click", () => { preview(); onPick(station.id); }));
      if (active) preview();
    }
  }, [ready, route, stations, selectedIds, activeId, onPick, distanceUnit]);

  return <div className="overflow-hidden rounded-xl border-2 border-line bg-white">
    <div className="relative h-[460px] max-sm:h-[340px]">
      <div ref={element} className="h-full w-full" aria-label="Interactive Google map of the route and gas stations" />
      {error && <div role="alert" className="absolute inset-0 grid place-items-center bg-paper p-6 text-center text-[15px] font-semibold text-red">{error}</div>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-[13px]">
      {route && <p className="font-semibold">{formatDistance(route.miles, distanceUnit, 0)} · {duration(route.minutes)} driving</p>}
      <p className="text-muted">Scroll to zoom. Click a station to preview.</p>
    </div>
    {attributions.length > 0 && <p className="border-t border-line px-4 py-2 text-[12px] text-muted">
      Place data: {attributions.map((source, index) => <span key={source.url}>
        {index > 0 && " · "}<a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{source.title}</a>
      </span>)}
    </p>}
  </div>;
}
