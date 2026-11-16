export const categories = ["Sightseeing", "Food", "Outdoors", "Culture", "Adventure", "Relaxation"] as const;
export type LotteryBoxCategory = (typeof categories)[number];

export type LotteryBoxSettings = {
  destination: string;
  date: string;
  startTime: string;
  budget: number; // USD per person, activity costs only
  availableMinutes: number;
  maxStops: number;
  preferences: LotteryBoxCategory[];
};

export type LotteryBoxOptionInput = {
  title: string;
  place: string;
  category: LotteryBoxCategory;
  cost: number;
  durationMinutes: number;
  note: string;
};

export type LotteryBoxOption = LotteryBoxOptionInput & {
  id: string;
  destination: string;
  submittedBy: string | null; // null means a demo suggestion
  addedBy: string;
};

export type LotteryBoxResult = {
  stops: (LotteryBoxOption & { time: string })[];
  totalCost: number;
  totalMinutes: number;
};

export type LotteryBoxView = {
  id: string;
  settings: LotteryBoxSettings;
  status: "collecting" | "revealed";
  ownOptions: LotteryBoxOption[];
  submissions: { memberId: string; count: number }[];
  eligibleCount: number;
  demoCount: number;
  revealedOptions: LotteryBoxOption[] | null;
  result: LotteryBoxResult | null;
  saved: boolean;
};
