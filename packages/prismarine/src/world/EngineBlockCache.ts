/**
 * Runtime-id facts the block systems need often enough to keep beside the content build.
 *
 * Chunk palettes already store the integer id, so resolving every tick draw through the reverse
 * index, edition mapping, and content palette repeats work for a few states thousands of times.
 */
import { redstoneConductivity } from '@jsprismarine/blocks';
import type { BlockState as ContentBlockState } from '@jsprismarine/blocks';
import type { BlockRef } from '@jsprismarine/engine-systems';
import { bedrockBlockPropertiesOf, javaBlockStates } from '@jsprismarine/mapping';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { BlockStateSchemas } from '../block/state/BlockStateSchema';
import type { ServerContent } from '../content/ServerContent';

/** The block and the per-state facts used by the engine systems. */
export interface EngineBlockFacts {
    /** The immutable block reference in the engine's Java state vocabulary. */
    readonly block: BlockRef;
    /** Whether this Bedrock palette state receives random ticks. */
    readonly randomTicking: boolean;
    /** The resolved content state for this block, when the current pack stack defines it. */
    readonly contentState: ContentBlockState | undefined;
}

/** A cache bound to the current content build and block schema revision. */
export interface EngineBlockCache {
    /** Resolve one Bedrock runtime id to its immutable block reference and cached facts. */
    get(runtimeId: number): EngineBlockFacts;
}

/**
 * Builds the per-runtime-id cache used by an engine world.
 *
 * The cache is cleared when content reloads or a plugin registers a new block schema. Both
 * changes can alter the facts represented by an existing runtime id.
 * @param contentAtCall - The current resolved content build.
 * @returns The cache for that content source.
 */
export const createEngineBlockCache = (contentAtCall: () => ServerContent): EngineBlockCache => {
    let content: ServerContent | undefined;
    let schemaRevision = -1;
    const byRuntimeId = new Map<number, EngineBlockFacts>();

    return {
        get(runtimeId) {
            const currentContent = contentAtCall();
            const currentRevision = BlockStateSchemas.getRevision();
            if (currentContent !== content || currentRevision !== schemaRevision) {
                byRuntimeId.clear();
                content = currentContent;
                schemaRevision = currentRevision;
            }

            const cached = byRuntimeId.get(runtimeId);
            if (cached !== undefined) return cached;

            const state = BlockRuntimeIds.getState(runtimeId);
            if (state === null) {
                throw new Error(`Chunk holds runtime id ${runtimeId}, which no registered block produces`);
            }

            const contentState = currentContent.blocks.types.get(state.name)?.state(state.properties);
            const conductivity = contentState?.content.params(redstoneConductivity);
            const block = Object.freeze({
                name: state.name,
                states: Object.freeze(javaBlockStates(state.name, state.properties)),
                ...(conductivity === undefined ? {} : { redstoneConductor: conductivity.redstoneConductor })
            });

            // Random-tick overrides are keyed by Bedrock palette values. Java state spelling
            // changes pitcher_crop's upper_block_bit 0 to "lower", which no longer matches.
            const randomTicking = bedrockBlockPropertiesOf(state.name, state.properties)?.randomTick ?? false;
            const facts = Object.freeze({ block, randomTicking, contentState });
            byRuntimeId.set(runtimeId, facts);
            return facts;
        }
    };
};
