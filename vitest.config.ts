import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const reporters = ['verbose'];
const extraReporters = !process.env.GITHUB_ACTIONS ? [] : ['github-actions'];
const exclude = [
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
        bail: 2,
        environment: 'node',
        exclude,
        maxConcurrency: 16,
        passWithNoTests: true,
        silent: false,
        globals: true,
        reporters: [...reporters, ...extraReporters, 'github-actions'],

        pool: 'threads',

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
