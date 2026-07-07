// Shape of the per-streaming-service catalog groupings ("provider rooms").
// These no longer drive a dedicated home section, but the groupings still
// feed the discovery rails via the room top-up helpers, so the types live in
// lib rather than a component.

export type ProviderItem = {
  externalId?: string;
  externalSource?: string;
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  homeSignal?: string | null;
};

export type ProviderRoom = {
  key: string;
  label: string;
  logoUrl: string;
  /** Brand tint associated with the service. */
  tint: string;
  items: ProviderItem[];
};
