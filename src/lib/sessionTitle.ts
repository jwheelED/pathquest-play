/** Default live-session title so instructors never have to type one: "CS 101 – Nov 5". */
export function defaultSessionTitle(courseTitle?: string | null, date: Date = new Date()): string {
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const name = courseTitle?.trim();
  return name ? `${name} – ${day}` : `Session – ${day}`;
}
