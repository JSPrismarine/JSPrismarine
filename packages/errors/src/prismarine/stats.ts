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
    DuplicateMetric: 'Stats metric "{name}" is already registered',
    /**
     * A bStats chart name is not `snake_case`, so it has no chart ID. This is a bug in the server;
     * report it with the stack trace.
     */
    BadChartName: 'bStats chart name "{name}" is not snake_case and has no chart ID',
    /**
     * A bStats chart name maps onto a chart ID bStats fills itself. This is a bug in the server;
     * report it with the stack trace.
     */
    ChartTakesDefaultId: 'bStats chart name "{name}" maps onto the default chart "{id}"',
    /**
     * bStats answered a usage report with an error status. The report is dropped and the next one
     * is sent on schedule; it is logged only when `stats.bstats.log-errors` is on.
     */
    SubmitRejected: 'bStats answered {status} {statusText}',
    /**
     * bStats did not answer a usage report in time, so the server gave up on it. The next report is
     * sent on schedule; it is logged only when `stats.bstats.log-errors` is on.
     */
    SubmitTimedOut: 'no answer within {seconds} seconds',
    /**
     * The server stopped while a usage report was in flight, so the report was abandoned. It is
     * never logged, since the server logs nothing from bStats after it stops.
     */
    SubmitAbandoned: 'the server stopped'
});
