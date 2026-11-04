// Seed/demo account name patterns shared by the admin and instructor
// dashboards. Filter these before any individual data surfaces, and always
// give the viewer a visible way to un-hide them (no silent data loss).

export const SEED_NAME_PATTERNS: RegExp[] = [
  /^hello\s+students?$/i,
  /^newstu\s*dash$/i,
  /\btest\b/i,
  /\bdemo\b/i,
  /^unknown\s+student$/i,
];

export const isSeedName = (name: string) =>
  !name || SEED_NAME_PATTERNS.some(r => r.test(name.trim()));
