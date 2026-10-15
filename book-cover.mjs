export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function safeCoverUrl(value) {
  if (typeof value !== 'string' || !/^https:\/\/covers\.openlibrary\.org\/b\/(?:id\/\d+|olid\/OL\d+M)-[SML]\.jpg(?:\?default=false)?$/.test(value)) return null;
  return value.includes('?') ? value : value + '?default=false';
}
export function coverHtml(book, small = false) {
  const url = safeCoverUrl(book.cover_url);
  return `<figure class="book-cover${small ? ' book-cover-small' : ''}" aria-label="Couverture de ${escapeHtml(book.title)}"><div class="book-cover-fallback"><span class="book-cover-title">${escapeHtml(book.title || 'Sans titre')}</span><span class="book-cover-author">${escapeHtml(book.author || '')}</span><span class="book-cover-note">Couverture indisponible</span></div>${url ? `<img data-book-cover src="${escapeHtml(url)}" alt="Couverture de ${escapeHtml(book.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</figure>`;
}
