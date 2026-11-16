"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { PlaceSuggestion } from "@/lib/place-search";

type Found = { places: PlaceSuggestion[]; name: string | null };

/**
 * A place, picked from the gazetteer rather than typed out, so it can't be misspelt.
 *
 * Typing searches; the value only counts once it is a place's full name ("Chicago, Illinois"), which picking
 * from the list makes it. Until then the form it sits in won't submit. A value handed in from outside (a saved
 * trip's destination) is checked the same way, so one typed before this field existed has to be picked again.
 */
export default function PlaceField({
  id,
  name,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [found, setFound] = useState<{ for: string } & Found>({ for: "", places: [], name: null });
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const text = value.trim();
  const current = found.for === text ? found : null; // an answer for something typed earlier says nothing
  const valid = !!text && current?.name === value;
  const places = current && !valid ? current.places : [];
  const open = focused && places.length > 0;

  useEffect(() => {
    if (!text || valid) return; // nothing to look up: empty, or already a place
    // Wait for a pause in the typing, so each letter isn't its own request. An answer that arrives after more
    // typing is for older text, and `current` above ignores it.
    const timer = setTimeout(() => {
      api<Found>(`/places?${new URLSearchParams({ q: text })}`).then(
        (answer) => {
          setFound({ for: text, ...answer });
          setActive(0);
        },
        () => {}, // a search that failed leaves the field as it is: not yet a place
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [text, valid]);

  // The browser's own validation holds the form back, and says why next to the field.
  useEffect(() => {
    input.current?.setCustomValidity(valid || !text ? "" : "Pick a place from the list.");
  }, [valid, text]);

  function pick(place: PlaceSuggestion) {
    setFound({ for: place.label, places: [], name: place.label });
    onChange(place.label);
  }

  return (
    <div className="relative">
      <input
        ref={input}
        id={id}
        name={name}
        value={value}
        placeholder={placeholder}
        required
        maxLength={120}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        className="w-full"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive((active + (e.key === "ArrowDown" ? 1 : places.length - 1)) % places.length);
          } else if (e.key === "Enter") {
            e.preventDefault(); // choose the place; don't send the form with half a name
            pick(places[active]);
          } else if (e.key === "Escape") setFocused(false);
        }}
      />
      <ul
        id={listId}
        role="listbox"
        hidden={!open}
        className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border-2 border-line bg-white py-1 shadow-lg"
      >
        {places.map((place, index) => (
          <li
            key={place.label}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            className={`cursor-pointer px-3 py-2 ${index === active ? "bg-green/10" : ""}`}
            // mousedown, not click: the field would lose focus and close the list before a click landed
            onMouseDown={(e) => {
              e.preventDefault();
              pick(place);
            }}
            onMouseEnter={() => setActive(index)}
          >
            <span className="font-semibold">{place.name}</span>
            <span className="ml-2 text-[14px] text-muted">{[place.region, place.country].filter(Boolean).join(", ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
