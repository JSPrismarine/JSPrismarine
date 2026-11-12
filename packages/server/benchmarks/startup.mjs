import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = fileURLToPath(new URL('../', import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const probe = fileURLToPath(new URL('./startupProbe.mjs', import.meta.url));
const samples = Number.parseInt(process.argv.slice(2).find((argument) => argument !== '--') ?? '3', 10);
if (!Number.isInteger(samples) || samples < 1) throw new Error('samples must be a positive integer');

const entries = {
    source: ['--expose-gc', '--import', probe, '--import', 'tsx', '--unhandled-rejections=strict', './src/Server.ts'],
    dist: [
        '--expose-gc',
        '--import',
        probe,
        '--conditions=jsprismarine:dist',
        '--unhandled-rejections=strict',
        './dist/Server.js'
    ]
};

const run = (mode, sample) =>
    new Promise((resolve, reject) => {
        const directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-startup-'));
        const port = 23000 + ((process.pid + sample * 2 + (mode === 'dist' ? 1 : 0)) % 30000);
        writeFileSync(
            path.join(directory, 'config.json'),
            `${JSON.stringify(
                {
                    'server-ip': '127.0.0.1',
                    'server-port': port,
                    'level-name': 'world',
                    worlds: { world: { preset: 'minecraft:flat', provider: 'LevelDB', seed: '0' } },
                    'view-distance': 2,
                    'preload-radius': 0
                },
                null,
                4
            )}\n`
        );

        const child = spawn(process.execPath, entries[mode], {
            cwd: serverRoot,
            env: {
                ...process.env,
                JSP_DIR: directory,
                JSP_NO_TUI: '1',
                JSP_BSTATS: '0',
                NODE_ENV: 'production'
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });
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
            const metricLine = output.split('\n').find((line) => line.startsWith('JSP_STARTUP_METRIC '));
            if (metricLine === undefined || metrics !== undefined) return;
            metrics = JSON.parse(metricLine.slice('JSP_STARTUP_METRIC '.length));
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
            if (metrics === undefined)
                reject(new Error(`${mode} exited before listening (${code ?? signal}):\n${output}`));
            else {
                const listeningLine = output
                    .split('\n')
                    .find((line) => line.includes('JSPrismarine is now listening on port'));
                const loggerNamespaceVisible = listeningLine?.includes('Server') ?? false;
                if (!loggerNamespaceVisible) {
                    reject(
                        new Error(
                            `${mode} listening log did not include its Server namespace:\n${listeningLine ?? output}`
                        )
                    );
                    return;
                }
                resolve({ mode, sample, loggerNamespaceVisible, ...metrics });
            }
        });
        const timeout = setTimeout(() => {
            stop();
            reject(new Error(`${mode} did not listen within 120 seconds:\n${output}`));
        }, 120_000);
        child.once('exit', () => clearTimeout(timeout));
    });

const results = [];
for (let sample = 0; sample < samples; sample++) {
    const order = sample % 2 === 0 ? ['source', 'dist'] : ['dist', 'source'];
    for (const mode of order) results.push(await run(mode, sample + 1));
}

const median = (values) => {
    const ordered = [...values].sort((left, right) => left - right);
    return ordered[Math.floor(ordered.length / 2)];
};
const summary = Object.fromEntries(
    Object.keys(entries).map((mode) => {
        const runs = results.filter((result) => result.mode === mode);
        return [
            mode,
            {
                medianContentLoadMilliseconds: median(
                    runs.map((result) => result.contentLoadMilliseconds).filter(Number.isFinite)
                ),
                medianHeapUsedBytes: median(runs.map((result) => result.heapUsedBytes)),
                medianMainThreadCpuMicroseconds: median(runs.map((result) => result.mainThreadCpuMicroseconds)),
                medianProcessCpuMicroseconds: median(runs.map((result) => result.processCpuMicroseconds))
            }
        ];
    })
);

console.log(JSON.stringify({ benchmark: 'server-startup', root, results, summary }, null, 2));
