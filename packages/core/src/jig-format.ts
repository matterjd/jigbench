/** The version stamp every `.jig/` root document carries (Survey, GaugeSet, WorkOrder
 * frontmatter, Fixture, Toolpath). Bump this — and add a migration — the day any of those
 * shapes changes in a way older files can't be read as. */
export const JIG_FORMAT = 1 as const;
export type JigFormat = typeof JIG_FORMAT;
