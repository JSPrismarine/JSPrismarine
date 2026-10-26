/**
 * Builds the same chunks three ways: on this thread, through the legacy whole-chunk pool, and
 * through the shared status pool. Reports whether each worker path matches inline output.
 *
 * A separate process rather than a test body because of how a worker resolves modules. A
 * worker thread is a second module loader and reads the pipeline off disk through Node's own
 * resolution, so it needs whatever loader the host was started with; vitest's workers are not
 * started with one, and a dev checkout's `@jsprismarine/*` imports have no extensions. Started
 * with `--import tsx`, as `chunkPipeline.test.ts` starts this, the workers inherit it.
 *
 * Prints `ok` and exits 0 when every chunk matched, or the positions that differed and exits 1.
 */
import { DataDrivenGenerator, defaultChunkPipeline } from '../src/world/generators/datadriven/DataDrivenGenerator';
import { findJavaTemplateSource } from '../src/world/generators/datadriven/javaStructureTemplates';
import {
    cacheRoot,
    findJavaWorldgenSources,
    loadJavaWorldgenRegistries
} from '../src/world/generators/datadriven/javaWorldgenData';
import type Chunk from '../src/world/chunk/Chunk';

const SEED = 1234n;

/**
 * Chunks from more than one region, so the pool routes them to different workers.
 *
 * Adjacent pairs as well as distant ones: neighbors share the terrain a worker caches, and a
 * fault in that sharing would show as a seam between them rather than in either alone.
 */
const CHUNKS = [
    [0, 0],
    [1, 0],
    [0, 1],
    [9, 9],
    [-5, 3]
] as const;

const sources = findJavaWorldgenSources();
if (sources === undefined) {
    process.stderr.write('no Java world generation data\n');
    process.exit(2);
}

const open = (mode: 'inline' | 'chunks' | 'stages'): DataDrivenGenerator => {
    const registries = loadJavaWorldgenRegistries(sources);

    return new DataDrivenGenerator({
        registries,
        templates: findJavaTemplateSource(cacheRoot(), registries.processorLists),
        ...(mode === 'chunks'
            ? {
                  chunks: {
                      pipeline: defaultChunkPipeline(),
                      workers: 3,
                      // Small, so these chunks fall in more than one region and the run covers
                      // a chunk whose neighbors its worker had never seen.
                      regionChunks: 4,
                      onUnavailable: (reason: string) => {
                          process.stderr.write(`the chunk pool refused to start: ${reason}\n`);
                          process.exit(3);
                      }
                  }
              }
            : mode === 'stages'
              ? {
                    stages: {
                        pipeline: defaultChunkPipeline(),
                        workers: 3,
                        javaTemplates: true,
                        onUnavailable: (reason: string) => {
                            process.stderr.write(`the stage pool refused to start: ${reason}\n`);
                            process.exit(3);
                        }
                    }
                }
              : {})
    });
};

/** The blocks, the biomes and the block entities, as the wire carries them. */
const built = (chunk: Chunk): string => chunk.networkSerialize().toString('base64');

const inline = open('inline');
const chunkPool = open('chunks');
const stagePool = open('stages');

const expected = new Map<string, string>();
for (const [x, z] of CHUNKS) expected.set(`${x},${z}`, built(await inline.generateChunk(x, z, SEED)));

const compare = async (generator: DataDrivenGenerator): Promise<string[]> => {
    const actual = new Map<string, string>();
    await Promise.all(
        CHUNKS.map(async ([x, z]) => {
            actual.set(`${x},${z}`, built(await generator.generateChunk(x, z, SEED)));
        })
    );
    return [...expected].filter(([position, chunk]) => actual.get(position) !== chunk).map(([position]) => position);
};

const [chunkDifferences, stageDifferences] = await Promise.all([compare(chunkPool), compare(stagePool)]);

inline.stopGenerating();
chunkPool.stopGenerating();
stagePool.stopGenerating();

if (chunkDifferences.length > 0 || stageDifferences.length > 0) {
    if (chunkDifferences.length > 0) process.stderr.write(`whole-chunk pool differs: ${chunkDifferences.join(' ')}\n`);
    if (stageDifferences.length > 0) process.stderr.write(`stage pool differs: ${stageDifferences.join(' ')}\n`);
    process.exit(1);
}

process.stdout.write('ok\n');
process.exit(0);
