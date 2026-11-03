import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = fileURLToPath(new URL('../', import.meta.url));
const compare = process.argv.includes('--compare');
const baselineOnly = process.argv.includes('--baseline');
const baselineImports = fileURLToPath(new URL('./hostStartupBaseline.mjs', import.meta.url));
const samples = Number.parseInt(process.argv.slice(2).find((argument) => /^\d+$/.test(argument)) ?? '3', 10);
const HOST_HEAP_LIMIT_BYTES = 30_000_000;
if (!Number.isInteger(samples) || samples < 1) throw new Error('samples must be a positive integer');

const run = (sample, baseline) =>
    new Promise((resolve, reject) => {
        const directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-host-startup-'));
        const port = 23000 + ((process.pid + sample) % 30000);
        writeFileSync(
            path.join(directory, 'config.json'),
            `${JSON.stringify(
                {
                    'server-ip': '127.0.0.1',
                    port,
                    'level-name': 'world',
                    worlds: { world: { preset: 'minecraft:flat', provider: 'LevelDB', seed: '0' } },
                    'view-distance': 2,
                    'preload-radius': 0
                },
                null,
                4
            )}\n`
        );

        const startedAt = Date.now();
        const child = spawn(
            process.execPath,
            [
                '--expose-gc',
                '--import',
                'tsx',
                ...(baseline ? ['--import', baselineImports] : []),
                '--unhandled-rejections=strict',
                './src/Server.ts',
                '--watch',
                '--no-tui'
            ],
            {
                cwd: serverRoot,
                env: {
                    ...process.env,
                    JSP_DIR: directory,
                    JSP_HOST_STARTUP_STARTED_AT: String(startedAt),
                    JSP_NO_TUI: '1',
                    NODE_ENV: 'development'
                },
                stdio: ['ignore', 'pipe', 'pipe']
            }
        );
        let output = '';
        let metrics;
        let stopping = false;

        const stop = () => {
            if (stopping) return;
            stopping = true;
            child.kill('SIGTERM');
        };

        const onOutput = (chunk) => {
            output += chunk.toString();
            const metricLine = output.split('\n').find((line) => line.startsWith('JSP_HOST_STARTUP_METRIC '));
            if (metricLine === undefined || metrics !== undefined) return;
            metrics = JSON.parse(metricLine.slice('JSP_HOST_STARTUP_METRIC '.length));
            stop();
        };

        child.stdout.setEncoding('utf8').on('data', onOutput);
        child.stderr.setEncoding('utf8').on('data', onOutput);
        child.once('error', (error) => {
            rmSync(directory, { recursive: true, force: true });
            reject(error);
        });
        child.once('exit', (code, signal) => {
            rmSync(directory, { recursive: true, force: true });
            if (metrics === undefined) reject(new Error(`host exited before startup (${code ?? signal}):\n${output}`));
            else
                resolve({
                    sample,
                    imports: baseline ? 'full-prismarine-graph' : 'light-host-modules',
                    ...metrics
                });
        });
        const timeout = setTimeout(() => {
            stop();
            reject(new Error(`host did not listen within 120 seconds:\n${output}`));
        }, 120_000);
        child.once('exit', () => clearTimeout(timeout));
    });

const modes = compare ? [false, true] : [baselineOnly];
const results = [];
for (let sample = 1; sample <= samples; sample++) {
    const order = compare && sample % 2 === 0 ? [...modes].reverse() : modes;
    for (const baseline of order) results.push(await run(sample, baseline));
}

const oversizedHost = results.find(
    (result) => result.imports === 'light-host-modules' && result.heapUsedBytes >= HOST_HEAP_LIMIT_BYTES
);
if (oversizedHost !== undefined) {
    throw new Error(`host retained ${oversizedHost.heapUsedBytes} bytes after GC; limit is ${HOST_HEAP_LIMIT_BYTES}`);
}

const median = (values) => {
    const ordered = [...values].sort((left, right) => left - right);
    return ordered[Math.floor(ordered.length / 2)];
};

const summaries = Object.fromEntries(
    [...new Set(results.map((result) => result.imports))].map((imports) => {
        const modeResults = results.filter((result) => result.imports === imports);
        return [
            imports,
            {
                medianElapsedMilliseconds: median(modeResults.map((result) => result.elapsedMilliseconds)),
                medianHeapUsedBytes: median(modeResults.map((result) => result.heapUsedBytes))
            }
        ];
    })
);

console.log(JSON.stringify({ benchmark: 'host-startup', node: process.version, results, summaries }, null, 2));
