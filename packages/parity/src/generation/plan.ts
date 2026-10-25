/**
 * Which chunks the generation corpus covers, and what each one is there to catch.
 *
 * The corpus is a regression net for the chunk generator, not a comparison against Java. It
 * exists because the world generation rewrite replaces the one-chunk-at-a-time generator with
 * a chunk-status ladder across worker threads, and the only way to know a rewrite changed
 * nothing is to have recorded what the old one produced.
 *
 * Every chunk here costs seconds, so the plan is chosen for coverage per second. Two tiers do
 * the work. A `terrain` chunk skips decoration, which means the generator samples one chunk of
 * noise instead of nine, so it costs about a quarter of a decorated chunk and still covers the
 * density functions, the aquifers, the surface rules, the carvers, the biome source and the
 * structure beards. A `full` chunk runs everything and is where features, structure pieces,
 * block entities and entity spawns appear. The plan spends most of its chunks on the cheap tier
 * for breadth and reserves the expensive tier for the places where the pass that only a
 * decorated chunk exercises can go wrong.
 *
 * Coordinates are not arbitrary. Each one was picked from a scan that recorded the biomes, the
 * terrain height range and the structure starts of a few dozen candidate chunks at three seeds;
 * `why` on each entry records what the scan found there.
 */

/** How much of the generator a corpus chunk runs. */
export type CorpusTier =
    /** Noise, aquifers, surface rules, carvers, biomes and structure beards. No decoration. */
    | 'terrain'
    /** Everything, including the decoration pass, the structure pieces and the block entities. */
    | 'full';

/** One chunk of the corpus. */
export interface CorpusChunk {
    /** `<seed>/<x>,<z>/<tier>`, which is also the key the golden and the diff report use. */
    readonly id: string;
    readonly seed: number;
    readonly chunkX: number;
    readonly chunkZ: number;
    readonly tier: CorpusTier;
    /** What this chunk covers that the others do not. */
    readonly why: string;
    /**
     * Whether the golden keeps every block of this chunk rather than a digest.
     *
     * A digest says a chunk changed. A whole chunk says where and into what, without anyone
     * having to reproduce the run, so a handful of them are kept at the cost of file size.
     */
    readonly whole?: true;
}

/** The three world seeds the corpus generates at. */
export const CORPUS_SEEDS = {
    /**
     * The seed Java's worldgen oracle dumped its nine columns at, so a divergence here can be
     * read beside `worldgen.terrain` rather than on its own.
     */
    oracle: 1234,
    /** A second seed, so a change that happens to be a no-op at seed 1234 still shows. */
    second: 987_654_321,
    /** A third seed, chosen for the land biomes the other two put under water. */
    third: 42
} as const;

const chunk = (
    seed: number,
    chunkX: number,
    chunkZ: number,
    tier: CorpusTier,
    why: string,
    whole?: true
): CorpusChunk => ({
    id: `${seed}/${chunkX},${chunkZ}/${tier}`,
    seed,
    chunkX,
    chunkZ,
    tier,
    why,
    ...(whole === undefined ? {} : { whole })
});

const { oracle, second, third } = CORPUS_SEEDS;

/**
 * Every chunk the corpus captures, cheap tier first.
 *
 * Nothing else declares how many chunks there are. A test that wants the count reads the length
 * of this list, so adding a chunk cannot leave a stated total behind.
 */
export const CORPUS_CHUNKS: readonly CorpusChunk[] = [
    chunk(oracle, 0, 0, 'terrain', 'Deep ocean at the world origin: water column, ocean floor, no land surface.', true),
    chunk(oracle, -96, 48, 'terrain', 'Hills whose surface sits between y 79 and y 95, across two biomes.'),
    chunk(oracle, 200, 200, 'terrain', 'A shoreline, where a land biome and an ocean biome meet inside one chunk.'),
    chunk(oracle, -150, -301, 'terrain', 'A surface that falls 18 blocks across the chunk, over two biomes.'),
    chunk(oracle, 333, -17, 'terrain', 'A beach below sea level, where the aquifer decides the water table.'),
    chunk(oracle, 64, 1024, 'terrain', 'Far from the origin, where the noise router runs on large coordinates.'),
    chunk(oracle, -512, 7, 'terrain', 'Negative x at distance, which flips the sign of every noise coordinate.'),
    chunk(second, 0, 0, 'terrain', 'Three biomes in one chunk, so the surface rules switch inside it.'),
    chunk(second, 12, -37, 'terrain', 'A plains and ocean border at a second seed.'),
    chunk(second, -96, 48, 'terrain', 'The high end of the height range: the surface reaches y 126.'),
    chunk(second, -150, -301, 'terrain', 'One biome over the whole chunk, which is the plain case the others are not.'),
    chunk(second, 333, -17, 'terrain', 'A single inland biome with a rolling surface.'),
    chunk(second, -512, 7, 'terrain', 'Negative x at distance under a different seed.'),
    chunk(third, 200, 200, 'terrain', 'Twelve distinct block states in one terrain chunk, the richest the scan found.'),
    chunk(third, 64, 1024, 'terrain', 'A coast with land up to y 72 and water beside it.'),

    chunk(oracle, 13, 13, 'full', 'The chunk an ocean monument starts in: structure pieces and block entities.', true),
    chunk(oracle, 14, 14, 'full', 'Inside the same monument, so the structure is written across a chunk border.'),
    chunk(oracle, -12, 0, 'full', 'An ocean ruin, a small structure that is placed from a template.'),
    chunk(oracle, 3, -14, 'full', 'Trial chambers, an underground jigsaw structure with its own block entities.'),
    chunk(second, -96, 48, 'full', 'The tall chunk, decorated: the feature pass on a surface near y 126.', true),
    chunk(third, 200, 200, 'full', 'Inland decoration with no structure, which is the common case.', true),
    chunk(third, 64, 1024, 'full', 'A decorated coast, where land features stop at the water line.')
];

/** The chunks the golden keeps block by block rather than as a digest. */
export const WHOLE_CHUNKS: readonly CorpusChunk[] = CORPUS_CHUNKS.filter((entry) => entry.whole === true);

/**
 * How far from the origin the structure placement scan runs, in chunks.
 *
 * A structure start is laid out against the bare noise and writes no block, which makes asking
 * where the structures are far cheaper than generating the chunks they sit in. The scan is
 * dense rather than sparse on purpose: `startsFor` only returns a start whose box reaches the
 * chunk it was asked about, so skipping chunks skips structures, while a contiguous square
 * reuses the same laid-out starts across its 2304 queries. At this radius the scan costs about
 * as much as two decorated chunks per seed and finds twenty starts across nine structure types.
 */
export const STRUCTURE_SCAN_RADIUS = 24;

/** The seeds the structure placement scan runs at, which are the seeds the chunks use. */
export const STRUCTURE_SCAN_SEEDS: readonly number[] = Object.values(CORPUS_SEEDS);

/** How many chunks the scan asks about, which is what the structure row's count derives from. */
export const STRUCTURE_SCAN_CHUNKS = STRUCTURE_SCAN_SEEDS.length * (2 * STRUCTURE_SCAN_RADIUS) ** 2;
