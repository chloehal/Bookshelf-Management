export function safeCoverUrl(value) {
  if (
    typeof value !== "string" ||
    !/^https:\/\/covers\.openlibrary\.org\/b\/(?:id\/\d+|olid\/OL\d+M)-[SML]\.jpg(?:\?default=false)?$/.test(
      value,
    )
  )
    return null;
  return value.includes("?") ? value : value + "?default=false";
}
