import { availableParallelism, loadavg } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizePath } from 'vite';
import { defineConfig } from 'vitest/config';

import { integrationFiles } from './scripts/vitest-integration-files.ts';
import { seedSinceLastRun } from './scripts/vitest-seed-dependencies.ts';

const ci = !!process.env.GITHUB_ACTIONS;

/**
 * Locally every test is listed. CI prints the failed tests with their errors, the warnings and
 * errors any test wrote, and the totals: `minimal` lists failures only, and turning its silencing
 * off keeps what passing tests wrote, which `onConsoleLog` below narrows to `stderr`. GitHub gets
 * the failure annotations, the JUnit file for Codecov, and the JSON report the parity dashboard
 * reads its results from. A CI shard reports the same for its own files, and Codecov combines the
 * shards' uploads.
 */
const minimal = ['minimal', { silent: false }] as const;
/** A line in the log every time another tenth of the run's test files finishes. */
const progress = resolve(dirname(fileURLToPath(import.meta.url)), '.test/progressReporter.ts');
const reporters = !ci ? ['verbose'] : [minimal, progress, 'github-actions', 'junit', 'json'];
const exclude = [
    '.claude/**/*.*',
    '.changeset/**/*.*',
    '.github/**/*.*',
    '.husky/**/*.*',
    '.test/**/*.*',
    '.vscode/**/*.*',
    '**/.next',
    '**/.turbo',
    '**/*.d.ts',
    '**/*.js*',
    '**/*.mjs*',
    '**/*.stories.*',
    '**/coverage',
    '**/dist',
    '**/docs',
    '**/node_modules',
    '**/plop',
    '**/public',
    '**/src/index.ts',
    '**/storybook-static',
    '**/storybook',
    '**/vite.*.ts',
    '**/vitest.*.ts',
    'dist/**/*.*',
    'docs/**/*.*',
    'jsp/**/*.*',
    'node_modules/**/*.*',
    'turbo/**/*.*',
    'vite.config.ts',
    'vitest.config.ts'
];

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * `JSP_SKIP_INTEGRATION=1` leaves out the files tagged `@module-tag integration`, which boot an
 * in-process server and take most of a local run's time. CI never sets it, so it runs them all.
 */
const skipIntegration = process.env.JSP_SKIP_INTEGRATION === '1';

/**
 * Files, relative to the repository root, that the suites read from disk or that change how
 * everything runs, so no import graph leads to them. The docs pages are the ones the parity
 * conformance suites check against the code. The docs build hashes them, with the packages, to tell
 * whether the parity tracker it last built is still current.
 */
export const forceRerunTriggers = [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig*.json',
    '{vitest,vite}.config.*',
    '.test/**',
    'scripts/vitest-changed-files.ts',
    'scripts/vitest-seed-dependencies.ts',
    'scripts/vitest-integration-files.ts',
    'packages/bedrock-data/sources.json',
    'packages/bedrock-data/pack-hashes.json',
    'packages/bedrock-data/src/generated/**',
    'packages/bedrock-data/src/jsp/**',
    'docs/data-driven/parity.md',
    'docs/plans/data-driven-vanilla.md',
    'docs/research/edition-behavior-differences.md'
];

/**
 * Workers for a local run: the cores the last minute's load average leaves free, from 1 to 4.
 *
 * Several checkouts often run suites on one machine at once. Each starting 4 workers on a 4-core
 * machine put the load average at 40 and pushed the machine into swap, which made every run
 * slower than taking turns. `JSP_TEST_WORKERS` sets the count outright. Windows reports a load
 * average of 0, so it gets 4.
 */
const localWorkers = (): number => {
    const requested = Number.parseInt(process.env.JSP_TEST_WORKERS ?? '', 10);
    if (Number.isInteger(requested) && requested > 0) return requested;
    const free = availableParallelism() - Math.round(loadavg()[0] ?? 0);
    return Math.min(4, Math.max(1, free));
};

/** The repository root as a glob that matches only itself, in the forward slashes Vitest compares. */
const rootPattern = normalizePath(__dirname).replace(/[$()*+?[\\\]^{|}!@]/g, '\\$&');

export default defineConfig({
    root: resolve(__dirname),
    // A checkout with no `--since-last-run` records gets them from the import graph, so its first
    // run is not a full one.
    plugins: [seedSinceLastRun({ forceRerunTriggers })],
    optimizeDeps: {
        force: true,
        esbuildOptions: {
            define: {
                global: 'globalThis'
            },
            plugins: []
        }
    },
    test: {
        bail: 0,
        tags: [
            { name: 'real-data', description: 'Tests that require fetched game data.' },
            { name: 'performance', description: 'Tests whose timing or workload depends on the host machine.' },
            { name: 'bedrock-server', description: 'Tests that boot the pinned Bedrock Dedicated Server.' },
            {
                name: 'integration',
                description: 'Files that boot an in-process server, often with a client joined to it.'
            }
        ],
        environment: 'node',
        exclude: skipIntegration ? [...exclude, ...integrationFiles(__dirname)] : exclude,
        fsModuleCache: true,
        fsModuleCachePath: resolve(__dirname, 'node_modules/.cache/vitest'),
        maxConcurrency: 8,
        // CI runs two forks per core the runner reports: a fork spends much of a file waiting on
        // Vite to transform modules, so one per core leaves cores idle. Local runs use the cores
        // the machine's load leaves free, up to 4.
        maxWorkers: process.env.GITHUB_ACTIONS ? '200%' : localWorkers(),
        passWithNoTests: true,
        // `--changed` runs only the suites whose import graph reaches a changed file, and a match
        // on any of these runs every suite instead. Each is anchored at the repository root:
        // Vitest's defaults match a `package.json` or a Vite config in any directory, so one
        // package's manifest used to run every suite. The provider below gives such a file to its
        // own package.
        forceRerunTriggers: forceRerunTriggers.map((pattern) => `${rootPattern}/${pattern}`),
        experimental: {
            // `--since-last-run` replaces this with Vitest's own `mtime` provider.
            vcsProvider: resolve(__dirname, 'scripts/vitest-changed-files.ts')
        },
        silent: false,
        globals: true,
        reporters,
        // CI keeps `console.warn` and `console.error`, which is where a test says something is off,
        // and drops `console.log` and `console.info`, which is most of the noise.
        ...(ci ? { onConsoleLog: (_log: string, type: 'stdout' | 'stderr') => type === 'stderr' } : {}),
        outputFile: {
            junit: './junit.xml',
            json: './vitest-report.json'
        },

        // Vitest's performance guide finds `forks` slightly slower than `threads` in larger
        // projects. Nothing here needs a process of its own: no test changes the working
        // directory, which a thread cannot, and the OpenTUI console tests pass in threads.
        pool: 'threads',

        // No file gets a worker of its own. A fresh worker per file spent most of each file
        // transforming and importing the same module graph again, and the suite paid that twelve
        // hundred times. Each worker now imports it once and runs file after file, the OpenTUI
        // console tests included. Fake timers are reset after every test by the setup file.
        isolate: false,

        // A test that hangs fails here instead of holding its shard. Under a full local run no
        // test without its own budget took over 10 s, the slowest a server boot or a real-server
        // client session, and 20 s leaves room for a CI runner with half the cores. The few tests
        // that need longer, such as the worldgen determinism suites, pass their own timeout.
        testTimeout: 20_000,

        setupFiles: [`${__dirname}/.test/vitest.setup.ts`],

        coverage: {
            all: true,
            // Test helpers are test code that tests import, not source the tests are meant to cover.
            exclude: [...exclude, '**/*.test.helper.ts', '**/*.test-utils.ts'],
            provider: 'v8',
            // LCOV for Codecov, with paths relative to the repository like the client e2e report's,
            // so the two merge file by file. `lcovonly` rather than `lcov`, which also renders an
            // HTML page per source file that nothing reads, written one by one after the run while
            // the job waits.
            reporter: ['lcovonly', 'text-summary'],
            reportOnFailure: true
        },

        typecheck: {
            tsconfig: './tsconfig.json'
        }
    }
});
