// The site was renamed from "VGC MetaScope" (vgcmetascope.pages.dev) to
// MetaLens VGC. The old Cloudflare Pages project may still deploy this branch,
// so visitors there are sent to the new address, keeping their filters (hash).
// Preview deployments (<hash>.vgcmetascope.pages.dev) are left alone.
export const OLD_HOST = 'vgcmetascope.pages.dev';
export const NEW_ORIGIN = 'https://metalensvgc.pages.dev';

export function movedUrl(loc) {
  return loc.hostname === OLD_HOST ? `${NEW_ORIGIN}${loc.pathname}${loc.search}${loc.hash}` : null;
}

if (typeof location !== 'undefined') {
  const to = movedUrl(location);
  if (to) location.replace(to);
}
