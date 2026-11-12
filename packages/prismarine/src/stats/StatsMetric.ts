/**
 * The value each metric kind reads. The kinds describe the data, not how a provider draws it.
 */
export interface MetricValues {
    /** One number, such as the players online. */
    readonly gauge: number;
    /** One string, such as the software version. */
    readonly label: string;
    /** A set of names with no count attached, such as the enabled transports. */
    readonly set: readonly string[];
    /** A count per key, such as players per device OS. */
    readonly distribution: Readonly<Record<string, number>>;
    /** A count per inner key under each outer key, such as players per release, then protocol. */
    readonly breakdown: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

/** The kind of a metric: `gauge`, `label`, `set`, `distribution` or `breakdown`. */
export type MetricKind = keyof MetricValues;

/** What a metric says about itself, for a provider that shows it to people. */
export interface MetricInfo {
    /** What the metric reports, in a sentence, such as `Players online.`. */
    readonly description: string;
    /** What one count or gauge value is a number of, such as `players`. Left out for a value with no unit. */
    readonly unit?: string;
}

/**
 * One metric: a name, a kind, a description and a function that reads the current value.
 *
 * The registry calls `read` only when a provider asks for the value. A metric with nothing to
 * report at that moment returns `undefined`, and the reading leaves it out.
 * @typeParam K - The metric's kind.
 */
export interface KindedMetric<K extends MetricKind> extends MetricInfo {
    /** A namespaced `snake_case` name, such as `jsprismarine:player_protocol`. */
    readonly name: string;
    readonly kind: K;
    /** Reads the current value, or `undefined` when the metric has nothing to report. */
    read(): MetricValues[K] | undefined;
}

/** A metric of any kind, narrowed by its `kind` field. */
export type StatsMetric = { [K in MetricKind]: KindedMetric<K> }[MetricKind];

/** One metric's value at one moment, with its description, narrowed by its `kind` field. */
export type StatsReading = {
    [K in MetricKind]: MetricInfo & { readonly kind: K; readonly value: MetricValues[K] };
}[MetricKind];

/** A namespace and a name, both `snake_case`, joined by one colon. */
const METRIC_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*:[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/**
 * Whether a metric name is a `snake_case` namespace and a `snake_case` name joined by a colon,
 * such as `jsprismarine:player_protocol` or `myaddon:something`.
 * @param name - The name to check.
 * @returns True for a well-formed name.
 */
export const isMetricName = (name: string): boolean => METRIC_NAME.test(name);

/** Reads a reading's value as each kind, or undefined for a reading of another kind. */
const VALUE_AS: { readonly [K in MetricKind]: (reading: StatsReading) => MetricValues[K] | undefined } = {
    gauge: (reading) => (reading.kind === 'gauge' ? reading.value : undefined),
    label: (reading) => (reading.kind === 'label' ? reading.value : undefined),
    set: (reading) => (reading.kind === 'set' ? reading.value : undefined),
    distribution: (reading) => (reading.kind === 'distribution' ? reading.value : undefined),
    breakdown: (reading) => (reading.kind === 'breakdown' ? reading.value : undefined)
};

/**
 * The value of one metric in a set of readings, when it is there and of the expected kind.
 * @param metrics - Readings by metric name, such as a snapshot's.
 * @param name - The metric name.
 * @param kind - The kind the caller reads it as.
 * @returns The value, or undefined when the metric is missing or of another kind.
 */
export const readingValue = <K extends MetricKind>(
    metrics: ReadonlyMap<string, StatsReading>,
    name: string,
    kind: K
): MetricValues[K] | undefined => {
    const reading = metrics.get(name);
    return reading === undefined ? undefined : VALUE_AS[kind](reading);
};
