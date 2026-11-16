"use client";
import { useState } from "react";
import LobbyDate from "./LobbyDate";
import type { LobbyFilters } from "@/lib/types";

type Props = {
 query: string; from: string; to: string; sort: LobbyFilters["sort"];
 onQuery: (value:string)=>void; onFrom:(value:string)=>void; onTo:(value:string)=>void;
 onSort:(value:LobbyFilters["sort"])=>void; onReset:()=>void;
};
const field="min-h-10 w-full min-w-0 rounded-lg border border-line/60 bg-white px-3 text-[13px] text-asphalt focus:border-green focus:outline-none focus:ring-2 focus:ring-green/10";
export default function LobbyFiltersBar({query,from,to,sort,onQuery,onFrom,onTo,onSort,onReset}:Props) {
 const [reset,setReset]=useState(0);
 const active=!!(query || from || to || sort!=="closest");
 return <div className="rounded-xl border border-line/60 bg-white shadow-[0_2px_8px_rgba(35,39,43,0.025)]">
  <div className="flex min-w-0 items-center gap-3 border-b border-line/40 px-4 focus-within:bg-paper/30 focus-within:ring-2 focus-within:ring-inset focus-within:ring-green/35">
   <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0 text-muted"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg>
   <label htmlFor="lobbyQuery" className="sr-only">Search by destination or note</label>
   <input id="lobbyQuery" type="search" placeholder="Destination, departure city or note" value={query} onChange={e=>onQuery(e.target.value)} className="min-h-14 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-[14px] outline-none focus:outline-none" />
  </div>
  <div className="grid grid-cols-[1fr_1fr_1.3fr] items-end gap-3 p-4 max-[1099px]:grid-cols-2">
   <LobbyDate key={"from"+from+reset} id="lobbyFrom" label="From date" value={from} onChange={onFrom}/>
   <LobbyDate key={"to"+to+reset} id="lobbyTo" label="To date" value={to} onChange={onTo}/>
   <div className="grid min-w-0 gap-1.5 max-[1099px]:col-span-2"><label htmlFor="lobbySort" className="text-[11px] font-semibold tracking-wide text-muted">Sort by</label><select id="lobbySort" value={sort} onChange={e=>onSort(e.target.value as LobbyFilters["sort"])} className={field}><option value="closest">Closest to my trip first</option><option value="soonest">Leaving soonest</option><option value="soonest-end">Back soonest</option></select></div>
  </div>
  {active && <div className="flex items-center justify-between gap-3 border-t border-line/40 px-4 py-2.5"><span className="text-[12px] text-muted">Showing filtered trips</span><button type="button" className="link-btn text-[12px]" onClick={()=>{setReset(v=>v+1);onReset()}}>Clear filters</button></div>}
 </div>;
}
