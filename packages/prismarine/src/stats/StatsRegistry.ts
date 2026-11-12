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

/** Reads one metric, keeping its kind and value together so the reading stays narrowed. */
const readMetric = <K extends MetricKind>(
    metric: KindedMetric<K>
): (MetricInfo & { readonly kind: K; readonly value: MetricValues[K] }) | undefined => {
    const value = metric.read();
    if (value === undefined) return undefined;
    const { kind, description, unit } = metric;
    return { kind, value, description, ...(unit === undefined ? {} : { unit }) };
};

/** Narrows the metric by kind so each reading carries the value type its kind declares. */
const readAnyMetric = (metric: StatsMetric): StatsReading | undefined => {
    switch (metric.kind) {
        case 'gauge':
            return readMetric(metric);
        case 'label':
            return readMetric(metric);
        case 'set':
            return readMetric(metric);
        case 'distribution':
            return readMetric(metric);
        case 'breakdown':
            return readMetric(metric);
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
     * @returns A function that removes this metric again. Calling it twice, or after another
     * metric took the name, does nothing.
     * @throws {Error} When the name is badly formed or another metric already has it.
     */
    public register(metric: StatsMetric): () => void {
        if (!isMetricName(metric.name)) {
            throw new Error(
                `Stats metric name "${metric.name}" must be a snake_case namespace and name, such as "jsprismarine:players"`
            );
        }
        if (this.metrics.has(metric.name)) throw new Error(`Stats metric "${metric.name}" is already registered`);
        this.metrics.set(metric.name, metric);
        return () => {
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
     * @returns The platform and the readings.
     */
    public snapshot(): StatsSnapshot {
        const metrics = new Map<string, StatsReading>();
        for (const name of this.metrics.keys()) {
            const reading = this.read(name);
            if (reading !== undefined) metrics.set(name, reading);
        }
        return { platform: this.platform(), metrics };
    }
}
