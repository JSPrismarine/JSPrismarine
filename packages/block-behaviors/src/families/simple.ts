/**
 * The families whose blocks are a cube and little else: the plain block, the
 * engine blocks that do nothing, glass, pillars, ores and the Education
 * chemistry set.
 */
import { axisOfFace, facingFrom } from '../geometry';
import { defineFamily } from '../family';
import { bareName, hasState, setStates } from '../state';
import type { ItemDrop } from '../world';
import { dropAll, dropSelf } from './shared';

/**
 * What an ore drops when it is mined, and how much experience comes with it.
 *
 * Java puts these in loot tables, which arrive with the loot package. Until
 * then the twenty palette ores are listed with the item each one yields, so
 * breaking an ore produces the right item instead of nothing.
 */
export interface OreDrop {
    readonly identifier: string;
    readonly count: number;
    /** Experience orbs the break releases, which loot tables do not carry. */
    readonly experience: number;
}

const ore = (identifier: string, experience: number, count = 1): OreDrop => ({ identifier, count, experience });

/** The drop of each ore, keyed by the bare name of the ore block. */
export const ORE_DROPS: Readonly<Record<string, OreDrop>> = {
    coal_ore: ore('minecraft:coal', 1),
    deepslate_coal_ore: ore('minecraft:coal', 1),
    iron_ore: ore('minecraft:raw_iron', 0),
    deepslate_iron_ore: ore('minecraft:raw_iron', 0),
    copper_ore: ore('minecraft:raw_copper', 0, 3),
    deepslate_copper_ore: ore('minecraft:raw_copper', 0, 3),
    gold_ore: ore('minecraft:raw_gold', 0),
    deepslate_gold_ore: ore('minecraft:raw_gold', 0),
    nether_gold_ore: ore('minecraft:gold_nugget', 1, 3),
    quartz_ore: ore('minecraft:quartz', 2),
    redstone_ore: ore('minecraft:redstone', 0, 4),
    deepslate_redstone_ore: ore('minecraft:redstone', 0, 4),
    lit_redstone_ore: ore('minecraft:redstone', 0, 4),
    lit_deepslate_redstone_ore: ore('minecraft:redstone', 0, 4),
    lapis_ore: ore('minecraft:lapis_lazuli', 3, 4),
    deepslate_lapis_ore: ore('minecraft:lapis_lazuli', 3, 4),
    diamond_ore: ore('minecraft:diamond', 4),
    deepslate_diamond_ore: ore('minecraft:diamond', 4),
    emerald_ore: ore('minecraft:emerald', 4),
    deepslate_emerald_ore: ore('minecraft:emerald', 4)
};

/** A full cube with nothing to decide but what it drops. */
export const plainBlockFamily = defineFamily(
    'jsprismarine:plain_block',
    'A full cube that drops itself, unless its properties say a tool decides.',
    {
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);

/**
 * The blocks with no behavior at all: air, bedrock, the command blocks, the
 * deprecated palette entries and the engine markers.
 */
export const inertFamily = defineFamily(
    'jsprismarine:inert',
    'No hooks. The engine and editor blocks whose behavior is not a block behavior.',
    {}
);

/** Transparent cubes, which break into nothing without silk touch. */
export const glassFamily = defineFamily(
    'jsprismarine:glass',
    'Breaks into nothing, because the silk touch case needs the tool the hook does not carry.',
    {
        onBreak: () => {
            // Glass drops only to silk touch, and the event carries no tool,
            // so the family drops nothing and the tool check decides the rest.
        }
    }
);

/** Logs, stems and the other blocks placed along an axis. */
export const logFamily = defineFamily(
    'jsprismarine:log',
    'Takes pillar_axis from the placer and drops itself. The clicked face is not in the place event, so a vertical placement keeps the default axis.',
    {
        onPlace: (event, world) => {
            if (!hasState(event.block, 'pillar_axis')) return;
            if (event.placedBy === undefined) return;
            setStates(world, event.block, {
                pillar_axis: axisOfFace(facingFrom(event.placedBy.position, event.block.position))
            });
        },
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);

/** Ores, which drop an item and some experience rather than themselves. */
export const oreFamily = defineFamily(
    'jsprismarine:ore',
    'Drops the ore item and its experience; an unlisted ore drops itself.',
    {
        onBreak: (event, world, context) => {
            const drop = ORE_DROPS[bareName(event.brokenBlock.identifier)];
            if (drop === undefined) {
                dropSelf(world, context, event.brokenBlock);
                return;
            }

            const drops: ItemDrop[] = [{ identifier: drop.identifier, count: drop.count }];
            dropAll(world, event.brokenBlock, drops);
            if (drop.experience > 0) {
                world.spawnEntity(event.brokenBlock.position, 'minecraft:xp_orb', { value: drop.experience });
            }
        }
    }
);

/** The Education Edition chemistry blocks, which a vanilla server does not run. */
export const chemistryFamily = defineFamily(
    'jsprismarine:chemistry',
    'No hooks. The chemistry workbenches open Education Edition screens a vanilla server does not implement.',
    {}
);
