"use client";

import { createContext, useContext } from "react";
import type { User } from "@/lib/types";

export const MeContext = createContext<User | null>(null);

/** The logged-in user under app/trips, or null while the layout is still checking the session. */
export const useMe = () => useContext(MeContext);
