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
            // The root config bails after two failures. The dashboard's job is to report every
            // family's real state, and a run that stopped early reports the rest as passing.
            bail: 0,
            typecheck: {
                tsconfig: `${__dirname}/tsconfig.json`
            }
        }
    })
);
