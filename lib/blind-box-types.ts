export const categories = ["Sightseeing", "Food", "Outdoors", "Culture", "Adventure", "Relaxation"] as const;
export type BlindBoxCategory = (typeof categories)[number];

export type BlindBoxSettings = {
  destination: string;
  date: string;
  startTime: string;
  budget: number; // USD per person, activity costs only
  availableMinutes: number;
  maxStops: number;
  preferences: BlindBoxCategory[];
};

export type BlindBoxOptionInput = {
  title: string;
  place: string;
  category: BlindBoxCategory;
  cost: number;
  durationMinutes: number;
  note: string;
};

export type BlindBoxOption = BlindBoxOptionInput & {
  id: string;
  destination: string;
  submittedBy: string | null; // null means a demo suggestion
  addedBy: string;
};

export type BlindBoxResult = {
  stops: (BlindBoxOption & { time: string })[];
  totalCost: number;
  totalMinutes: number;
};

export type BlindBoxView = {
  id: string;
  settings: BlindBoxSettings;
  status: "collecting" | "revealed";
  ownOptions: BlindBoxOption[];
  submissions: { memberId: string; count: number }[];
  eligibleCount: number;
  demoCount: number;
  revealedOptions: BlindBoxOption[] | null;
  result: BlindBoxResult | null;
  saved: boolean;
};
