/**
 * Sweeps Node's semi-space and single-threaded GC flags against chunk generation.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:gc-tuning`. Set
 * `JSP_GC_TUNING_NODE` to another Node binary, including an opt-in custom build.
 * `JSP_GC_TUNING_REPETITIONS`, `JSP_GC_TUNING_SAMPLES`, and `JSP_GC_TUNING_WORKERS`
 * override the repeated workload. This benchmark never changes server defaults.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os, { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const packageDirectory = path.resolve(directory, '..');
const node = process.env.JSP_GC_TUNING_NODE ?? process.execPath;
const repetitions = Number.parseInt(process.env.JSP_GC_TUNING_REPETITIONS ?? '3', 10);
const samples = Number.parseInt(process.env.JSP_GC_TUNING_SAMPLES ?? '3', 10);
const workers = Number.parseInt(process.env.JSP_GC_TUNING_WORKERS ?? '4', 10);
const chunks = 16;
const modes = [
    { name: 'default', flags: [] },
    { name: 'semi-space-16', flags: ['--max-semi-space-size=16'] },
    { name: 'semi-space-32', flags: ['--max-semi-space-size=32'] },
    { name: 'semi-space-64', flags: ['--max-semi-space-size=64'] },
    { name: 'single-threaded-gc', flags: ['--single-threaded-gc'] }
];

const parseGcTrace = (output) => {
    const events = [];
    for (const line of output.split(/\r?\n/)) {
        const match = line.match(/^\[\d+:[^\]]+:(\d+)\]\s+[\d.]+\s+ms: GC: (\{.*\})$/);
        if (match === null) continue;
        const event = JSON.parse(match[2]);
        if (typeof event.gc !== 'string' || typeof event.pause !== 'number') continue;
        events.push({ threadId: Number(match[1]), kind: event.gc, pauseMs: event.pause });
    }
    return events;
};

const summarizeGc = (events) => {
    const summarize = (rows) => ({
        collections: rows.length,
        scavenges: rows.filter(({ kind }) => kind === 's').length,
        totalPauseMs: Number(rows.reduce((sum, { pauseMs }) => sum + pauseMs, 0).toFixed(3)),
        scavengePauseMs: Number(
            rows
                .filter(({ kind }) => kind === 's')
                .reduce((sum, { pauseMs }) => sum + pauseMs, 0)
                .toFixed(3)
        )
    });
    const main = events.filter(({ threadId }) => threadId === 0);
    const workerGroups = Map.groupBy(
        events.filter(({ threadId }) => threadId !== 0),
        ({ threadId }) => threadId
    );
    return {
        main: summarize(main),
        workers: summarize([...workerGroups.values()].flat()),
        workerThreads: [...workerGroups]
            .map(([threadId, rows]) => ({ threadId, ...summarize(rows) }))
            .sort((left, right) => left.threadId - right.threadId)
    };
};

const selfTest = () => {
    const events = parseGcTrace(
        [
            '[123:0x1:0] 12 ms: GC: {"gc":"s","pause":0.25}',
            '[123:0x2:4] 15 ms: GC: {"gc":"s","pause":0.75}',
            '[123:0x1:0] 20 ms: GC: {"gc":"mc","pause":2}'
        ].join('\n')
    );
    assert.deepEqual(summarizeGc(events), {
        main: { collections: 2, scavenges: 1, totalPauseMs: 2.25, scavengePauseMs: 0.25 },
        workers: { collections: 1, scavenges: 1, totalPauseMs: 0.75, scavengePauseMs: 0.75 },
        workerThreads: [{ threadId: 4, collections: 1, scavenges: 1, totalPauseMs: 0.75, scavengePauseMs: 0.75 }]
    });
};

const args = process.argv.slice(2).filter((argument) => argument !== '--');
if (args.includes('--self-test')) {
    selfTest();
    process.stdout.write('GC trace parser verified.\n');
} else {
    if (![repetitions, samples, workers].every(Number.isSafeInteger) || repetitions < 1 || samples < 1 || workers < 1) {
        throw new RangeError('Repetitions, samples, and workers must be positive integers');
    }

    const childEnvironment = { ...process.env };
    delete childEnvironment.NODE_OPTIONS;
    const metadata = spawnSync(
        node,
        [
            '-e',
            'process.stdout.write(JSON.stringify({ version: process.version, arch: process.arch, pointerCompression: process.config.variables.v8_enable_pointer_compression ?? null }))'
        ],
        { cwd: directory, encoding: 'utf8', env: childEnvironment }
    );
    if (metadata.status !== 0) throw new Error(`Cannot run benchmark Node ${node}: ${metadata.stderr}`);
    const runtime = JSON.parse(metadata.stdout);

    const runChild = (flags, traceGc) => {
        const args = [
            ...flags,
            ...(traceGc ? ['--trace-gc-nvp'] : []),
            '--import',
            'tsx',
            'benchmarks/chunkGeneration.ts',
            String(workers),
            String(chunks),
            'stages',
            '8',
            '2',
            String(traceGc ? 1 : samples)
        ];
        const result = spawnSync(node, args, {
            cwd: packageDirectory,
            encoding: 'utf8',
            env: childEnvironment,
            maxBuffer: 128 * 1024 * 1024
        });
        if (result.error !== undefined) throw result.error;
        if (result.status !== 0) {
            throw new Error(`Node benchmark failed (${result.status}):\n${result.stderr}\n${result.stdout}`);
        }
        const reportLine = result.stdout
            .split(/\r?\n/)
            .findLast((line) => line.startsWith('{"benchmark":"chunk-generation"'));
        if (reportLine === undefined) throw new Error('Chunk benchmark exited without its JSON report');
        return { report: JSON.parse(reportLine), trace: `${result.stdout}\n${result.stderr}` };
    };

    const samplesByMode = new Map(modes.map(({ name }) => [name, []]));
    const baselineDigest = { value: undefined };
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
        const order = [...modes.slice(repetition % modes.length), ...modes.slice(0, repetition % modes.length)];
        for (const mode of order) {
            const { report } = runChild(mode.flags, false);
            if (report.workerCount !== workers) {
                throw new Error(`Requested ${workers} workers but ${mode.name} started ${report.workerCount}`);
            }
            baselineDigest.value ??= report.outputDigest;
            assert.equal(report.outputDigest, baselineDigest.value, `${mode.name} changed the generated chunk digest`);
            samplesByMode.get(mode.name).push(report);
        }
    }

    const median = (values) => {
        const sorted = [...values].sort((left, right) => left - right);
        return sorted[Math.floor(sorted.length / 2)] ?? 0;
    };
    const measurements = [];
    for (const mode of modes) {
        const reports = samplesByMode.get(mode.name);
        const { trace } = runChild(mode.flags, true);
        const gcEvents = parseGcTrace(trace);
        const metric = (select) => median(reports.flatMap(select));
        measurements.push({
            candidate: mode.name,
            flags: mode.flags,
            wallMsP50: median(reports.map(({ distributionMs }) => distributionMs.p50)),
            wallMsPerChunkP50: median(reports.map(({ distributionMs }) => distributionMs.p50 / chunks)),
            processCpuMsP50: metric(({ processCpuMsByRun }) => processCpuMsByRun),
            processCpuMsPerChunkP50: metric(({ processCpuMsByRun }) => processCpuMsByRun.map((ms) => ms / chunks)),
            mainHeapUsedBytesP50: metric(({ mainHeapUsedBytesByRun }) => mainHeapUsedBytesByRun),
            workerHeapUsedBytesP50: metric(({ workerHeapUsedBytesByRun }) => workerHeapUsedBytesByRun.flat()),
            rssBytesP50: metric(({ rssBytesByRun }) => rssBytesByRun),
            gcDiagnostics: summarizeGc(gcEvents),
            gcDiagnosticScope: 'Node startup, two warmups, and one measured sample'
        });
    }

    process.stdout.write(
        `${JSON.stringify(
            {
                benchmark: 'chunk-generation-gc-tuning',
                node: runtime,
                platform: `${os.platform()}-${os.arch()}`,
                cpu: os.cpus()[0]?.model ?? 'unknown',
                availableParallelism: availableParallelism(),
                workers,
                chunks,
                seed: '1234',
                arm: 'stages',
                repetitions,
                samplesPerRepetition: samples,
                outputDigest: baselineDigest.value,
                nurseryFlagsApplyTo: 'main thread and workers inheriting Node options',
                measurements
            },
            null,
            4
        )}\n`
    );
}
