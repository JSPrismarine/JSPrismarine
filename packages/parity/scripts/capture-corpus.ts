/**
 * Captures the generation corpus golden from this checkout.
 *
 * Run it when a change to world generation is deliberate, and commit the result in the same
 * change, so the diff shows which chunks moved. Run it for no other reason: recapturing a
 * golden to make a failing row green throws away the only record of what the generator did.
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 * pnpm --filter @jsprismarine/bedrock-data run datagen:java
 * pnpm --filter @jsprismarine/parity run capture:corpus
 * ```
 *
 * The capture runs through Vite rather than node's own type stripping. The generator is
 * thousands of lines across six packages that use parameter properties and extensionless
 * relative imports, neither of which strip-only mode accepts, and Vitest already loads exactly
 * this graph the same way.
 */
import { createServer } from 'vite';

import { GENERATION_CORPUS_PATH } from '../src/references.ts';

const repoRoot = new URL('../../../', import.meta.url);

const server = await createServer({
    configFile: false,
    root: repoRoot.pathname,
    server: { middlewareMode: true },
    appType: 'custom',
    // The workspace packages are symlinked into node_modules, so Vite would externalize them
    // and hand them back to node, which cannot parse them. Transforming them is the point.
    ssr: { noExternal: [/@jsprismarine\//] }
});

try {
    // Vite's SSR loader returns an untyped namespace. The two modules are this package's own,
    // so `typeof import` is their real type and the compiler still checks every use below.
    const capture = (await server.ssrLoadModule(
        '/packages/parity/src/generation/capture.ts'
    )) as typeof import('../src/generation/capture.ts');
    const write = (await server.ssrLoadModule(
        '/packages/parity/src/generation/write.ts'
    )) as typeof import('../src/generation/write.ts');

    const environment = capture.openGeneration();
    if (environment === undefined) {
        console.error(
            'No Java world generation data in this checkout. Run `pnpm --filter @jsprismarine/bedrock-data run ' +
                'fetch:sources` and `pnpm --filter @jsprismarine/bedrock-data run datagen:java` first.'
        );
        process.exitCode = 1;
    } else {
        const result = await write.writeCorpusGolden(environment, (id, elapsedMs) => {
            console.error(`  ${id} in ${(elapsedMs / 1000).toFixed(1)}s`);
        });

        console.error(
            `Wrote ${GENERATION_CORPUS_PATH} at ${result.golden.provenance.commit.slice(0, 10)} against Java ` +
                `${result.golden.provenance.javaVersion}: ${result.golden.chunks.length} chunks, ` +
                `${result.golden.samples.length} kept whole, ${result.golden.structures.length} structure starts, ` +
                `in ${(result.elapsedMs / 1000).toFixed(1)}s.`
        );
    }
} finally {
    await server.close();
}
