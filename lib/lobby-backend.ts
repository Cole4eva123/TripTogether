// The only integration boundary with the team's accounts/trips backend.
import type { Member, Trip } from "./types.ts";
import type { execute } from "./postgres.ts";
import { sharedLobbyBackend } from "./lobby-backend.config.ts";
export interface SharedLobbyBackend {
  tripsFor(userId: string): Promise<Trip[]>;
  tripMembers(tripId: string): Promise<Member[]>;
  tripExists(tripId: string): Promise<boolean>;
  userName(userId: string): Promise<string>;
  // Must execute membership insertion through the supplied executor, on the same PostgreSQL transaction.
  addMember(tripId: string, userId: string, transactionExecute: typeof execute): Promise<void>;
}
const state = globalThis as typeof globalThis & { __sharedLobbyBackend?: SharedLobbyBackend };
export function configureLobbyBackend(backend: SharedLobbyBackend) { state.__sharedLobbyBackend = backend; }
export function lobbyBackendReady() { return !!(state.__sharedLobbyBackend ?? sharedLobbyBackend); }
function backend(): SharedLobbyBackend {
 const value=state.__sharedLobbyBackend ?? sharedLobbyBackend;
 if(!value) throw new Error("Shared lobby awaits the team's PostgreSQL accounts/trips adapter. See docs/lobby-integration.md.");
 return value;
}
export const tripsFor=(id:string)=>backend().tripsFor(id);
export const tripMembers=(id:string)=>backend().tripMembers(id);
export const tripExists=(id:string)=>backend().tripExists(id);
export const userName=(id:string)=>backend().userName(id);
export const tripMemberIds=async(id:string)=>(await tripMembers(id)).map(member=>member.id);
export const tripMemberName=async(id:string,userId:string)=>(await tripMembers(id)).find(member=>member.id===userId)?.name ?? null;
export const addMember=(tripId:string,userId:string,executor:typeof execute)=>backend().addMember(tripId,userId,executor);
export function withLobbyBackend<T extends unknown[]>(handler: (...args:T)=>Promise<Response>) {
 return async (...args:T) => lobbyBackendReady() ? handler(...args) : Response.json({error:"Shared lobby awaits the team's PostgreSQL accounts/trips integration."},{status:503});
}
