// The build of these pages: the last commit of the site's sources, its date, and whether they
// had uncommitted changes (src/tools/build.js). src/tools/build.js writes the real values into dist/js/version.js; the
// sources served by the dev server say "dev".
export const BUILD = {"commit":"5b2bb5a","full":"5b2bb5a8e9a864ff747d7e6d24847051404e5267","date":"2026-11-17","dirty":true,"protocol":"1.0"};

// "Version 1a2b3c4 · 2026-10-20" — what a user quotes in a report
export function buildText(label) {
  if (BUILD.commit === 'dev') return `${label} dev`;
  return `${label} ${BUILD.commit}${BUILD.dirty ? '+dev' : ''} · ${BUILD.date}`;
}
