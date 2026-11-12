import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';

/** The errors the usage statistics code of `@jsprismarine/prismarine` throws. */
export const PrismarineStatsErrors = defineErrors('prismarine', {
    /**
     * Code registered a stats metric under a name that is not a `snake_case` namespace and name,
     * such as `jsprismarine:players`. Rename the metric.
     */
    BadMetricName: 'Stats metric name "{name}" must be a snake_case namespace and name, such as "jsprismarine:players"',
    /**
     * Code registered a stats metric under a name another metric already has. Give the metric a
     * name of its own, or dispose the other registration first.
     */
    DuplicateMetric: 'Stats metric "{name}" is already registered'
});
