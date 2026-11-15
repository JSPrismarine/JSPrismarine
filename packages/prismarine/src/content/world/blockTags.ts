/**
 * Java block tags, asked about Bedrock blocks.
 *
 * A tag lists Java identifiers, and the world holds Bedrock states. The state-aware mapping
 * picks the one Java block a state came from, which is what tells Bedrock's one `torch` apart
 * from Java's `torch` and `wall_torch`; a block the mapping cannot place by state is asked
 * about every Java block it can stand for.
 */
import type { HookBlock } from '@jsprismarine/blocks';
import { bedrockBlockStateToJava, bedrockBlockToJava } from '@jsprismarine/mapping';

import type { ServerContent } from '../ServerContent';

/**
 * Whether a block belongs to a Java block tag.
 *
 * @param content - The content whose tags answer.
 * @param block - The Bedrock block, with its states.
 * @param tag - The namespaced Java tag, such as `minecraft:washed_away_by_fluids`.
 * @returns Undefined when the loaded stack declares no such tag, which a rule should read as
 *   "unknown" rather than "not in it"; see `WorldActions.hasBlockTag`.
 */
export const hasBlockTag = (content: ServerContent, block: HookBlock, tag: string): boolean | undefined => {
    if (!content.tags.has('block', tag)) return undefined;

    if (content.tags.includes('block', tag, block.identifier)) return true;
    const mapped = bedrockBlockStateToJava(block.identifier, block.states);
    const javaIdentifiers = mapped.kind === 'mapped' ? [mapped.java.name] : bedrockBlockToJava(block.identifier);
    return javaIdentifiers.some((identifier) => content.tags.includes('block', tag, identifier));
};
