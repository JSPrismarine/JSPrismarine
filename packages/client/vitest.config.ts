import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineProject, mergeConfig } from 'vitest/config';

import base from '../../vitest.config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
    base,
    defineProject({
        root: resolve(__dirname),
        test: {
            // Every suite here boots a real server and connects a real client to it. Six of
            // those racing each other starve the boots past their hook timeouts, so the files
            // run one at a time. They still run alongside the other packages' projects.
            fileParallelism: false,
            typecheck: {
                tsconfig: `${__dirname}/tsconfig.test.json`
            }
        }
    })
);
