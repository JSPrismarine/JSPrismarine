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
            // Keep the dashboard exhaustive if the root test failure policy changes later.
            bail: 0,
            typecheck: {
                tsconfig: `${__dirname}/tsconfig.json`
            }
        }
    })
);
