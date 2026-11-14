import { ServerMetric } from '../serverMetrics';
import type { MetricValues } from '../StatsMetric';
import { readingValue } from '../StatsMetric';
import type { StatsSnapshot } from '../StatsRegistry';

/** The `data` object of each chart type, as bStats reads it. */
export interface BStatsChartData {
    readonly SingleLineChart: { readonly value: number };
    readonly SimplePie: { readonly value: string };
    readonly AdvancedPie: { readonly values: MetricValues['distribution'] };
    readonly DrilldownPie: { readonly values: MetricValues['breakdown'] };
}

/** A bStats custom chart type this client can send. */
export type BStatsChartType = keyof BStatsChartData;

/** One entry of a payload's `customCharts`. */
export interface BStatsChart {
    readonly chartId: string;
    readonly data: BStatsChartData[BStatsChartType];
}

/**
 * The filter a chart has on bstats.org. Every filter is an allowlist: bStats keeps a value only
 * when it is one of `values`, or when it matches `regex` in full.
 */
export type BStatsChartFilter = { readonly values: readonly string[] } | { readonly regex: string };

/** What every chart has, whatever its type. */
interface BStatsChartSpecBase {
    /** The chart's title on the bstats.org service page. */
    readonly title: string;
    /** What the chart reports, for a server operator. The docs list it beside each chart. */
    readonly description: string;
}

/** What each chart type's builder reads out of a snapshot, before the left-out rules apply. */
interface BStatsChartInputs {
    readonly SingleLineChart: number;
    readonly SimplePie: string;
    readonly AdvancedPie: MetricValues['distribution'];
    readonly DrilldownPie: MetricValues['breakdown'];
}

/** Builds a chart's input from a snapshot, or returns undefined when the chart has nothing to send. */
type ChartBuilder<T extends BStatsChartType> = (snapshot: StatsSnapshot) => BStatsChartInputs[T] | undefined;

/**
 * A chart as it is set up on the bstats.org service page, with the settings bStats stores for its
 * type, and the function that builds its data from a snapshot. A pie with no `filter` has its
 * filter off.
 */
export type BStatsChartSpec = BStatsChartSpecBase &
    (
        | {
              readonly type: 'SingleLineChart';
              readonly lineName: string;
              readonly build: ChartBuilder<'SingleLineChart'>;
          }
        | { readonly type: 'SimplePie'; readonly filter?: BStatsChartFilter; readonly build: ChartBuilder<'SimplePie'> }
        | {
              readonly type: 'AdvancedPie';
              /** The most one entry may count. */
              readonly maxValue: number;
              readonly filter?: BStatsChartFilter;
              readonly build: ChartBuilder<'AdvancedPie'>;
          }
        | {
              readonly type: 'DrilldownPie';
              /** The most one entry may count. */
              readonly maxValue: number;
              readonly filter?: BStatsChartFilter;
              readonly build: ChartBuilder<'DrilldownPie'>;
          }
    );

/**
 * The custom charts sent to bStats, by `snake_case` chart name, in the order they are sent. This
 * is the allowlist: a metric no chart reads never reaches bStats. Each chart's ID comes from
 * {@link chartId}, and the specs match the charts created on the bstats.org service page.
 */
export const BSTATS_CHARTS = {
    players: {
        type: 'SingleLineChart',
        title: 'Players Online',
        description: 'How many players are online.',
        lineName: 'Players',
        build: ({ metrics }) => readingValue(metrics, ServerMetric.players, 'gauge')
    },
    build_type: {
        type: 'DrilldownPie',
        title: 'Build Type',
        description: 'Whether the server is a `dev`, `nightly` or `release` build, then its version.',
        maxValue: 1,
        filter: { values: ['dev', 'nightly', 'release'] },
        build: ({ metrics }) => {
            const type = readingValue(metrics, ServerMetric.build_type, 'label');
            const version = readingValue(metrics, ServerMetric.version, 'label');
            return type === undefined || version === undefined ? undefined : { [type]: { [version]: 1 } };
        }
    },
    memory: {
        type: 'SimplePie',
        title: 'Memory',
        description: "The host's memory in whole gigabytes, such as `8 GB`.",
        filter: { regex: '[0-9]{1,4} GB' },
        build: ({ platform }) => `${platform.memoryGb} GB`
    },
    online_mode: {
        type: 'SimplePie',
        title: 'Online Mode',
        description: 'Whether `online-mode` is on, as `online` or `offline`.',
        filter: { values: ['online', 'offline'] },
        build: ({ metrics }) => readingValue(metrics, ServerMetric.online_mode, 'label')
    },
    transports: {
        type: 'AdvancedPie',
        title: 'Enabled Transports',
        description: 'Which transports the server accepts players over: RakNet, NetherNet or both.',
        maxValue: 1,
        filter: { values: ['RakNet', 'NetherNet'] },
        build: ({ metrics }) => {
            const transports = readingValue(metrics, ServerMetric.transports, 'set');
            return transports && Object.fromEntries(transports.map((transport) => [transport, 1]));
        }
    },
    player_platform: {
        type: 'AdvancedPie',
        title: 'Player Platform',
        description: 'How many online players play on each platform, such as Android, iOS or Windows.',
        maxValue: 1000,
        build: ({ metrics }) => readingValue(metrics, ServerMetric.player_platform, 'distribution')
    },
    player_protocol: {
        type: 'DrilldownPie',
        title: 'Player Game Version',
        description: 'How many online players use each Minecraft release, then each protocol number.',
        maxValue: 1000,
        filter: { regex: '[0-9]{1,2}\\.[0-9]{1,3}(\\.[0-9]{1,3})?' },
        build: ({ metrics }) => readingValue(metrics, ServerMetric.player_protocol, 'breakdown')
    },
    player_transport: {
        type: 'AdvancedPie',
        title: 'Player Transport',
        description: 'How many online players joined over each transport.',
        maxValue: 1000,
        filter: { values: ['RakNet', 'NetherNet'] },
        build: ({ metrics }) => readingValue(metrics, ServerMetric.player_transport, 'distribution')
    }
} as const satisfies Record<string, BStatsChartSpec>;

/**
 * The chart IDs bStats fills itself from the platform fields and the request. No custom chart
 * may take one.
 */
export const BSTATS_DEFAULT_CHART_IDS = ['servers', 'coreCount', 'osArch', 'os', 'location', 'locationMap'] as const;

const DEFAULT_CHART_IDS: ReadonlySet<string> = new Set(BSTATS_DEFAULT_CHART_IDS);

/** A `snake_case` chart name, such as `player_protocol`. */
const CHART_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/**
 * The bStats chart ID for a chart name: the `snake_case` name in camelCase, so
 * `player_protocol` becomes `playerProtocol`.
 * @param name - A `snake_case` chart name, a key of {@link BSTATS_CHARTS}.
 * @returns The chart ID.
 * @throws {Error} When the name is not `snake_case`, or maps onto one of
 * {@link BSTATS_DEFAULT_CHART_IDS}.
 */
export const chartId = (name: string): string => {
    if (!CHART_NAME.test(name)) throw new Error(`bStats chart name "${name}" is not snake_case and has no chart ID`);
    const id = name.replace(/_([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());
    if (DEFAULT_CHART_IDS.has(id)) throw new Error(`bStats chart name "${name}" maps onto the default chart "${id}"`);
    return id;
};

/** Drops the entries a pie must not send, and returns undefined when none are left. */
const nonEmpty = <V>(
    entries: Readonly<Record<string, V>>,
    keep: (value: V) => boolean
): Record<string, V> | undefined => {
    const kept = Object.fromEntries(Object.entries(entries).filter(([, value]) => keep(value)));
    return Object.keys(kept).length === 0 ? undefined : kept;
};

/** Builds a chart's `data`, or returns undefined when the chart is left out. */
const chartData = (spec: BStatsChartSpec, snapshot: StatsSnapshot): BStatsChart['data'] | undefined => {
    switch (spec.type) {
        case 'SingleLineChart': {
            const value = spec.build(snapshot);
            return value === undefined || value === 0 ? undefined : { value };
        }
        case 'SimplePie': {
            const value = spec.build(snapshot);
            return value === undefined || value === '' ? undefined : { value };
        }
        case 'AdvancedPie': {
            const counts = spec.build(snapshot);
            const values = counts && nonEmpty(counts, (count) => count !== 0);
            return values && { values };
        }
        case 'DrilldownPie': {
            const counts = spec.build(snapshot);
            const values = counts && nonEmpty(counts, (inner) => Object.keys(inner).length > 0);
            return values && { values };
        }
    }
};

/**
 * Builds one chart from a snapshot, with the rules bStats' own clients apply: a `SimplePie` with
 * an empty value and a `SingleLineChart` at 0 are left out, an `AdvancedPie` drops its zero
 * entries and a `DrilldownPie` its empty inner maps, and either is left out when nothing is left.
 * @param name - The chart's `snake_case` name, which {@link chartId} turns into its ID.
 * @param spec - The chart.
 * @param snapshot - The registry's snapshot.
 * @returns The chart, or undefined when it is left out.
 * @throws {Error} When the name has no chart ID, as {@link chartId} says.
 */
export const encodeChart = (name: string, spec: BStatsChartSpec, snapshot: StatsSnapshot): BStatsChart | undefined => {
    const id = chartId(name);
    const data = chartData(spec, snapshot);
    return data === undefined ? undefined : { chartId: id, data };
};

/**
 * Builds every chart in {@link BSTATS_CHARTS} that has something to send, in table order.
 * Metrics no chart reads are ignored.
 * @param snapshot - The registry's snapshot.
 * @returns The payload's `customCharts`.
 */
export const encodeCharts = (snapshot: StatsSnapshot): BStatsChart[] =>
    Object.entries(BSTATS_CHARTS).flatMap(([name, spec]) => {
        const encoded = encodeChart(name, spec, snapshot);
        return encoded === undefined ? [] : [encoded];
    });
