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
export function colorToTintedWhite(hex, factor=0.65, alpha=0.75) {
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

/** Given a date, returns something like: 15th, 2nd, 1st, 23rd, etc. */
export function getDayWithOrdinal(date) {
  const day = date.getUTCDate();
  const suffix = ["th", "st", "nd", "rd"][
    ((day % 100 - 20) % 10) && day % 10 <= 3 ? day % 10 : 0
  ];
  return `${day}<sup>${suffix}</sup>`;
}

/**
 * Walks up from `el` to find the nearest ancestor that actually scrolls on
 * the given axis (has overflow: auto/scroll AND content that overflows it),
 * falling back to the page itself. Used to manually replicate native
 * scrolling on elements where touch-action: none has disabled it.
 */
export function findScrollableAncestor(el, axis) {
  let node = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const overflow = axis === 'y' ? style.overflowY : style.overflowX;
    const isScrollableStyle = overflow === 'auto' || overflow === 'scroll';
    const hasOverflowContent =
      axis === 'y' ? node.scrollHeight > node.clientHeight : node.scrollWidth > node.clientWidth;
    if (isScrollableStyle && hasOverflowContent) return node;
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Fallback: Unable to copy to clipboard', err);
      }
      document.body.removeChild(textarea);
    }
    return true;
  } catch (err) {
    console.error('Error copying to clipboard', err);
    return false;
  }
}
  