/**
 * Which sub chunks are worth drawing random tick positions for.
 *
 * Java's `ServerLevel.tickChunk` asks each section `LevelChunkSection.isRandomlyTicking`, which
 * is `PalettedContainer.maybeHas(BlockState::isRandomlyTicking)`: a scan of the section's
 * palette, not of its 4096 blocks. A section of nothing but stone and deepslate is skipped
 * outright, and only the sections that survive consume draws.
 *
 * That is why the test belongs here rather than in the draw. The draw state is one counter
 * shared across the whole world, so a section that should have been skipped does not merely
 * waste three reads - it steps the counter three times and shifts every position drawn after
 * it, for every chunk, for the rest of the game. Getting the set of sections right is what
 * makes the ticked-position sequence Java's.
 *
 * `maybeHas` is "maybe" in Java too: a palette keeps an entry after the last block using it is
 * replaced, so a section that held one sapling keeps answering yes until it is rewritten. The
 * draws it costs land on blocks that take no tick and are discarded, which is exactly what
 * Java does with them.
 */
import { isRandomlyTicking } from '@jsprismarine/engine-systems';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { BlockStateSchemas } from '../block/state/BlockStateSchema';
import type SubChunk from './chunk/SubChunk';

/**
 * What each runtime id this world has met answers, keyed by the id itself.
 *
 * The question is asked once per palette entry per section per tick, which on a populated
 * world is tens of thousands of times a second, and answering it from the mapping table costs
 * a reverse index lookup and a property lookup. Both are the same for a given id forever, so
 * they are worth remembering. Cleared when a plugin changes the block catalog, the same
 * revision check {@link BlockRuntimeIds} makes for its own caches.
 */
let answers = new Map<number, boolean>();
let answeredRevision = -1;

/** Drops both memos when a plugin registration has changed what a runtime id names. */
const forgetStaleAnswers = (): void => {
    const revision = BlockStateSchemas.getRevision();
    if (answeredRevision === revision) return;

    answeredRevision = revision;
    answers = new Map();
    bySection = new WeakMap();
};

/**
 * Whether the block a chunk palette entry names takes random ticks.
 *
 * @param runtimeId - A runtime id out of a sub chunk's palette.
 * @returns False for an id this server has no state for, which cannot be ticked either way.
 */
export const takesRandomTicks = (runtimeId: number): boolean => {
    forgetStaleAnswers();

    const remembered = answers.get(runtimeId);
    if (remembered !== undefined) return remembered;

    const state = BlockRuntimeIds.getState(runtimeId);
    const answer = state !== null && isRandomlyTicking({ name: state.name, states: state.properties });
    answers.set(runtimeId, answer);
    return answer;
};

/**
 * What each sub chunk answered, and the revision it answered for.
 *
 * The question is asked for every section of every simulated chunk on every game tick, which
 * at the default simulation distance is 441 chunks times 24 sections, sixty times a second.
 * Almost none of those sections change between two ticks, and a sub chunk already counts its
 * own writes, so a section that has not been written to answers from the number it answered
 * with last time. Weak, so a chunk leaving memory takes its entry with it.
 */
let bySection = new WeakMap<SubChunk, { revision: number; answer: boolean }>();

/**
 * Java's `LevelChunkSection.isRandomlyTicking`, over Bedrock's two block layers.
 *
 * Both layers count: a waterlogged position keeps its water in the second one, and a block in
 * either layer that takes random ticks makes the section worth drawing for.
 *
 * @param section - The sub chunk to test.
 * @returns Whether any palette entry in the section names a randomly ticking block. An empty
 *   sub chunk answers false, because an all-air palette holds nothing that ticks.
 */
export const sectionTakesRandomTicks = (section: SubChunk): boolean => {
    forgetStaleAnswers();

    const revision = section.getRevision();
    const remembered = bySection.get(section);
    if (remembered !== undefined && remembered.revision === revision) return remembered.answer;

    let answer = false;
    for (const storage of section.getStorages()) {
        if (storage.getPalette().some(takesRandomTicks)) {
            answer = true;
            break;
        }
    }

    bySection.set(section, { revision, answer });
    return answer;
};
