import type { BStatsSettings } from '../../config/Config';
import type { BStatsChartFilter } from './charts';

/** The `stats.bstats` settings a fresh config has, with the given switches changed. */
export const bstatsSettings = (overrides: Partial<BStatsSettings> = {}): BStatsSettings => ({
    enabled: true,
    'log-errors': false,
    'log-sent-data': false,
    'log-response-status-text': false,
    ...overrides
});

/**
 * Whether bstats.org keeps a value under a chart's allowlist filter: the value is one of the
 * listed values, or matches the regex in full.
 */
export const matchesFilter = (filter: BStatsChartFilter, value: string): boolean =>
    'values' in filter ? filter.values.includes(value) : new RegExp(`^(?:${filter.regex})$`).test(value);
