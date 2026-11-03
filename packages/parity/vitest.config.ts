import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineProject, mergeConfig } from 'vitest/config';

import base from '../../vitest.config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distConditions = process.env.JSP_PARITY_USE_DIST === '1' ? ['jsprismarine:dist'] : [];

export default mergeConfig(
    base,
    defineProject({
        root: resolve(__dirname),
        resolve: distConditions.length === 0 ? {} : { conditions: distConditions },
        test: {
            // Keep the dashboard exhaustive if the root test failure policy changes later.
            bail: 0,
            typecheck: {
                tsconfig: `${__dirname}/tsconfig.json`
            }
        }
    })
);
