/** A per-request reference for handling applications without showing personal names. */
export function requestLabel(id: string) { return `Request ${id.replaceAll("-", "").slice(0, 6).toUpperCase()}`; }
