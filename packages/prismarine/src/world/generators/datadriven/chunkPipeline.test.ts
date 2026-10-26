/**
 * That legacy whole-chunk workers and shared-status workers build the same chunks as this thread.
 *
 * This is the safety argument for worker generation. Task routing and concurrent roots depend
 * on worker count and queue timing, so output cannot depend on which worker ran a status.
 *
 * The comparison runs in a child process, not here. A worker thread resolves the pipeline module
 * through Node's own loader rather than through vitest's, and a dev checkout's imports have no
 * extensions, so the child is started with `--import tsx` and the workers inherit it. See
 * `test/chunkParity.ts`, which is where the two generators are actually compared.
 *
 * Gated, because it reads the Java vanilla datapack and the data generator reports:
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 * pnpm --filter @jsprismarine/bedrock-data run datagen:java
 * pnpm --filter @jsprismarine/prismarine exec vitest run src/world/generators
 * ```
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { findJavaWorldgenSources } from './javaWorldgenData';

const enabled = findJavaWorldgenSources() !== undefined;

/** Building five chunks twice, one of those times behind worker startup, is not fast. */
const TIMEOUT = 900_000;

const CHECKER = fileURLToPath(new URL('../../../../test/chunkParity.ts', import.meta.url));

describe.runIf(enabled)('a chunk built by workers', () => {
    it(
        'matches inline generation through both worker paths',
        () => {
            const output = execFileSync(process.execPath, ['--import', 'tsx', CHECKER], {
                encoding: 'utf8',
                cwd: fileURLToPath(new URL('../../../../', import.meta.url))
            });

            expect(output.trim()).toBe('ok');
        },
        TIMEOUT
    );
});
