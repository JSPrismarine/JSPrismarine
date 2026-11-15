/**
 * What flowing water and lava may destroy, by the edition the server is set to follow.
 *
 * The two editions disagree. Bedrock gives each block a `liquidReactionOnTouch`, and its water
 * pops a big dripleaf or a carpet of cave vines it reaches. Java 26.3 decides it in
 * `FlowingFluid.canHoldFluid`: a fluid may enter a block in `#minecraft:washed_away_by_fluids`,
 * and never one that is a `LiquidBlockContainer`, whose `canPlaceLiquid` accepts only a still
 * water source and so turns every flowing fluid away. Read from the 26.3 jar: every
 * `SimpleWaterloggedBlock` is such a container, as are kelp, its plant, seagrass and tall
 * seagrass, which hold water without a `waterlogged` property.
 */
import type { HookBlock, LiquidReaction } from '@jsprismarine/blocks';
import { bedrockLiquidReactionOf } from '@jsprismarine/blocks';
import { bedrockBlockStateToJava, bedrockBlockToJava } from '@jsprismarine/mapping';

import { liquidOf } from '../../world/physics/BlockRules';
import type { ServerContent } from '../ServerContent';
import { hasBlockTag } from './blockTags';

/** Which edition decides what a flowing fluid destroys: the `fluid-replacement` setting. */
export type FluidReplacement = 'java' | 'bedrock';

/** The edition the server follows when nothing says otherwise. */
export const DEFAULT_FLUID_REPLACEMENT: FluidReplacement = 'java';

/** Bedrock's one air block, which a fluid fills under either rule. */
const AIR = 'minecraft:air';

/** The Java tag a fluid may wash a block out of, `BlockTags.WASHED_AWAY_BY_FLUIDS`. */
export const WASHED_AWAY_BY_FLUIDS = 'minecraft:washed_away_by_fluids';

/** Java's `LiquidBlockContainer`s that hold water without a `waterlogged` property. */
const ALWAYS_HOLDS_WATER: ReadonlySet<string> = new Set([
    'minecraft:kelp',
    'minecraft:kelp_plant',
    'minecraft:seagrass',
    'minecraft:tall_seagrass'
]);

/**
 * Whether the Java block a Bedrock state comes from is a `LiquidBlockContainer`, which no flowing
 * fluid enters: a block with a `waterlogged` property, or one that always holds water.
 */
export const isJavaLiquidContainer = (block: Pick<HookBlock, 'identifier' | 'states'>): boolean => {
    const mapped = bedrockBlockStateToJava(block.identifier, block.states);
    if (mapped.kind === 'mapped') {
        return 'waterlogged' in mapped.java.properties || ALWAYS_HOLDS_WATER.has(mapped.java.name);
    }
    return bedrockBlockToJava(block.identifier).some((name) => ALWAYS_HOLDS_WATER.has(name));
};

/**
 * What a flowing fluid does to a block by Java 26.3's rule, or undefined when the content declares
 * no `#minecraft:washed_away_by_fluids` to read it from.
 */
export const javaLiquidReactionOf = (content: ServerContent, block: HookBlock): LiquidReaction | undefined => {
    const tagged = hasBlockTag(content, block, WASHED_AWAY_BY_FLUIDS);
    if (tagged === undefined) return undefined;
    // Washed away rolls the block's loot, which is Java's `dropResources` in `beforeDestroyingBlock`.
    return tagged && !isJavaLiquidContainer(block) ? 'popped' : 'blocking';
};

/**
 * What a flowing fluid does to a block by the configured edition.
 *
 * Air and the fluids themselves answer Bedrock's `none` under either rule: a fluid shares their
 * cell rather than destroying them. Java's rule falls back to Bedrock's for a block when the
 * content cannot answer it, so a stack without the vanilla tags behaves as before.
 *
 * @param content - The content whose tags Java's rule reads.
 * @param block - The block the fluid reaches.
 * @param rule - The edition to follow.
 */
export const liquidReactionOf = (
    content: ServerContent,
    block: HookBlock,
    rule: FluidReplacement
): LiquidReaction | undefined => {
    const bedrock = bedrockLiquidReactionOf(block.identifier);
    if (rule === 'bedrock' || block.identifier === AIR || liquidOf(block.identifier) !== null) return bedrock;
    return javaLiquidReactionOf(content, block) ?? bedrock;
};
