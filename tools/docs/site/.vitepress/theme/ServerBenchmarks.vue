<script setup lang="ts">
import { computed, ref } from 'vue';

import type { HistoryChart, HistorySeries } from '../../../../server-benchmark/src/history.mts';
import type {
    RunResult,
    ScenarioDescription,
    ScenarioId,
    ServerId,
    Transport
} from '../../../../server-benchmark/src/results.mts';
import type { CellSummary, MetricId, MetricKind, MetricSummary } from '../../../../server-benchmark/src/summary.mts';
import { SERVER_IDS } from '../../../../server-benchmark/src/results.mts';
import { METRICS, baselinesOf } from '../../../../server-benchmark/src/summary.mts';
import type { BenchmarkPageData } from '../../benchmarks.data.mts';
import BenchmarkHistoryChart from './BenchmarkHistoryChart.vue';
import type { ChartLine, ChartRule } from './BenchmarkHistoryChart.vue';

/**
 * The server benchmark page. Every figure comes from the results files through
 * `benchmarks.data.mts`; this component only words and draws them. Each metric of the newest run
 * is a strip of every round's value on a shared axis from zero, with the median marked, so the
 * spread is in view. The history below it draws one point per change since the first run.
 */
const props = defineProps<{ data: BenchmarkPageData | null }>();

const results = computed(() => props.data?.results ?? null);
const summary = computed(() => props.data?.summary ?? null);

const repository = 'https://github.com/JSPrismarine/JSPrismarine';
/** One locale on the server and in every browser, so the hydrated numbers match the rendered ones. */
const number = (digits: number) =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

interface MetricCopy {
    readonly label: string;
    /** One or two sentences an operator can follow. */
    readonly explain: string;
    readonly format: (value: number) => string;
}

const bytes = (value: number) =>
    value >= 1024 ? `${number(1).format(value / 1024)} KiB` : `${number(0).format(value)} B`;

const METRIC_COPY: Record<MetricId, MetricCopy> = {
    columnsPerCpuSecond: {
        label: 'Chunks per CPU second',
        explain:
            'Chunk columns the bots received while traveling, divided by the CPU time the server used meanwhile. It is what one second of a core buys in terrain delivered.',
        format: (value) => number(0).format(value)
    },
    columns: {
        label: 'Chunks delivered',
        explain:
            'Distinct chunk columns the bots received while traveling. The other travel figures compare like with like only where these are close.',
        format: (value) => number(0).format(value)
    },
    bytesPerColumn: {
        label: 'Bytes per chunk',
        explain:
            "What the bots received while traveling, divided by the chunk columns. It counts every packet in that time, after each server's own compression.",
        format: bytes
    },
    idleCpuPercent: {
        label: 'CPU while idle',
        explain:
            'CPU time during the idle phase as a share of one core, while every bot stands still and sends its input each tick.',
        format: (value) => `${number(1).format(value)}%`
    },
    peakRssMiB: {
        label: 'Peak memory',
        explain: 'The largest resident memory of the server and every process it started, sampled throughout the run.',
        format: (value) => `${number(0).format(value)} MiB`
    },
    idleRssMiB: {
        label: 'Memory while idle',
        explain: "Resident memory of the server's processes at the end of the idle phase.",
        format: (value) => `${number(0).format(value)} MiB`
    },
    startupCpuSeconds: {
        label: 'CPU to start',
        explain: 'CPU time from starting the process until it printed that it was listening.',
        format: (value) => `${number(2).format(value)} s`
    },
    startupSeconds: {
        label: 'Time to first join',
        explain: 'From starting the process to the first bot standing in the world.',
        format: (value) => `${number(1).format(value)} s`
    },
    travelSeconds: {
        label: 'Time to deliver the travel phase',
        explain: 'How long the travel phase took, including the quiet wait the harness adds after every step.',
        format: (value) => `${number(1).format(value)} s`
    }
};

const KIND_LABEL: Record<MetricKind, string> = {
    count: 'Counted',
    cpu: 'CPU time',
    wall: 'Wall clock, indicative'
};

const BETTER_LABEL = {
    higher: 'Higher is better',
    lower: 'Lower is better',
    neither: 'Should match'
} as const;

/** Metrics in reading order: what delivering terrain costs first, then idle, memory and startup. */
const METRIC_ORDER: readonly MetricId[] = [
    'columnsPerCpuSecond',
    'columns',
    'bytesPerColumn',
    'idleCpuPercent',
    'peakRssMiB',
    'idleRssMiB',
    'startupCpuSeconds',
    'startupSeconds',
    'travelSeconds'
];

const SCENARIO_TITLE: Record<ScenarioDescription['id'], string> = {
    flat: 'Flat world',
    terrain: 'Default terrain'
};

const better = (id: MetricId) => METRICS.find((metric) => metric.id === id)?.better ?? 'lower';
const kind = (id: MetricId) => METRICS.find((metric) => metric.id === id)?.kind ?? 'count';

const serverName = (id: ServerId) => results.value?.servers[id]?.name ?? id;
const servers = computed(() => SERVER_IDS.filter((id) => results.value?.servers[id] !== undefined));

/** The JSPrismarine run a server is compared with, or none for JSPrismarine itself. */
const baselineOf = (server: ServerId): ServerId | null => {
    const all = results.value?.servers ?? {};
    return baselinesOf(all, server).find((baseline) => all[baseline] !== undefined) ?? null;
};
const TRANSPORT_NAME = { nethernet: 'NetherNet', raknet: 'RakNet' } as const;

const cell = (scenario: ScenarioDescription['id'], server: ServerId): CellSummary | undefined =>
    summary.value?.cells.find((entry) => entry.scenario === scenario && entry.server === server);

/** The largest value any server reached on a metric in a scenario, which the strips share as their scale. */
const scaleMax = (scenario: ScenarioDescription['id'], id: MetricId) =>
    Math.max(0, ...servers.value.flatMap((server) => cell(scenario, server)?.metrics[id].values ?? []));

/** Where a value sits on a strip, inset by half a mark at each end so a mark at either end stays inside. */
const position = (value: number, max: number) => `calc(6px + (100% - 12px) * ${max === 0 ? 0 : value / max})`;

/** Another server's median over its baseline's, and which of the two the metric favors. */
const comparison = (scenario: ScenarioDescription['id'], id: MetricId, server: ServerId, baseline: ServerId) => {
    const ours = cell(scenario, baseline)?.metrics[id].median;
    const theirs = cell(scenario, server)?.metrics[id].median;
    if (ours == null || theirs == null || ours === 0) return null;
    const ratio = theirs / ours;
    const close = Math.abs(ratio - 1) < 0.05;
    const direction = better(id);
    const jspAhead = direction === 'higher' ? ours > theirs : ours < theirs;
    const verdict = close
        ? 'about the same'
        : direction === 'neither'
          ? null
          : jspAhead
            ? 'JSPrismarine ahead'
            : 'JSPrismarine behind';
    return { ratio, verdict, baseline: ours };
};

/** A server's figures for a metric, or null when no finished run gave one. */
const measured = (scenario: ScenarioDescription['id'], server: ServerId, id: MetricId): MetricSummary | null => {
    const values = cell(scenario, server)?.metrics[id];
    return values?.median == null ? null : values;
};

/** How a server's median compares with JSPrismarine's over the same transport, and which the metric favors. */
const comparisonText = (scenario: ScenarioDescription['id'], id: MetricId, server: ServerId): string | null => {
    const baseline = baselineOf(server);
    if (baseline === null) return null;
    const compared = comparison(scenario, id, server, baseline);
    if (compared === null) return null;
    const against = serverName(baseline);
    if (compared.verdict === 'about the same') return `Within 5% of ${against}`;
    // A server that measured zero has no factor to state.
    if (compared.ratio === 0) return `0, against ${against}'s ${METRIC_COPY[id].format(compared.baseline)}`;
    const factor = Math.max(compared.ratio, 1 / compared.ratio);
    const times = factor < 10 ? number(1).format(factor) : number(0).format(factor);
    const relation = `${times}× ${compared.ratio > 1 ? 'more' : 'less'} than ${against}`;
    return compared.verdict === null ? relation : `${relation}; ${compared.verdict}`;
};

const laneLabel = (server: ServerId, metric: MetricId, values: MetricSummary) => {
    const copy = METRIC_COPY[metric];
    if (values.median === null) return `${serverName(server)}: not measured`;
    return `${serverName(server)}: median ${copy.format(values.median)}, rounds from ${copy.format(values.min ?? 0)} to ${copy.format(values.max ?? 0)}`;
};

const rounds = (count: number) => `${count} round${count === 1 ? '' : 's'}`;
const date = computed(() => results.value?.startedAt.slice(0, 10) ?? '');
/**
 * Whether this file measured JSPrismarine's packaged executable, which the harness runs with
 * `--jsp-executable`, rather than its build on Node.js. The command line it recorded says which.
 */
const jspExecutable = computed(() => {
    const servers = results.value?.servers;
    const command = servers?.['jsprismarine-nethernet']?.command ?? servers?.['jsprismarine-raknet']?.command ?? '';
    return command !== '' && !/(^|\s)node\s/.test(command);
});
const fileUrl = computed(() => (props.data ? `${repository}/blob/master/${props.data.file}` : repository));
const memory = computed(() =>
    results.value ? `${number(0).format(results.value.environment.memoryBytes / 1024 ** 3)} GiB` : ''
);
const load = (values: readonly number[]) => values.map((value) => number(2).format(value)).join(' / ');

const runsByRound = computed(() =>
    [...(results.value?.runs ?? [])].sort(
        (left, right) =>
            left.round - right.round || left.scenario.localeCompare(right.scenario) || left.position - right.position
    )
);
const seconds = (ms: number | null | undefined) => (ms == null ? '–' : number(1).format(ms / 1000));
/** A run's outcome for the runs table, naming travel steps that ran out of time. */
const runResult = (run: RunResult) => {
    if (!run.ok) return run.error;
    const timedOut = run.phases?.travel.stepsTimedOut ?? 0;
    return timedOut === 0
        ? 'Finished'
        : `Finished; ${timedOut} travel step${timedOut === 1 ? '' : 's'} ran out of time, so its travel figures are left out`;
};

/** Which scenarios a setting applied to, when it was not all of them. */
const scenariosNote = (scenarios: readonly ScenarioDescription['id'][] | undefined) => {
    if (scenarios === undefined || scenarios.length === results.value?.scenarios.length) return null;
    return scenarios.map((scenario) => SCENARIO_TITLE[scenario]).join(' and ');
};

const runCpu = (run: RunResult) => seconds(run.phases?.travel.cpuMs);

const history = computed(() => props.data?.history ?? null);
/** The runs the history draws: the quiet ones. */
const drawn = computed(() => history.value?.runs.filter((run) => run.quiet) ?? []);
const historyScenario = ref<ScenarioId>('flat');
const historyScenarios = computed(() =>
    (results.value?.scenarios ?? [])
        .map((scenario) => scenario.id)
        .filter((id) => history.value?.charts.some((chart) => chart.scenario === id))
);
const historyCharts = computed(() =>
    METRIC_ORDER.flatMap((metric) => {
        const chart = history.value?.charts.find(
            (entry) => entry.scenario === historyScenario.value && entry.metric === metric
        );
        return chart === undefined ? [] : [chart];
    })
);

const runTime = (run: number) => Date.parse(history.value?.runs[run]?.startedAt ?? '');
const runDate = (run: number) => history.value?.runs[run]?.startedAt.slice(0, 10) ?? '';
const shortSha = (sha: string) => sha.slice(0, 7);
const historyDomain = computed((): [number, number] => {
    const times = drawn.value.map((run) => Date.parse(run.startedAt));
    return [Math.min(...times), Math.max(...times)];
});
const cpuRules = computed((): ChartRule[] =>
    drawn.value
        .filter((run) => run.cpuChanged)
        .map((run) => ({
            time: Date.parse(run.startedAt),
            label: 'CPU',
            tip: `Runner CPU changed to\n${run.cpuModel}`
        }))
);

const ratio = (value: number) => `${number(2).format(value)}×`;
const historyFormat = (chart: HistoryChart) => (chart.view === 'ratio' ? ratio : METRIC_COPY[chart.metric].format);

/** A series as chart segments, broken where the reference server changed version. */
const chartLine = (chart: HistoryChart, series: HistorySeries): ChartLine => {
    const segments: { time: number; value: number; tip: string }[][] = [];
    for (const point of series.points) {
        const run = history.value!.runs[point.run]!;
        const tip = [
            runDate(point.run),
            run.commit === null ? null : `commit ${shortSha(run.commit)}`,
            series.reference === null ? null : `${serverName(series.reference)} ${run.versions[series.reference]}`,
            historyFormat(chart)(point.value)
        ]
            .filter((line) => line !== null)
            .join('\n');
        if (segments.length === 0 || point.referenceChanged) segments.push([]);
        segments.at(-1)!.push({ time: runTime(point.run), value: point.value, tip });
    }
    return {
        key: `${series.server}:${series.reference}`,
        server: series.server,
        label: serverName(series.server),
        dashed: series.server === 'jsprismarine-raknet',
        segments
    };
};

interface HistoryPanel {
    readonly key: string;
    readonly lines: readonly ChartLine[];
    readonly reference: { readonly server: string; readonly label: string } | null;
    readonly label: string;
}

const panelLabel = (chart: HistoryChart, title: string, series: readonly HistorySeries[]) => {
    const format = historyFormat(chart);
    const lines = series.map((line) => {
        const first = line.points[0]!;
        const last = line.points.at(-1)!;
        return `${serverName(line.server)} from ${format(first.value)} on ${runDate(first.run)} to ${format(last.value)} on ${runDate(last.run)}`;
    });
    return `${METRIC_COPY[chart.metric].label}, ${title}: ${lines.join('; ')}`;
};

/**
 * A ratio chart has a panel per pinned server; a counted one a panel per transport, holding
 * JSPrismarine and the server it is compared with. Pumpkin and Bedrock Dedicated Server never share
 * a panel, as they are never compared with each other.
 */
const panels = (chart: HistoryChart): HistoryPanel[] => {
    if (chart.view === 'ratio') {
        return chart.series.map((series) => {
            const reference = series.reference!;
            return {
                key: `${series.server}:${reference}`,
                lines: [chartLine(chart, series)],
                reference: { server: reference, label: `${serverName(reference)} = 1×` },
                label: panelLabel(chart, `${serverName(series.server)} over ${serverName(reference)}`, [series])
            };
        });
    }
    const transportOf = (server: ServerId): Transport => results.value?.servers[server]?.transport ?? 'raknet';
    return (['nethernet', 'raknet'] as const).flatMap((transport) => {
        const series = chart.series.filter((line) => transportOf(line.server) === transport);
        return series.length === 0
            ? []
            : [
                  {
                      key: transport,
                      lines: series.map((line) => chartLine(chart, line)),
                      reference: null,
                      label: panelLabel(chart, `over ${TRANSPORT_NAME[transport]}`, series)
                  }
              ];
    });
};

/** What a ratio chart's line means, in the metric's own terms. */
const ratioCaption = (metric: MetricId) =>
    `JSPrismarine's median divided by the pinned server's in the same run. ${better(metric) === 'higher' ? 'Above' : 'Below'} 1×, JSPrismarine does better.`;
</script>

<template>
    <div v-if="results && summary" class="bench">
        <header class="bench-hero">
            <p class="bench-eyebrow">
                <i></i>Benchmark, run <time :datetime="results.startedAt">{{ date }}</time>
                <template v-if="results.environment.ci">
                    on <a :href="results.environment.ci.runUrl">GitHub Actions</a></template
                >
            </p>
            <h1>Three servers, one workload.</h1>
            <p class="bench-lede">
                JSPrismarine, Pumpkin and Bedrock Dedicated Server, measured one after another on the same machine with
                the same Bedrock bots, world settings and steps. Pumpkin accepts NetherNet only and Bedrock Dedicated
                Server runs over RakNet here, so JSPrismarine runs over both, and each server is compared with
                JSPrismarine over its own transport. Each figure is the median of {{ rounds(summary.rounds) }}, drawn
                with every round beside it.
            </p>
            <div class="bench-state" :class="summary.quiet ? 'is-quiet' : 'is-indicative'">
                <strong>{{ summary.quiet ? 'Quiet' : 'Indicative' }}</strong>
                <span v-if="summary.quiet">
                    The one minute load stayed at or under {{ number(2).format(results.quietLoadLimit) }} at both ends
                    of all {{ rounds(summary.rounds) }}, a quarter of the machine's
                    {{ results.environment.logicalCpus }}
                    logical CPUs. CPU times are still single-machine figures; read them as ratios, not as absolutes.
                </span>
                <span v-else>
                    {{ summary.quietRounds }} of {{ summary.rounds }} rounds stayed at or under a one minute load of
                    {{ number(2).format(results.quietLoadLimit) }} at both ends. Other work on the machine may account
                    for some of the differences below, so none of them is a verdict.
                </span>
            </div>
            <dl class="bench-facts">
                <div>
                    <dt>Machine</dt>
                    <dd>
                        {{ results.environment.cpuModel }}, {{ results.environment.logicalCpus }} logical CPUs,
                        {{ memory }}
                    </dd>
                </div>
                <div>
                    <dt>System</dt>
                    <dd>
                        {{ results.environment.os }}, {{ results.environment.arch }}, Node.js
                        {{ results.environment.node }}
                    </dd>
                </div>
                <div>
                    <dt>Protocol</dt>
                    <dd>Bedrock {{ results.protocol.minecraftVersion }} ({{ results.protocol.version }})</dd>
                </div>
            </dl>
            <ul class="bench-legend" aria-label="Servers">
                <li v-for="server in servers" :key="server" :class="`is-${server}`">
                    <i aria-hidden="true"></i>
                    <span>{{ serverName(server) }}</span>
                    <code
                        >{{ results.servers[server]?.version }},
                        {{ TRANSPORT_NAME[results.servers[server]!.transport] }}</code
                    >
                </li>
            </ul>
        </header>

        <section v-for="scenario in results.scenarios" :key="scenario.id" class="bench-scenario">
            <h2 class="bench-title">{{ SCENARIO_TITLE[scenario.id] }}</h2>
            <p class="bench-intro">
                {{ scenario.bots }} bots, view distance {{ scenario.viewDistance }}, simulation distance
                {{ scenario.simulationDistance }}. Each bot is teleported {{ scenario.steps }} times,
                {{ scenario.stepBlocks }} blocks a step, then stands still for {{ scenario.idleMs / 1000 }} seconds.
                <template v-if="scenario.id === 'terrain'">
                    Every server generates its own default terrain: Bedrock Dedicated Server makes Bedrock Edition
                    terrain, and JSPrismarine and Pumpkin make Java Edition terrain, so these figures compare different
                    generators doing different work.
                </template>
            </p>
            <div class="bench-grid">
                <article v-for="metric in METRIC_ORDER" :key="metric" class="bench-metric">
                    <header>
                        <h3>{{ METRIC_COPY[metric].label }}</h3>
                        <p class="bench-tags">
                            <span :class="`kind-${kind(metric)}`">{{ KIND_LABEL[kind(metric)] }}</span>
                            <span>{{ BETTER_LABEL[better(metric)] }}</span>
                        </p>
                    </header>
                    <ul class="bench-lanes">
                        <li v-for="server in servers" :key="server" :class="`is-${server}`">
                            <span class="lane-name">{{ serverName(server) }}</span>
                            <template v-if="measured(scenario.id, server, metric)">
                                <span class="lane-value">{{
                                    METRIC_COPY[metric].format(measured(scenario.id, server, metric)!.median!)
                                }}</span>
                                <span
                                    class="lane-track"
                                    role="img"
                                    :aria-label="laneLabel(server, metric, measured(scenario.id, server, metric)!)"
                                >
                                    <i
                                        v-for="(value, index) in measured(scenario.id, server, metric)!.values"
                                        :key="index"
                                        class="lane-round"
                                        :style="{ left: position(value, scaleMax(scenario.id, metric)) }"
                                    ></i>
                                    <b
                                        class="lane-median"
                                        :style="{
                                            left: position(
                                                measured(scenario.id, server, metric)!.median!,
                                                scaleMax(scenario.id, metric)
                                            )
                                        }"
                                    ></b>
                                </span>
                                <small v-if="comparisonText(scenario.id, metric, server)" class="lane-compare">{{
                                    comparisonText(scenario.id, metric, server)
                                }}</small>
                            </template>
                            <span v-else class="lane-empty">
                                Not measured<template v-if="cell(scenario.id, server)?.failures.length"
                                    >: {{ cell(scenario.id, server)!.failures[0] }}</template
                                >
                            </span>
                        </li>
                    </ul>
                    <p class="bench-explain">{{ METRIC_COPY[metric].explain }}</p>
                </article>
            </div>
        </section>

        <section v-if="history" class="bench-history">
            <h2 class="bench-title">History</h2>
            <p class="bench-intro">
                One point for each change to the servers or the harness, from runs whose rounds were all quiet. A run of
                unchanged code adds no point. Runs that were not quiet are listed below and left off the charts, since
                other work on the runner can move their figures with no server changing.
            </p>
            <p class="bench-intro">
                GitHub gives each run whatever runner is free, and its CPU differs from day to day, so a CPU time from
                one run does not compare with another's. The history divides JSPrismarine's CPU figures by those of the
                pinned server it ran beside on the same machine: Pumpkin over NetherNet and Bedrock Dedicated Server
                over RakNet. The machine's speed cancels, and the line moves when JSPrismarine changes. A break in the
                line is a new pinned version, and a yellow rule is a change of CPU. Memory and bytes are counted, the
                same on any machine, so they are drawn as measured.
            </p>
            <template v-if="drawn.length >= 2">
                <div class="hist-switch" role="group" aria-label="Scenario">
                    <button
                        v-for="scenario in historyScenarios"
                        :key="scenario"
                        type="button"
                        :aria-pressed="historyScenario === scenario"
                        @click="historyScenario = scenario"
                    >
                        {{ SCENARIO_TITLE[scenario] }}
                    </button>
                </div>
                <div class="bench-grid">
                    <article v-for="chart in historyCharts" :key="chart.metric" class="bench-metric">
                        <header>
                            <h3>{{ METRIC_COPY[chart.metric].label }}</h3>
                            <p class="bench-tags">
                                <span>{{ chart.view === 'ratio' ? 'Against a pinned server' : 'Counted' }}</span>
                                <span>{{ BETTER_LABEL[better(chart.metric)] }}</span>
                            </p>
                        </header>
                        <BenchmarkHistoryChart
                            v-for="panel in panels(chart)"
                            :key="panel.key"
                            :lines="panel.lines"
                            :scale="chart.view === 'ratio' ? 'log' : 'linear'"
                            :domain="historyDomain"
                            :rules="cpuRules"
                            :reference="panel.reference"
                            :format="historyFormat(chart)"
                            :label="panel.label"
                        />
                        <p class="hist-dates">
                            <time :datetime="drawn[0]!.startedAt">{{ drawn[0]!.startedAt.slice(0, 10) }}</time>
                            <time :datetime="drawn.at(-1)!.startedAt">{{ drawn.at(-1)!.startedAt.slice(0, 10) }}</time>
                        </p>
                        <p class="bench-explain">
                            {{
                                chart.view === 'ratio' ? ratioCaption(chart.metric) : METRIC_COPY[chart.metric].explain
                            }}
                        </p>
                    </article>
                </div>
            </template>
            <p v-else class="hist-start">
                <strong>The history starts with this run.</strong>
                {{
                    drawn.length === 1
                        ? 'The charts appear here once a change is measured on a quiet runner.'
                        : 'No run has been quiet yet. The charts appear once two quiet runs have measured different code.'
                }}
            </p>
            <details class="bench-runs" :open="drawn.length < 2">
                <summary>Every change measured</summary>
                <div class="bench-table-scroll">
                    <table>
                        <thead>
                            <tr>
                                <th scope="col">Date</th>
                                <th scope="col">Commit</th>
                                <th scope="col">Runner CPU</th>
                                <th scope="col">Pumpkin</th>
                                <th scope="col">Bedrock Dedicated Server</th>
                                <th scope="col">Quiet rounds</th>
                                <th scope="col">On the charts</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="run in [...history.runs].reverse()" :key="run.file">
                                <td>
                                    <a v-if="run.runUrl" :href="run.runUrl">{{ run.startedAt.slice(0, 10) }}</a>
                                    <template v-else>{{ run.startedAt.slice(0, 10) }}</template>
                                </td>
                                <td>
                                    <a v-if="run.commit" :href="`${repository}/commit/${run.commit}`"
                                        ><code>{{ shortSha(run.commit) }}</code></a
                                    ><template v-else>–</template>
                                    <small v-if="run.dirty" class="bench-scope">with uncommitted changes</small>
                                </td>
                                <td>
                                    {{ run.cpuModel }}
                                    <small v-if="run.cpuChanged" class="bench-scope">Changed</small>
                                </td>
                                <td>{{ run.versions.pumpkin ?? '–' }}</td>
                                <td>{{ run.versions.bds ?? '–' }}</td>
                                <td>{{ run.quietRounds }} of {{ run.rounds }}</td>
                                <td>
                                    {{ run.quiet ? 'Yes' : 'No, not quiet' }}
                                    <small v-if="run.repeats > 0" class="bench-scope"
                                        >Measured again {{ run.repeats }} time{{ run.repeats === 1 ? '' : 's' }} with no
                                        change</small
                                    >
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </details>
        </section>

        <section class="bench-prose">
            <h2 class="bench-title">How it was measured</h2>
            <p>
                Each round runs every server once per scenario, one at a time. The order rotates from round to round, so
                no server always runs first or last, and load on the machine falls on all three alike. Before each run
                the harness waits up to {{ results.harness.cooldownMaxMs / 1000 }} seconds for the one minute load to
                fall to {{ number(2).format(results.quietLoadLimit) }}, and it records the load before and after every
                run.
            </p>
            <p>
                A run starts the server from an empty data directory and waits for the line that says it listens. The
                bots then join one at a time, each asking for view distance
                {{ results.scenarios[0]?.viewDistance }}. Once their first views arrive the server's console teleports
                them all to the origin, and from there along a heading of their own, one step at a time. After every
                step the harness waits until no terrain has arrived for
                {{ results.harness.settleQuietMs / 1000 }} seconds. The bots then stand still for the idle phase, and
                the console stops the server. Memory is sampled every {{ results.harness.memorySampleMs }} ms
                throughout.
            </p>
            <p>
                The bots are JSPrismarine's own client, the same for all three servers. They speak Bedrock
                {{ results.protocol.minecraftVersion }} over the transport each server's lane names, send one input
                every tick as a retail client does, and ask for sub chunks when a server streams terrain on request.
                They never turn on the client blob cache, so every server sends full terrain. The harness reads the CPU
                time of the server's whole process tree, including JSPrismarine's world generation process, and counts
                the chunks and bytes the bots receive.
            </p>
            <p>
                The chunk figures come from the travel phase alone. The join phase also loads each server's own spawn
                area, which is in a different place on each server, so its chunk counts differ by design. Counts and
                memory are the same on any machine. CPU time moves a little from run to run and more from machine to
                machine. Wall clock times are marked indicative: they move with everything else running on the machine.
            </p>

            <h3>What this comparison leaves out</h3>
            <ul>
                <li>
                    Pumpkin is first a Java Edition server, and
                    <a href="https://github.com/Pumpkin-MC/Pumpkin#features">its README</a> lists Bedrock support as a
                    work in progress. This measures it serving Bedrock clients only, which is the one thing all three
                    servers do.
                </li>
                <li>
                    No one transport reaches all three servers. The Pumpkin release measured accepts Bedrock clients
                    over NetherNet alone. Bedrock Dedicated Server takes NetherNet by default, but the bots' NetherNet
                    connections to it fail within seconds (<a
                        href="https://github.com/JSPrismarine/JSPrismarine/issues/3437"
                        >#3437</a
                    >), so it runs over RakNet. JSPrismarine listens on both, so it runs twice, and Pumpkin and Bedrock
                    Dedicated Server are each compared with the JSPrismarine run over their own transport, never with
                    each other.
                </li>
                <li>
                    Tick times are missing. JSPrismarine reports each tick's duration and the other two do not, so the
                    page shows no tick figure for any server rather than one for JSPrismarine alone.
                </li>
                <li>
                    The bots are not game clients. They render nothing, do not walk but are teleported, and do not break
                    or place blocks. A world with mobs, redstone and players building costs every server more than this
                    one.
                </li>
                <li v-if="jspExecutable">
                    JSPrismarine runs as the Bun AOT executable the nightly ships, compiled from the measured commit, so
                    it is what a user runs. Pumpkin runs as its published release build, and Bedrock Dedicated Server as
                    Mojang ships it.
                </li>
                <li v-else>
                    JSPrismarine runs from this repository's build on Node.js, as <code>pnpm start</code> runs it, not
                    as the prebuilt executable. Pumpkin runs as its published release build, and Bedrock Dedicated
                    Server as Mojang ships it.
                </li>
                <li>
                    The machine is a shared cloud runner. Another day's runner may be a different CPU, so compare CPU
                    and wall clock figures within one results file, not across files. The history draws CPU figures only
                    as ratios to a server that ran on the same machine, and leaves wall clock out.
                </li>
            </ul>
        </section>

        <section class="bench-prose">
            <h2 class="bench-title">Settings each server ran with</h2>
            <p>
                Every server ran with its shipped defaults apart from the settings below, each with the reason it was
                changed.
            </p>
            <div v-for="server in servers" :key="server" class="bench-server">
                <h3>{{ serverName(server) }} {{ results.servers[server]?.version }}</h3>
                <p class="bench-source">{{ results.servers[server]?.source }}</p>
                <pre class="bench-command"><code>{{ results.servers[server]?.command }}</code></pre>
                <div class="bench-table-scroll">
                    <table class="bench-settings">
                        <thead>
                            <tr>
                                <th scope="col">Setting</th>
                                <th scope="col">Value</th>
                                <th scope="col">Default</th>
                                <th scope="col">Why</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="setting in results.servers[server]?.settings ?? []"
                                :key="`${setting.key}=${setting.value}`"
                            >
                                <td data-label="Setting">
                                    <code>{{ setting.key }}</code>
                                </td>
                                <td data-label="Value">
                                    <code>{{ setting.value }}</code>
                                    <small v-if="scenariosNote(setting.scenarios)" class="bench-scope">{{
                                        scenariosNote(setting.scenarios)
                                    }}</small>
                                </td>
                                <td data-label="Default">
                                    <code>{{ setting.default }}</code>
                                </td>
                                <td data-label="Why">{{ setting.reason }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        <section class="bench-prose">
            <h2 class="bench-title">Raw data</h2>
            <p>
                Every run's measurements, the load beside each, and the commands are in
                <a :href="fileUrl"
                    ><code>{{ props.data?.file }}</code></a
                >. The harness is
                <a :href="`${repository}/tree/master/tools/server-benchmark`"><code>tools/server-benchmark</code></a
                >, and this file came from:
            </p>
            <pre class="bench-command"><code>{{ results.command }}</code></pre>
            <details class="bench-runs">
                <summary>Every run, with its load</summary>
                <div class="bench-table-scroll">
                    <table>
                        <thead>
                            <tr>
                                <th scope="col">Round</th>
                                <th scope="col">Scenario</th>
                                <th scope="col">Server</th>
                                <th scope="col">Load before</th>
                                <th scope="col">Load after</th>
                                <th scope="col">Travel CPU s</th>
                                <th scope="col">Travel chunks</th>
                                <th scope="col">Result</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="run in runsByRound" :key="`${run.round}-${run.scenario}-${run.server}`">
                                <td>{{ run.round + 1 }}</td>
                                <td>{{ SCENARIO_TITLE[run.scenario] }}</td>
                                <td>{{ serverName(run.server) }}</td>
                                <td>{{ load(run.load.before) }}</td>
                                <td>{{ load(run.load.after) }}</td>
                                <td>{{ runCpu(run) }}</td>
                                <td>{{ run.phases ? number(0).format(run.phases.travel.columns) : '–' }}</td>
                                <td>{{ runResult(run) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </details>
        </section>
    </div>
    <p v-else class="bench-message">No benchmark results yet. Run <code>pnpm run bench:servers</code> to make some.</p>
</template>

<style scoped>
.bench {
    --bench-jsprismarine: var(--jsp-accent);
    --bench-pumpkin: var(--jsp-cream);
    --bench-bds: var(--jsp-mint);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--jsp-gap);
    color: var(--vp-c-text-1);
}

.bench-message {
    padding: 4rem 16px;
    color: var(--vp-c-text-2);
    text-align: center;
}

/* Hero: a forest panel, as on the parity tracker. */
.bench-hero {
    display: grid;
    gap: 20px;
    padding: clamp(16px, 3vw, 32px);
    color: var(--jsp-cream);
    background: var(--jsp-forest);
    border-radius: var(--jsp-radius-panel);
}

.bench-eyebrow {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    margin: 0;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--jsp-mint);
    text-transform: uppercase;
    letter-spacing: 0.12em;
}

.bench-eyebrow i {
    width: 10px;
    height: 10px;
    margin-right: 4px;
    background: var(--jsp-signal);
}

.bench-eyebrow a {
    color: inherit;
}

.bench-hero h1 {
    margin: 0;
    font-size: clamp(40px, 8vw, 88px);
    font-weight: 800;
    line-height: 0.9;
    letter-spacing: -0.055em;
    color: var(--jsp-cream);
}

.bench-lede {
    max-width: 62ch;
    margin: 0;
    font-size: 17px;
    line-height: 1.5;
    color: var(--jsp-mint);
}

/* The quiet or indicative label leads, since it says how far to trust everything under it. */
.bench-state {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 4px 14px;
    align-items: start;
    max-width: 80ch;
    font-size: 14px;
    line-height: 1.5;
    color: var(--jsp-mint);
}

.bench-state strong {
    padding: 4px 12px;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    border-radius: 99px;
}

.is-indicative strong {
    color: var(--jsp-ink);
    background: var(--jsp-warning);
}

.is-quiet strong {
    color: var(--jsp-on-accent);
    background: var(--jsp-accent);
}

.bench-facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--jsp-gap);
    margin: 0;
}

.bench-facts div {
    padding: 12px 14px;
    background: var(--jsp-deep);
    border-radius: var(--jsp-radius-control);
}

.bench-facts dt {
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--jsp-mint);
    text-transform: uppercase;
    letter-spacing: 0.12em;
}

.bench-facts dd {
    margin: 4px 0 0;
    font-size: 14px;
    color: var(--jsp-cream);
}

.bench-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
    padding: 0;
    margin: 0;
    list-style: none;
}

.bench-legend li {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    margin: 0;
    font-size: 15px;
    font-weight: 700;
}

.bench-legend code {
    font-size: var(--jsp-label-size);
    font-weight: 400;
    color: var(--jsp-mint);
    background: none;
}

/* Servers differ by shape as well as color: a circle, a square and a diamond. */
.bench-legend i,
.lane-round,
.lane-name::before {
    display: inline-block;
    width: 10px;
    height: 10px;
    background: var(--bench-color);
}

/* Through `:deep`, so the history charts' marks and lines take the same colors. */
.bench :deep(.is-jsprismarine-nethernet),
.bench :deep(.is-jsprismarine-raknet) {
    --bench-color: var(--bench-jsprismarine);
}

.bench :deep(.is-pumpkin) {
    --bench-color: var(--bench-pumpkin);
}

.bench :deep(.is-bds) {
    --bench-color: var(--bench-bds);
}

.is-jsprismarine-nethernet i,
.is-jsprismarine-nethernet .lane-round,
.is-jsprismarine-nethernet .lane-name::before,
.is-jsprismarine-raknet i,
.is-jsprismarine-raknet .lane-round,
.is-jsprismarine-raknet .lane-name::before {
    border-radius: 50%;
}

/* JSPrismarine over RakNet is a ring, so its two runs differ by shape as the servers do. */
.is-jsprismarine-raknet i,
.is-jsprismarine-raknet .lane-round,
.is-jsprismarine-raknet .lane-name::before {
    background: transparent;
    box-shadow: inset 0 0 0 2.5px var(--bench-color);
}

.is-bds i,
.is-bds .lane-round,
.is-bds .lane-name::before {
    transform: rotate(45deg) scale(0.85);
}

.bench-title {
    padding-top: 0;
    margin: 40px 0 0;
    border-top: 0;
}

.bench-title::before {
    display: block;
    width: 48px;
    height: 6px;
    margin-bottom: 14px;
    content: '';
    background: var(--jsp-state);
}

.bench-intro {
    max-width: 72ch;
    margin: 0 0 6px;
    color: var(--vp-c-text-2);
}

.bench-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr));
    gap: var(--jsp-gap);
}

/* Each metric is a forest card in both themes, so the server colors keep one surface to read on. */
.bench-metric {
    display: grid;
    gap: 14px;
    align-content: start;
    padding: 18px;
    color: var(--jsp-cream);
    background: var(--jsp-forest);
    border-radius: var(--jsp-radius-panel);
}

.bench-metric header {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    align-items: baseline;
    justify-content: space-between;
}

.bench-metric h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
    line-height: 1.15;
    letter-spacing: -0.02em;
    color: var(--jsp-cream);
}

.bench-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    font: var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--jsp-mint);
}

.bench-tags span {
    padding: 1px 8px;
    border: 1.5px solid var(--jsp-track);
    border-radius: 99px;
}

.bench-tags .kind-wall {
    color: var(--jsp-warning);
    border-color: var(--jsp-warning);
}

.bench-lanes {
    display: grid;
    gap: 10px;
    padding: 0;
    margin: 0;
    list-style: none;
}

.bench-lanes li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px 12px;
    align-items: baseline;
    margin: 0;
}

.lane-name {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.2;
}

.lane-name::before {
    flex: none;
    content: '';
}

.lane-value {
    font: 700 15px var(--vp-font-family-mono);
    font-variant-numeric: tabular-nums;
    text-align: right;
}

.lane-track {
    position: relative;
    grid-column: 1 / -1;
    height: 22px;
    background: var(--jsp-deep);
    border-radius: 4px;
}

/* Every round is a mark on the strip; the median is the bar across it. */
.lane-round {
    position: absolute;
    top: 6px;
    margin-left: -5px;
    outline: 1.5px solid var(--jsp-deep);
}

.lane-median {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 3px;
    margin-left: -1.5px;
    background: var(--bench-color);
}

.lane-compare,
.lane-empty {
    grid-column: 1 / -1;
    font: var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--jsp-mint);
}

.bench-explain {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--jsp-mint);
}

.bench-prose {
    max-width: 80ch;
}

.bench-prose p,
.bench-prose li {
    line-height: 1.65;
}

.bench-server {
    margin-top: 28px;
}

.bench-server h3 {
    margin: 0 0 4px;
}

.bench-source {
    margin: 0 0 10px;
    font-size: 14px;
    color: var(--vp-c-text-2);
    overflow-wrap: anywhere;
}

.bench-command {
    padding: 12px 14px;
    margin: 0 0 12px;
    overflow-x: auto;
    font: 13px/1.5 var(--vp-font-family-mono);
    color: var(--jsp-term-text);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--jsp-ink);
    border-radius: var(--jsp-radius-control);
}

.bench-scope {
    display: block;
    margin-top: 2px;
    font-size: 12px;
    color: var(--vp-c-text-2);
}

.bench-command code {
    padding: 0;
    color: inherit;
    background: none;
}

.bench-prose table,
.bench-history table {
    display: table;
    width: 100%;
    margin: 0;
    font-size: 14px;
}

.bench-prose td code {
    overflow-wrap: anywhere;
}

/* The reason is the longest cell, so it gets the most room; the values are short. */
.bench-settings th:nth-child(1) {
    width: 32%;
}

.bench-settings th:nth-child(2),
.bench-settings th:nth-child(3) {
    width: 14%;
}

.bench-runs summary {
    font-weight: 700;
    cursor: pointer;
}

.bench-table-scroll {
    overflow-x: auto;
}

.bench-runs table {
    font-variant-numeric: tabular-nums;
}

.hist-switch {
    display: inline-flex;
    gap: 4px;
    justify-self: start;
    padding: 4px;
    background: var(--jsp-forest);
    border-radius: 99px;
}

.hist-switch button {
    padding: 6px 14px;
    font-size: 14px;
    font-weight: 700;
    color: var(--jsp-mint);
    border-radius: 99px;
}

.hist-switch button[aria-pressed='true'] {
    color: var(--jsp-on-accent);
    background: var(--jsp-accent);
}

.hist-switch button:focus-visible {
    outline: 2px solid var(--jsp-signal);
    outline-offset: 2px;
}

/* The room the charts leave for their axis labels, which the date row under them lines up with. */
.bench-history {
    --hist-gutter: 68px;
    display: grid;
    /* Without a track of its own, the column grows to the runs table's width instead of letting
       the table scroll inside .bench-table-scroll, and the whole page scrolls sideways. */
    grid-template-columns: minmax(0, 1fr);
    gap: var(--jsp-gap);
}

.bench-history .bench-intro {
    margin: 0;
}

.hist-dates {
    display: flex;
    justify-content: space-between;
    margin: -6px 0 0 var(--hist-gutter);
    font: 12px var(--vp-font-family-mono);
    color: var(--jsp-mint);
}

.hist-start {
    max-width: 72ch;
    padding: 18px;
    margin: 0;
    line-height: 1.5;
    color: var(--jsp-mint);
    background: var(--jsp-forest);
    border-radius: var(--jsp-radius-panel);
}

.hist-start strong {
    display: block;
    color: var(--jsp-cream);
}

@media (max-width: 560px) {
    .bench-settings thead {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
    }

    .bench-settings,
    .bench-settings tbody {
        display: block;
    }

    .bench-settings tr {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        border-top: 1px solid var(--vp-c-divider);
    }

    .bench-settings td {
        border: 0;
    }

    .bench-settings td:first-child,
    .bench-settings td:last-child {
        grid-column: 1 / -1;
    }

    .bench-settings td:nth-child(2)::before,
    .bench-settings td:nth-child(3)::before {
        display: block;
        font: var(--jsp-label-size) var(--vp-font-family-mono);
        color: var(--vp-c-text-2);
        content: attr(data-label);
    }

    .bench-state {
        grid-template-columns: minmax(0, 1fr);
        justify-items: start;
    }
}
</style>
