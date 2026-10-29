import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const reporters = ['verbose'];
const extraReporters = !process.env.GITHUB_ACTIONS ? [] : ['github-actions', 'junit'];
const exclude = [
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
    'vitest.config.ts',
    'vitest.workspace.ts'
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
        maxConcurrency: 16,
        passWithNoTests: true,
        silent: false,
        globals: true,
        isolate: false,
        reporters: [...reporters, ...extraReporters],
        outputFile: {
            junit: './junit.xml'
        },

        pool: 'forks',

        // Vitest's 5 s default is shorter than what a few suites need once the whole monorepo
        // forks at once: booting a server in `Server.test.ts` takes 2.7 s on its own and three
        // times that under load. Those runs are slow, not hung, so the timeout is what has to give.
        testTimeout: 30_000,

        setupFiles: [`${__dirname}/.test/vitest.setup.ts`],

        coverage: {
            all: true,
            exclude,
            provider: 'v8',
            reporter: ['json', 'json-summary', 'text-summary'],
            reportOnFailure: true
        },

        typecheck: {
            tsconfig: './tsconfig.json'
        }
    }
});
