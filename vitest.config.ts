import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { configDefaults, defineConfig } from 'vitest/config';

const ci = !!process.env.GITHUB_ACTIONS;

/**
 * Locally every test is listed. CI prints the failed tests with their errors, the warnings and
 * errors any test wrote, and the totals: `minimal` lists failures only, and turning its silencing
 * off keeps what passing tests wrote, which `onConsoleLog` below narrows to `stderr`. GitHub gets
 * the failure annotations and the JUnit file for Codecov.
 */
const minimal = ['minimal', { silent: false }] as const;
/**
 * A CI shard (`VITEST_SHARD` set by the workflow) prints the same and also writes the blob the
 * merge job reads. The annotations and JUnit come from the merge job alone, so each failure is
 * annotated once.
 */
/** A line in the log every time another tenth of the run's test files finishes. */
const progress = resolve(dirname(fileURLToPath(import.meta.url)), '.test/progressReporter.ts');
const reporters = !ci
    ? ['verbose']
    : process.env.VITEST_SHARD
      ? [minimal, progress, 'blob']
      : [minimal, progress, 'github-actions', 'junit'];
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

export default defineConfig({
    root: resolve(__dirname),
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
            { name: 'performance', description: 'Tests whose timing or workload depends on the host machine.' }
        ],
        environment: 'node',
        // Every test file lives under these, so the search for them skips the rest of the tree.
        include: ['{packages,tools,scripts}/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
        exclude,
        fsModuleCache: true,
        fsModuleCachePath: resolve(__dirname, 'node_modules/.cache/vitest'),
        maxConcurrency: 8,
        // CI runs two forks per core the runner reports: a fork spends much of a file waiting on
        // Vite to transform modules, so one per core leaves cores idle. Local runs stay at 4 to
        // leave a workstation responsive.
        maxWorkers: process.env.GITHUB_ACTIONS ? '200%' : 4,
        passWithNoTests: true,
        // `--changed` runs only the suites whose import graph reaches a changed file, and a match
        // on any of these runs every suite instead. They are inputs the suites read from disk or
        // that change how everything runs, so no import graph leads to them. The docs pages are
        // the ones the parity conformance suites check against the code.
        forceRerunTriggers: [
            ...configDefaults.forceRerunTriggers,
            '**/pnpm-lock.yaml',
            '**/pnpm-workspace.yaml',
            '**/tsconfig*.json',
            '**/.test/**',
            '**/packages/bedrock-data/sources.json',
            '**/packages/bedrock-data/pack-hashes.json',
            '**/packages/bedrock-data/src/generated/**',
            '**/packages/bedrock-data/src/jsp/**',
            '**/docs/data-driven/parity.md',
            '**/docs/plans/data-driven-vanilla.md',
            '**/docs/research/edition-behavior-differences.md'
        ],
        silent: false,
        globals: true,
        reporters,
        // CI keeps `console.warn` and `console.error`, which is where a test says something is off,
        // and drops `console.log` and `console.info`, which is most of the noise.
        ...(ci ? { onConsoleLog: (_log: string, type: 'stdout' | 'stderr') => type === 'stderr' } : {}),
        outputFile: {
            junit: './junit.xml'
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
            exclude,
            provider: 'v8',
            // LCOV for Codecov, with paths relative to the repository like the client e2e report's,
            // so the two merge file by file; JSON for the GitHub coverage comment. `lcovonly`
            // rather than `lcov`, which also renders an HTML page per source file that nothing
            // reads, written one by one after the run while the job waits.
            reporter: ['json', 'json-summary', 'lcovonly', 'text-summary'],
            reportOnFailure: true
        },

        typecheck: {
            tsconfig: './tsconfig.json'
        }
    }
});
