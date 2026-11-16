// Team-owned integration point. Deliberately unbound: no replacement auth/trip backend is shipped.
// Configure the team's PostgreSQL store here after it lands on dev. Contract: ./lobby-backend.ts.
import type { SharedLobbyBackend } from "./lobby-backend.ts";
export const sharedLobbyBackend: SharedLobbyBackend | null = null;
