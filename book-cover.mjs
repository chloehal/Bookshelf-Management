export function safeCoverUrl(value) {
  if (typeof value === "string") {
    try {
      const url = new URL(value);
      if (
        url.origin === "https://openapi.bnf.fr" &&
        !url.username &&
        !url.password &&
        !url.hash &&
        url.pathname === "/couverture/image/image/recupererImage" &&
        [...url.searchParams].length === 2 &&
        url.searchParams.get("couverture") === "1" &&
        /^ark:\/12148\/cb\d{8}[0-9a-z]$/.test(
          url.searchParams.get("idArk") || "",
        )
      )
        return url.href;
    } catch {
      /* Invalid URLs do not become image sources. */
    }
  }
  if (
    typeof value !== "string" ||
    !/^https:\/\/covers\.openlibrary\.org\/b\/(?:id\/\d+|olid\/OL\d+M)-[SML]\.jpg(?:\?default=false)?$/.test(
      value,
    )
  )
    return null;
  return value.includes("?") ? value : value + "?default=false";
}
