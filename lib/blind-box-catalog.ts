import type { BlindBoxCategory, BlindBoxOption } from "./blind-box-types";

// Illustrative seed ideas and estimates, not live prices, availability or opening hours.
const ideas: [string, string, string, BlindBoxCategory, number, number][] = [
  ["Chicago", "Find the Cloud Gate reflection", "Millennium Park", "Sightseeing", 0, 45],
  ["Chicago", "Take a lakeside walk", "Lakefront Trail", "Outdoors", 0, 60],
  ["Chicago", "Try a deep-dish lunch", "A restaurant in the Loop", "Food", 30, 75],
  ["Chicago", "Explore an art collection", "Art Institute of Chicago", "Culture", 35, 120],
  ["Chicago", "Explore the river on foot", "Chicago Riverwalk", "Adventure", 0, 60],
  ["Chicago", "Take a coffee break", "A cafe in the Loop", "Relaxation", 8, 30],
  ["New York", "Explore Central Park", "Central Park", "Outdoors", 0, 90],
  ["New York", "Walk across the Brooklyn Bridge", "Brooklyn Bridge", "Sightseeing", 0, 60],
  ["New York", "Try a neighborhood pizza spot", "A pizzeria in Manhattan", "Food", 15, 45],
  ["New York", "Visit an art museum", "The Metropolitan Museum of Art", "Culture", 35, 120],
  ["New York", "Explore a new neighborhood", "Lower Manhattan", "Adventure", 0, 60],
  ["New York", "Pause with a coffee", "A cafe near Bryant Park", "Relaxation", 8, 30],
  ["San Francisco", "See the Golden Gate Bridge", "Crissy Field", "Sightseeing", 0, 60],
  ["San Francisco", "Walk along the waterfront", "The Embarcadero", "Outdoors", 0, 75],
  ["San Francisco", "Try a neighborhood burrito", "Mission District", "Food", 18, 45],
  ["San Francisco", "Explore a modern art collection", "SFMOMA", "Culture", 30, 120],
  ["San Francisco", "Climb a city hill", "Twin Peaks", "Adventure", 0, 90],
  ["San Francisco", "Take a garden break", "Golden Gate Park", "Relaxation", 0, 45],
];

export const demoOptions: BlindBoxOption[] = ideas.map(([destination, title, place, category, cost, durationMinutes], index) => ({
  id: `demo-${index}`, destination, title, place, category, cost, durationMinutes, note: "Demo estimate. Check hours, prices and travel time before going.", submittedBy: null, addedBy: "Demo suggestion",
}));
