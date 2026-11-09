import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { configDefaults, defineConfig } from 'vitest/config';

const reporters = ['verbose'];
const extraReporters = !process.env.GITHUB_ACTIONS ? [] : ['github-actions', 'junit'];
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
        exclude,
        fsModuleCache: true,
        fsModuleCachePath: resolve(__dirname, 'node_modules/.cache/vitest'),
        maxConcurrency: 8,
        // CI scales to one fork per core the runner reports, so a larger runner runs more files at
        // once without editing this file. Local runs stay at 4 to leave a workstation responsive.
        maxWorkers: process.env.GITHUB_ACTIONS ? '100%' : 4,
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
        // Each file gets a fresh process. Sharing a worker across files let one file's leftovers
        // (a mocked `@jsprismarine/raknet`, fake timers, OpenTUI's process-global native renderer,
        // a socket or ticker nobody closed) hang whichever file landed in the same worker next,
        // and only on CI where the scheduling differed: `inputBar`, `Login` and `ClientHandshake`
        // each timed out in turn. Chasing the leaker file by file did not converge.
        isolate: true,
        reporters: [...reporters, ...extraReporters],
        outputFile: {
            junit: './junit.xml'
        },

        pool: 'forks',

        // Vitest's 5 s default is shorter than what a few suites need once the whole monorepo
        // forks at once: booting a server in `Server.test.ts` takes 2.7 s on its own and three
        // times that under load. Those runs are slow, not hung, so the timeout is what has to give.
        testTimeout: 60_000,

        setupFiles: [`${__dirname}/.test/vitest.setup.ts`],

        coverage: {
            all: true,
            exclude,
            provider: 'v8',
            // LCOV for Codecov, with paths relative to the repository like the client e2e report's,
            // so the two merge file by file; JSON for the GitHub coverage comment.
            reporter: ['json', 'json-summary', 'lcov', 'text-summary'],
            reportOnFailure: true
        },

        typecheck: {
            tsconfig: './tsconfig.json'
        }
    }
});
