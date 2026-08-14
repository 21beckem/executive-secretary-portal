/** 'Temple Recommend' -> 'temple-recommend', used as a data-attribute for CSS color hooks. */
export function slugify(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Escapes text before injecting into innerHTML templates. */
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}


/** Converts a solid color to a background color with a specified transparency. */
export function colorToTintedWhite(hex, factor=0.88, alpha=0.75) {
  const clean = hex.replace('#', '');
  const t = Math.max(0, Math.min(1, factor));
  const bigint = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  let r = (bigint >> 16) & 255;
  let g = (bigint >> 8) & 255;
  let b = bigint & 255;
  r = Math.round(r + (255 - r) * t);
  g = Math.round(g + (255 - g) * t);
  b = Math.round(b + (255 - b) * t);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}