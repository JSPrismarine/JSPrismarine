/**
 * How long the overworld generator takes per chunk, and where the time goes.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:chunks`. Pass a worker count as the
 * first argument and a chunk count as the second; `0` workers runs the whole thing on this
 * thread, which is the figure every other arm is worth comparing against.
 *
 * The chunks are a contiguous block rather than scattered positions, because that is the shape
 * a start region and a player's view distance both have: neighbors are shared, and a run over
 * scattered chunks would charge each one for a neighborhood nothing else reuses.
 *
 * This needs Mojang's world generation data, the same as the generator does. Without it the
 * run reports what is missing and stops.
 */
import { availableParallelism } from 'node:os';

import {
    DataDrivenGenerator,
    defaultChunkPipeline,
    defaultTerrainPipeline
} from '../src/world/generators/datadriven/DataDrivenGenerator';
import { findJavaTemplateSource } from '../src/world/generators/datadriven/javaStructureTemplates';
import {
    cacheRoot,
    findJavaWorldgenSources,
    loadJavaWorldgenRegistries
} from '../src/world/generators/datadriven/javaWorldgenData';

const workers = Number.parseInt(process.argv[2] ?? '0', 10);
const chunks = Number.parseInt(process.argv[3] ?? '16', 10);
/**
 * Which half of the ladder to run, so a change can be charged to one of them.
 *
 * `terrain` is the noise fill alone, `structures` adds the layout pass that pushes terrain
 * around, and the default runs the decoration pass and the Bedrock translation as well.
 */
const arm = process.argv[4] ?? 'full';
/** Region size and steal threshold, for sweeping the sharded pool's two knobs. */
const regionChunks = Number.parseInt(process.argv[5] ?? '8', 10);
const stealAfter = Number.parseInt(process.argv[6] ?? '2', 10);
const seed = 1234n;

const sources = findJavaWorldgenSources();
if (sources === undefined) {
    process.stderr.write(
        'No Java world generation data. Run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` ' +
            'and `pnpm --filter @jsprismarine/bedrock-data run datagen:java` first.\n'
    );
    process.exit(1);
}

const startedLoading = performance.now();
const registries = loadJavaWorldgenRegistries(sources);
const templates = findJavaTemplateSource(cacheRoot(), registries.processorLists);
const loaded = performance.now() - startedLoading;

const generator = new DataDrivenGenerator({
    registries,
    templates,
    ...(arm === 'terrain' ? { decorate: false, structures: false } : {}),
    ...(arm === 'structures' ? { decorate: false } : {}),
    ...(workers > 0 && arm === 'chunks'
        ? {
              chunks: {
                  pipeline: defaultChunkPipeline(),
                  workers,
                  regionChunks,
                  stealAfter,
                  onUnavailable: (reason) => process.stderr.write(`no chunk pool: ${reason}\n`)
              }
          }
        : {}),
    ...(workers > 0 && arm !== 'chunks'
        ? {
              terrain: {
                  pipeline: defaultTerrainPipeline(),
                  workers,
                  onUnavailable: (reason) => process.stderr.write(`no pool: ${reason}\n`)
              }
          }
        : {})
});

/** A square of chunks, side by side, the way a start region fills. */
const side = Math.ceil(Math.sqrt(chunks));
const positions = Array.from({ length: chunks }, (_unused, index) => [index % side, Math.trunc(index / side)] as const);

const run = async (): Promise<void> => {
    const started = performance.now();
    // All at once, because that is how the preload and the chunk scheduler ask: the depth is
    // what lets a pool have more than one worker busy.
    await Promise.all(positions.map(async ([x, z]) => generator.generateChunk(x, z, seed)));
    const elapsed = performance.now() - started;

    process.stdout.write(
        `${workers === 0 ? 'inline' : `${workers} workers`} (${arm}` +
            `${arm === 'chunks' ? `, region ${regionChunks}, steal ${stealAfter}` : ''}): ` +
            `${chunks} chunks in ${elapsed.toFixed(0)} ms, ` +
            `${(elapsed / chunks).toFixed(1)} ms/chunk, ${((chunks / elapsed) * 1000).toFixed(1)} chunks/s ` +
            `(registries loaded in ${loaded.toFixed(0)} ms, ${availableParallelism()} cores)\n`
    );

    generator.stopGenerating();
};

await run();
process.exit(0);
