export type LocationKey =
  | "manhattan"
  | "brooklyn"
  | "queens"
  | "bronx"
  | "staten_island";

export type LocationInfo = {
  key: LocationKey;
  displayName: string;
  city: string;
  state: string;
  country: string;
  lat: number;
  lon: number;
};

export const DEFAULT_LOCATIONS: Record<LocationKey, LocationInfo> = {
  manhattan: {
    key: "manhattan",
    displayName: "Manhattan",
    city: "New York City",
    state: "NY",
    country: "USA",
    lat: 40.7831,
    lon: -73.9712
  },
  brooklyn: {
    key: "brooklyn",
    displayName: "Brooklyn",
    city: "New York City",
    state: "NY",
    country: "USA",
    lat: 40.6782,
    lon: -73.9442
  },
  queens: {
    key: "queens",
    displayName: "Queens",
    city: "New York City",
    state: "NY",
    country: "USA",
    lat: 40.7282,
    lon: -73.7949
  },
  bronx: {
    key: "bronx",
    displayName: "The Bronx",
    city: "New York City",
    state: "NY",
    country: "USA",
    lat: 40.8448,
    lon: -73.8648
  },
  staten_island: {
    key: "staten_island",
    displayName: "Staten Island",
    city: "New York City",
    state: "NY",
    country: "USA",
    lat: 40.5795,
    lon: -74.1502
  }
};

export function pickLocation(key: string): LocationInfo {
  const normalized = key
    .toLowerCase()
    .replace(/\s+/g, "_") as LocationKey;

  return DEFAULT_LOCATIONS[normalized] ?? DEFAULT_LOCATIONS.manhattan;
}
