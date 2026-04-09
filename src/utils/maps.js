/**
 * Generate a Google Maps search URL for an address or place name.
 * No API key needed, just constructs the URL.
 */
export function mapsUrl(address) {
  if (!address) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
