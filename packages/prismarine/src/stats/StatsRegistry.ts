import { PrismarineStatsErrors } from '@jsprismarine/errors/prismarine/stats';
import type { KernelLogger } from '@jsprismarine/kernel';

import type { KindedMetric, MetricInfo, MetricKind, MetricValues, StatsMetric, StatsReading } from './StatsMetric';
import { errorMessage } from '../utils/errorMessage';
import { isMetricName } from './StatsMetric';
import type { StatsPlatform } from './StatsPlatform';
import { readPlatform } from './StatsPlatform';

/** What the server reports at one moment: the host, and every metric that had a value. */
export interface StatsSnapshot {
    readonly platform: StatsPlatform;
    /** Each metric's reading by metric name, in registration order. */
    readonly metrics: ReadonlyMap<string, StatsReading>;
}

/** Options for a {@link StatsRegistry}. */
export interface StatsRegistryOptions {
    /** Where a metric that throws is reported. */
    readonly logger: Pick<KernelLogger, 'warn'>;
    /** Reads the host description; `node:os` unless a test passes its own. */
    readonly platform?: () => StatsPlatform;
}

/**
 * Reads one metric, keeping its kind and value together so the reading stays narrowed. `copy`
 * gives the reading a value of its own, so a metric that later changes the array or object it
 * returned does not change a snapshot already taken.
 */
const readMetric = <K extends MetricKind>(
    metric: KindedMetric<K>,
    copy: (value: MetricValues[K]) => MetricValues[K] = (value) => value
): (MetricInfo & { readonly kind: K; readonly value: MetricValues[K] }) | undefined => {
    const value = metric.read();
    if (value === undefined) return undefined;
    const { kind, description, unit } = metric;
    return { kind, value: copy(value), description, ...(unit === undefined ? {} : { unit }) };
};

/** Narrows the metric by kind so each reading carries the value type its kind declares. */
const readAnyMetric = (metric: StatsMetric): StatsReading | undefined => {
    switch (metric.kind) {
        case 'gauge':
            return readMetric(metric);
        case 'label':
            return readMetric(metric);
        case 'set':
            return readMetric(metric, (value) => [...value]);
        case 'distribution':
            return readMetric(metric, (value) => ({ ...value }));
        case 'breakdown':
            return readMetric(metric, (value) =>
                Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, { ...inner }]))
            );
    }
};

/**
 * The server's named metrics. A module registers a metric for a value it owns, and the registry
 * reads a metric only when a provider asks, so nothing runs per tick. A module that registers in
 * its `start()` disposes the registration in its `stop()`, so a kernel restart registers it again.
 */
export class StatsRegistry {
    private readonly metrics = new Map<string, StatsMetric>();
    private readonly logger: Pick<KernelLogger, 'warn'>;
    private readonly platform: () => StatsPlatform;

    public constructor({ logger, platform = readPlatform }: StatsRegistryOptions) {
        this.logger = logger;
        this.platform = platform;
    }

    /**
     * Adds a metric.
     * @param metric - The metric, under a namespaced `snake_case` name such as
     * `jsprismarine:players`.
     * @returns A function that removes this registration again. Calling it twice, or after
     * another registration took the name, does nothing, even when that registration is of the
     * same metric object.
     * @throws {Error} When the name is badly formed or another metric already has it.
     */
    public register(metric: StatsMetric): () => void {
        if (!isMetricName(metric.name)) {
            throw new PrismarineStatsErrors.BadMetricName({ name: metric.name });
        }
        if (this.metrics.has(metric.name)) throw new PrismarineStatsErrors.DuplicateMetric({ name: metric.name });
        this.metrics.set(metric.name, metric);
        let disposed = false;
        return () => {
            if (disposed) return;
            disposed = true;
            if (this.metrics.get(metric.name) === metric) this.metrics.delete(metric.name);
        };
    }

    /**
     * Reads one metric. A metric that throws is logged as a warning and reads as undefined.
     * @param name - The metric name.
     * @returns Its reading, or undefined when no metric has the name or it has nothing to report.
     */
    public read(name: string): StatsReading | undefined {
        const metric = this.metrics.get(name);
        if (metric === undefined) return undefined;
        try {
            return readAnyMetric(metric);
        } catch (error: unknown) {
            this.logger.warn(`Stats metric ${metric.name} could not be read and was left out: ${errorMessage(error)}`);
            return undefined;
        }
    }

    /**
     * Reads every metric once, as {@link read} does, leaving out each one with nothing to report.
     * A metric registered while the snapshot reads is read from the next snapshot on.
     * @returns The platform and the readings.
     */
    public snapshot(): StatsSnapshot {
        const metrics = new Map<string, StatsReading>();
        for (const name of [...this.metrics.keys()]) {
            const reading = this.read(name);
            if (reading !== undefined) metrics.set(name, reading);
        }
        return { platform: this.platform(), metrics };
    }
}
