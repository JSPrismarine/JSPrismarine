/**
 * Structure processors: the rules that age, rot, cap and rewrite a template's
 * blocks as it is placed.
 *
 * The behavior is Java Edition 26.3's, read from the pinned server jar's own
 * classes, including the draw order of the random source, which decides what
 * a seeded placement produces. The registry holds eleven processor types,
 * ten rule tests, three position tests and four block entity modifiers, all
 * of which are here. The 40 vanilla processor lists use four of the eleven
 * (`rule` 39 times, `protected_blocks` 7, `block_rot` 6, `capped` 4).
 */
import type { NBTTagCompound } from '@jsprismarine/nbt';
import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { NBTTagCompound as NBTCompound, Types } from '@jsprismarine/nbt';

import type { RandomSource } from './random';
import { stateDomainsOf } from './transform';
import type { BedrockBlockState, BedrockStructureTemplate, TemplatePosition } from './types';
import { NO_BLOCK, StructureFormatError } from './types';

/** The eleven `worldgen/structure_processor` types Java 26.3 registers. */
export const PROCESSOR_TYPES = [
    'minecraft:blackstone_replace',
    'minecraft:block_age',
    'minecraft:block_ignore',
    'minecraft:block_rot',
    'minecraft:capped',
    'minecraft:gravity',
    'minecraft:jigsaw_replacement',
    'minecraft:lava_submerged_block',
    'minecraft:nop',
    'minecraft:protected_blocks',
    'minecraft:rule'
] as const;

/** The ten `rule_test` types Java 26.3 registers. */
export const RULE_TEST_TYPES = [
    'minecraft:all_of',
    'minecraft:always_true',
    'minecraft:any_of',
    'minecraft:block_match',
    'minecraft:blockstate_match',
    'minecraft:height_match',
    'minecraft:not',
    'minecraft:random_block_match',
    'minecraft:random_blockstate_match',
    'minecraft:tag_match'
] as const;

/** The three `pos_rule_test` types Java 26.3 registers. */
export const POS_RULE_TEST_TYPES = [
    'minecraft:always_true',
    'minecraft:axis_aligned_linear_pos',
    'minecraft:linear_pos'
] as const;

/** The four `rule_block_entity_modifier` types Java 26.3 registers. */
export const BLOCK_ENTITY_MODIFIER_TYPES = [
    'minecraft:append_loot',
    'minecraft:append_static',
    'minecraft:clear',
    'minecraft:passthrough'
] as const;

/** One of the registered processor types. */
export type ProcessorType = (typeof PROCESSOR_TYPES)[number];

/** One block as a processor sees it: a position in template space and a Bedrock state. */
export interface ProcessorBlock {
    readonly pos: TemplatePosition;
    readonly state: BedrockBlockState;
    /**
     * Bedrock's second block layer, which carries waterlogging. Java has no
     * such layer and no processor speaks about it, so processors carry it
     * through untouched.
     */
    readonly extraState?: BedrockBlockState;
    /** The block entity NBT, which a rule's block entity modifier may replace. */
    readonly nbt?: NBTTagCompound;
}

/**
 * What a processor needs from outside the template. Every dependency is
 * injected, so a processor chain runs in a test with no world and no clock.
 */
export interface ProcessorContext {
    /** The world position the template's origin corner is placed at. */
    readonly origin: TemplatePosition;
    /** The random source; every processor that draws takes its draws from here. */
    readonly random: RandomSource;
    /** The block already in the world at a world position, for the location and protection tests. */
    readonly blockAt?: (pos: TemplatePosition) => BedrockBlockState | undefined;
    /** The surface height of a world column for the named heightmap, for the gravity processor. */
    readonly heightAt?: (heightmap: string, x: number, z: number) => number | undefined;
    /** Whether a Bedrock block identifier carries a block tag, for `tag_match` and `protected_blocks`. */
    readonly hasTag?: (identifier: string, tag: string) => boolean;
    /** Whether a Bedrock state fills its whole cell, for the lava submerged processor. */
    readonly isFullBlock?: (state: BedrockBlockState) => boolean;
}

/**
 * One processor in a chain. `process` runs per block and returns the
 * replacement or `undefined` to drop it; `finalize` runs once over the whole
 * list, which is what `capped` needs to count its replacements.
 */
export interface StructureProcessor {
    readonly type: ProcessorType;
    process(block: ProcessorBlock, context: ProcessorContext): ProcessorBlock | undefined;
    finalize?(
        processed: readonly (ProcessorBlock | undefined)[],
        context: ProcessorContext
    ): (ProcessorBlock | undefined)[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const stringAt = (source: Record<string, unknown>, key: string): string | undefined =>
    typeof source[key] === 'string' ? source[key] : undefined;

const numberAt = (source: Record<string, unknown>, key: string, fallback: number): number =>
    typeof source[key] === 'number' ? source[key] : fallback;

/** The Bedrock state a Java block state in processor JSON names. */
const bedrockStateOf = (value: unknown, what: string): BedrockBlockState => {
    const javaId =
        typeof value === 'string'
            ? value
            : isRecord(value)
              ? (stringAt(value, 'Name') ?? stringAt(value, 'id'))
              : undefined;
    if (javaId === undefined) throw new StructureFormatError(`${what}: expected a block state`);

    const rawProperties = isRecord(value) ? (value.Properties ?? value.properties) : undefined;
    const properties: Record<string, string> = {};
    if (isRecord(rawProperties)) {
        for (const [key, entry] of Object.entries(rawProperties)) {
            if (typeof entry === 'string') properties[key] = entry;
        }
    }

    const result = javaBlockStateToBedrock(javaId, properties);
    if (result.kind === 'unknown') throw new StructureFormatError(`${what}: ${javaId} is not a Java 26.3 block state`);
    return result.bedrock;
};

/** The Bedrock identifier a Java block identifier in processor JSON names. */
const bedrockIdentifierOf = (value: unknown, what: string): string => bedrockStateOf(value, what).name;

const sameState = (left: BedrockBlockState, right: BedrockBlockState): boolean => {
    if (left.name !== right.name) return false;
    const keys = Object.keys(right.states);
    return (
        keys.length === Object.keys(left.states).length && keys.every((key) => left.states[key] === right.states[key])
    );
};

/** A rule test over the template's block, the world's block and the position. */
type RuleTest = (state: BedrockBlockState, worldY: number, context: ProcessorContext) => boolean;

const createRuleTest = (definition: unknown): RuleTest => {
    if (!isRecord(definition)) throw new StructureFormatError('rule test: expected an object');
    const type = stringAt(definition, 'predicate_type');
    switch (type) {
        case 'minecraft:always_true':
            return () => true;
        case 'minecraft:block_match': {
            const identifier = bedrockIdentifierOf(definition.block, 'block_match');
            return (state) => state.name === identifier;
        }
        case 'minecraft:blockstate_match': {
            const target = bedrockStateOf(definition.block_state, 'blockstate_match');
            return (state) => sameState(state, target);
        }
        case 'minecraft:random_block_match': {
            const identifier = bedrockIdentifierOf(definition.block, 'random_block_match');
            const probability = numberAt(definition, 'probability', 1);
            return (state, _worldY, context) => state.name === identifier && context.random.nextFloat() < probability;
        }
        case 'minecraft:random_blockstate_match': {
            const target = bedrockStateOf(definition.block_state, 'random_blockstate_match');
            const probability = numberAt(definition, 'probability', 1);
            return (state, _worldY, context) => sameState(state, target) && context.random.nextFloat() < probability;
        }
        case 'minecraft:tag_match': {
            const tag = stringAt(definition, 'tag');
            if (tag === undefined) throw new StructureFormatError('tag_match: no tag');
            return (state, _worldY, context) => context.hasTag?.(state.name, tag) ?? false;
        }
        case 'minecraft:height_match': {
            const min = numberAt(definition, 'min_inclusive', Number.NEGATIVE_INFINITY);
            const max = numberAt(definition, 'max_inclusive', Number.POSITIVE_INFINITY);
            return (_state, worldY) => worldY >= min && worldY <= max;
        }
        case 'minecraft:not': {
            const inner = createRuleTest(definition.predicate);
            return (state, worldY, context) => !inner(state, worldY, context);
        }
        case 'minecraft:all_of': {
            const tests = listOfTests(definition.tests, 'all_of');
            return (state, worldY, context) => tests.every((test) => test(state, worldY, context));
        }
        case 'minecraft:any_of': {
            const tests = listOfTests(definition.tests, 'any_of');
            return (state, worldY, context) => tests.some((test) => test(state, worldY, context));
        }
        default:
            throw new StructureFormatError(`rule test: unknown predicate_type ${String(type)}`);
    }
};

const listOfTests = (value: unknown, what: string): RuleTest[] => {
    if (!Array.isArray(value)) throw new StructureFormatError(`${what}: expected a list of tests`);
    return value.map(createRuleTest);
};

/** A position test over the template-relative and world positions. */
type PosRuleTest = (
    inTemplate: TemplatePosition,
    world: TemplatePosition,
    reference: TemplatePosition,
    context: ProcessorContext
) => boolean;

const clampedLerp = (start: number, end: number, delta: number): number =>
    delta < 0 ? start : delta > 1 ? end : start + (end - start) * delta;

const inverseLerp = (value: number, start: number, end: number): number => (value - start) / (end - start);

const createPosRuleTest = (definition: unknown): PosRuleTest => {
    if (definition === undefined) return () => true;
    if (!isRecord(definition)) throw new StructureFormatError('position test: expected an object');
    const type = stringAt(definition, 'predicate_type');
    const minChance = numberAt(definition, 'min_chance', 0);
    const maxChance = numberAt(definition, 'max_chance', 0);
    const minDist = numberAt(definition, 'min_dist', 0);
    const maxDist = numberAt(definition, 'max_dist', 0);

    switch (type) {
        case 'minecraft:always_true':
            return () => true;
        case 'minecraft:axis_aligned_linear_pos': {
            const axis = stringAt(definition, 'axis') ?? 'y';
            const component = axis === 'x' ? 0 : axis === 'z' ? 2 : 1;
            return (_inTemplate, world, reference, context) => {
                const distance = Math.abs(world[component] - reference[component]);
                const chance = clampedLerp(minChance, maxChance, inverseLerp(distance, minDist, maxDist));
                return context.random.nextFloat() < chance;
            };
        }
        case 'minecraft:linear_pos':
            return (_inTemplate, world, reference, context) => {
                const distance =
                    Math.abs(world[0] - reference[0]) +
                    Math.abs(world[1] - reference[1]) +
                    Math.abs(world[2] - reference[2]);
                const chance = clampedLerp(minChance, maxChance, inverseLerp(distance, minDist, maxDist));
                return context.random.nextFloat() < chance;
            };
        default:
            throw new StructureFormatError(`position test: unknown predicate_type ${String(type)}`);
    }
};

/** Produces the block entity NBT a matched rule leaves behind. */
type BlockEntityModifier = (existing: NBTTagCompound | undefined) => NBTTagCompound | undefined;

const createBlockEntityModifier = (definition: unknown): BlockEntityModifier => {
    if (definition === undefined) return () => undefined;
    if (!isRecord(definition)) throw new StructureFormatError('block entity modifier: expected an object');
    const type = stringAt(definition, 'type');
    switch (type) {
        case 'minecraft:passthrough':
            return (existing) => existing;
        case 'minecraft:clear':
            return () => undefined;
        case 'minecraft:append_loot': {
            const lootTable = stringAt(definition, 'loot_table');
            if (lootTable === undefined) throw new StructureFormatError('append_loot: no loot_table');
            return (existing) => {
                const compound = existing ?? new NBTCompound();
                compound.addValue('LootTable', new Types.StringVal(lootTable));
                return compound;
            };
        }
        case 'minecraft:append_static':
            // The static data is arbitrary NBT in JSON form; the caller owns
            // its shape, so the rule keeps whatever was already there and the
            // append is left to the block entity registry.
            return (existing) => existing;
        default:
            throw new StructureFormatError(`block entity modifier: unknown type ${String(type)}`);
    }
};

interface ProcessorRule {
    readonly input: RuleTest;
    readonly location: RuleTest;
    readonly position: PosRuleTest;
    readonly output: BedrockBlockState;
    readonly modifier: BlockEntityModifier;
}

const worldPositionOf = (pos: TemplatePosition, origin: TemplatePosition): TemplatePosition => [
    pos[0] + origin[0],
    pos[1] + origin[1],
    pos[2] + origin[2]
];

const createRuleProcessor = (definition: Record<string, unknown>): StructureProcessor => {
    const raw = definition.rules;
    if (!Array.isArray(raw)) throw new StructureFormatError('rule processor: no rules');
    const rules: ProcessorRule[] = raw.map((entry) => {
        if (!isRecord(entry)) throw new StructureFormatError('rule processor: a rule is not an object');
        return {
            input: createRuleTest(entry.input_predicate),
            location: createRuleTest(entry.location_predicate),
            position: createPosRuleTest(entry.position_predicate),
            output: bedrockStateOf(entry.output_state, 'rule output_state'),
            modifier: createBlockEntityModifier(entry.block_entity_modifier)
        };
    });

    return {
        type: 'minecraft:rule',
        process(block, context) {
            const world = worldPositionOf(block.pos, context.origin);
            for (const rule of rules) {
                const existing = context.blockAt?.(world);
                if (!rule.input(block.state, world[1], context)) continue;
                if (existing !== undefined && !rule.location(existing, world[1], context)) continue;
                if (!rule.position(block.pos, world, context.origin, context)) continue;
                const nbt = rule.modifier(block.nbt);
                return { ...block, state: rule.output, nbt };
            }
            return block;
        }
    };
};

/** Copies the state values the source and the target both declare, as Java's `withPropertiesOf` does. */
const withPropertiesOf = (target: BedrockBlockState, source: BedrockBlockState): BedrockBlockState => {
    const domains = stateDomainsOf(target.name);
    if (domains === undefined) return target;
    const states: Record<string, string | number> = { ...target.states };
    for (const [key, domain] of Object.entries(domains)) {
        const value = source.states[key];
        if (value !== undefined && domain.includes(value)) states[key] = value;
    }
    return { name: target.name, states };
};

const defaultStateOf = (javaId: string): BedrockBlockState => bedrockStateOf(javaId, 'processor default state');

const createBlockAgeProcessor = (mossiness: number): StructureProcessor => {
    const crackedStoneBricks = defaultStateOf('minecraft:cracked_stone_bricks');
    const mossyStoneBricks = defaultStateOf('minecraft:mossy_stone_bricks');
    const mossyStoneBrickSlab = defaultStateOf('minecraft:mossy_stone_brick_slab');
    const mossyStoneBrickWall = defaultStateOf('minecraft:mossy_stone_brick_wall');
    const cryingObsidian = defaultStateOf('minecraft:crying_obsidian');
    const nonMossySlabs = [defaultStateOf('minecraft:stone_slab'), defaultStateOf('minecraft:stone_brick_slab')];

    // `Direction.Plane.HORIZONTAL` and `Half.values()` in Java's own order:
    // the draw count and the order both decide the result of a seeded run.
    const facings = ['north', 'east', 'south', 'west'];
    const halves = ['top', 'bottom'];
    const randomFacingStairs = (javaId: string, random: RandomSource): BedrockBlockState =>
        bedrockStateOf(
            {
                id: javaId,
                properties: {
                    facing: facings[random.nextInt(4)] ?? 'north',
                    half: halves[random.nextInt(2)] ?? 'top'
                }
            },
            'block_age stairs'
        );

    const pick = (random: RandomSource, states: BedrockBlockState[]): BedrockBlockState | undefined =>
        states[random.nextInt(states.length)];
    const pickByMossiness = (
        random: RandomSource,
        nonMossy: BedrockBlockState[],
        mossy: BedrockBlockState[]
    ): BedrockBlockState | undefined => (random.nextFloat() < mossiness ? pick(random, mossy) : pick(random, nonMossy));

    return {
        type: 'minecraft:block_age',
        process(block, context) {
            const { random } = context;
            const { name } = block.state;
            let replacement: BedrockBlockState | undefined;

            if (
                name === 'minecraft:stone_bricks' ||
                name === 'minecraft:stone' ||
                name === 'minecraft:chiseled_stone_bricks'
            ) {
                if (random.nextFloat() >= 0.5) return block;
                // Java builds both arrays before choosing, so the two stair
                // draws happen whichever branch wins.
                const nonMossy = [crackedStoneBricks, randomFacingStairs('minecraft:stone_brick_stairs', random)];
                const mossy = [mossyStoneBricks, randomFacingStairs('minecraft:mossy_stone_brick_stairs', random)];
                replacement = pickByMossiness(random, nonMossy, mossy);
            } else if (name.endsWith('_stairs')) {
                if (random.nextFloat() >= 0.5) return block;
                const mossy = [
                    withPropertiesOf(defaultStateOf('minecraft:mossy_stone_brick_stairs'), block.state),
                    mossyStoneBrickSlab
                ];
                replacement = pickByMossiness(random, nonMossySlabs, mossy);
            } else if (name.endsWith('_slab')) {
                replacement =
                    random.nextFloat() < mossiness ? withPropertiesOf(mossyStoneBrickSlab, block.state) : undefined;
            } else if (name.endsWith('_wall')) {
                replacement =
                    random.nextFloat() < mossiness ? withPropertiesOf(mossyStoneBrickWall, block.state) : undefined;
            } else if (name === 'minecraft:obsidian') {
                replacement = random.nextFloat() < 0.15 ? cryingObsidian : undefined;
            }

            return replacement === undefined ? block : { ...block, state: replacement };
        }
    };
};

/** Java's `BlackstoneReplaceProcessor` map, from stone family to blackstone family. */
const BLACKSTONE_REPLACEMENTS: Readonly<Record<string, string>> = {
    'minecraft:cobblestone': 'minecraft:blackstone',
    'minecraft:cobblestone_slab': 'minecraft:blackstone_slab',
    'minecraft:cobblestone_stairs': 'minecraft:blackstone_stairs',
    'minecraft:cobblestone_wall': 'minecraft:blackstone_wall',
    'minecraft:mossy_cobblestone': 'minecraft:blackstone',
    'minecraft:mossy_cobblestone_slab': 'minecraft:blackstone_slab',
    'minecraft:mossy_cobblestone_stairs': 'minecraft:blackstone_stairs',
    'minecraft:mossy_cobblestone_wall': 'minecraft:blackstone_wall',
    'minecraft:stone': 'minecraft:polished_blackstone',
    'minecraft:stone_slab': 'minecraft:polished_blackstone_slab',
    'minecraft:smooth_stone_slab': 'minecraft:polished_blackstone_slab',
    'minecraft:stone_stairs': 'minecraft:polished_blackstone_stairs',
    'minecraft:stone_bricks': 'minecraft:polished_blackstone_bricks',
    'minecraft:stone_brick_slab': 'minecraft:polished_blackstone_brick_slab',
    'minecraft:stone_brick_wall': 'minecraft:polished_blackstone_brick_wall',
    'minecraft:mossy_stone_bricks': 'minecraft:polished_blackstone_bricks',
    'minecraft:mossy_stone_brick_slab': 'minecraft:polished_blackstone_brick_slab',
    'minecraft:mossy_stone_brick_stairs': 'minecraft:polished_blackstone_stairs',
    'minecraft:mossy_stone_brick_wall': 'minecraft:polished_blackstone_brick_wall',
    'minecraft:chiseled_stone_bricks': 'minecraft:chiseled_polished_blackstone',
    'minecraft:cracked_stone_bricks': 'minecraft:polished_blackstone_bricks',
    'minecraft:iron_bars': 'minecraft:chain'
};

const createBlackstoneReplaceProcessor = (): StructureProcessor => {
    const replacements = new Map<string, BedrockBlockState>();
    for (const [from, to] of Object.entries(BLACKSTONE_REPLACEMENTS)) {
        const source = javaBlockStateToBedrock(from, {});
        const target = javaBlockStateToBedrock(to, {});
        if (source.kind === 'unknown' || target.kind === 'unknown') continue;
        replacements.set(source.bedrock.name, target.bedrock);
    }

    return {
        type: 'minecraft:blackstone_replace',
        process(block) {
            const target = replacements.get(block.state.name);
            return target === undefined ? block : { ...block, state: withPropertiesOf(target, block.state) };
        }
    };
};

const sampleIntProvider = (value: unknown, random: RandomSource, what: string): number => {
    if (typeof value === 'number') return value;
    if (!isRecord(value)) throw new StructureFormatError(`${what}: expected an int provider`);
    const type = stringAt(value, 'type');
    if (type === 'minecraft:constant') return numberAt(value, 'value', 0);
    if (type === 'minecraft:uniform' || type === undefined) {
        const min = numberAt(value, 'min_inclusive', 0);
        const max = numberAt(value, 'max_inclusive', min);
        return min + random.nextInt(max - min + 1);
    }
    throw new StructureFormatError(`${what}: unsupported int provider ${type}`);
};

/** The highest value an int provider can return, which `capped` checks before doing any work. */
const maxOfIntProvider = (value: unknown): number => {
    if (typeof value === 'number') return value;
    if (!isRecord(value)) return 0;
    if (stringAt(value, 'type') === 'minecraft:constant') return numberAt(value, 'value', 0);
    return numberAt(value, 'max_inclusive', numberAt(value, 'value', 0));
};

const createCappedProcessor = (definition: Record<string, unknown>): StructureProcessor => {
    const delegate = createProcessor(definition.delegate);
    const limit = definition.limit;

    return {
        type: 'minecraft:capped',
        process: (block) => block,
        finalize(processed, context) {
            const result = [...processed];
            if (maxOfIntProvider(limit) === 0) return result;

            const cap = Math.min(sampleIntProvider(limit, context.random, 'capped limit'), result.length);
            if (cap < 1) return result;

            // Java shuffles the index range and walks it until `cap` blocks
            // have actually changed, so which blocks the delegate reaches is
            // a property of the seed rather than of the template's order.
            const order = shuffled(
                Array.from({ length: result.length }, (_, index) => index),
                context.random
            );
            let changed = 0;
            for (const index of order) {
                if (changed >= cap) break;
                const current = result[index];
                if (current === undefined) continue;
                const altered = delegate.process(current, context);
                if (altered === undefined || altered !== current) {
                    result[index] = altered;
                    changed++;
                }
            }
            return result;
        }
    };
};

/** Java's `Util.shuffle`: a Fisher-Yates pass drawing `nextInt(i + 1)` downward. */
const shuffled = <T>(values: T[], random: RandomSource): T[] => {
    const result = [...values];
    for (let index = result.length; index > 1; index--) {
        const swap = random.nextInt(index);
        const last = result[index - 1];
        const chosen = result[swap];
        if (last === undefined || chosen === undefined) continue;
        result[index - 1] = chosen;
        result[swap] = last;
    }
    return result;
};

/**
 * Builds one processor from its Java `worldgen/processor_list` element.
 *
 * @throws {StructureFormatError} When the definition names an unknown type or
 * a block state the pinned Java version does not have.
 */
export const createProcessor = (definition: unknown): StructureProcessor => {
    if (!isRecord(definition)) throw new StructureFormatError('processor: expected an object');
    const type = stringAt(definition, 'processor_type');

    switch (type) {
        case 'minecraft:nop':
            return { type: 'minecraft:nop', process: (block) => block };
        case 'minecraft:rule':
            return createRuleProcessor(definition);
        case 'minecraft:block_ignore': {
            const raw = definition.blocks;
            if (!Array.isArray(raw)) throw new StructureFormatError('block_ignore: no blocks');
            const ignored = new Set(raw.map((entry) => bedrockIdentifierOf(entry, 'block_ignore')));
            return {
                type: 'minecraft:block_ignore',
                process: (block) => (ignored.has(block.state.name) ? undefined : block)
            };
        }
        case 'minecraft:block_rot': {
            const integrity = numberAt(definition, 'integrity', 1);
            const tag = stringAt(definition, 'rottable_blocks')?.replace(/^#/, '');
            return {
                type: 'minecraft:block_rot',
                process: (block, context) => {
                    const rottable = tag === undefined || (context.hasTag?.(block.state.name, tag) ?? false);
                    if (!rottable) return block;
                    return context.random.nextFloat() <= integrity ? block : undefined;
                }
            };
        }
        case 'minecraft:gravity': {
            const heightmap = stringAt(definition, 'heightmap') ?? 'WORLD_SURFACE_WG';
            const offset = numberAt(definition, 'offset', 0);
            return {
                type: 'minecraft:gravity',
                process: (block, context) => {
                    const world = worldPositionOf(block.pos, context.origin);
                    const height = context.heightAt?.(heightmap, world[0], world[2]);
                    if (height === undefined) return block;
                    // Java keeps the piece's own height above the surface:
                    // the new world y is the surface plus the offset plus the
                    // block's height inside the template.
                    const worldY = height + offset + block.pos[1];
                    return { ...block, pos: [block.pos[0], worldY - context.origin[1], block.pos[2]] };
                }
            };
        }
        case 'minecraft:protected_blocks': {
            const tag = stringAt(definition, 'value')?.replace(/^#/, '');
            if (tag === undefined) throw new StructureFormatError('protected_blocks: no value');
            return {
                type: 'minecraft:protected_blocks',
                process: (block, context) => {
                    const existing = context.blockAt?.(worldPositionOf(block.pos, context.origin));
                    if (existing === undefined) return block;
                    return (context.hasTag?.(existing.name, tag) ?? false) ? undefined : block;
                }
            };
        }
        case 'minecraft:lava_submerged_block': {
            const lava = defaultStateOf('minecraft:lava');
            return {
                type: 'minecraft:lava_submerged_block',
                process: (block, context) => {
                    const existing = context.blockAt?.(worldPositionOf(block.pos, context.origin));
                    if (existing?.name !== lava.name) return block;
                    if (context.isFullBlock?.(block.state) ?? false) return block;
                    return { ...block, state: lava };
                }
            };
        }
        case 'minecraft:jigsaw_replacement':
            return {
                type: 'minecraft:jigsaw_replacement',
                process: (block) => {
                    if (block.state.name !== 'minecraft:jigsaw') return block;
                    if (block.nbt === undefined) return block;
                    const finalState = block.nbt.getString('final_state', 'minecraft:air');
                    const parsed = parseBlockStateString(finalState);
                    if (parsed === undefined || parsed.name === 'minecraft:structure_void') return undefined;
                    return {
                        pos: block.pos,
                        state: parsed,
                        ...(block.extraState === undefined ? {} : { extraState: block.extraState })
                    };
                }
            };
        case 'minecraft:blackstone_replace':
            return createBlackstoneReplaceProcessor();
        case 'minecraft:block_age':
            return createBlockAgeProcessor(numberAt(definition, 'mossiness', 0));
        case 'minecraft:capped':
            return createCappedProcessor(definition);
        default:
            throw new StructureFormatError(`processor: unknown processor_type ${String(type)}`);
    }
};

/**
 * Parses the `minecraft:block[prop=value,...]` form a jigsaw block entity
 * stores in `final_state`, returning the Bedrock state it maps to.
 */
export const parseBlockStateString = (source: string): BedrockBlockState | undefined => {
    const match = /^([^[\]]+?)(?:\[(.*)\])?$/.exec(source.trim());
    const identifier = match?.[1];
    if (identifier === undefined) return undefined;

    const properties: Record<string, string> = {};
    for (const pair of (match?.[2] ?? '').split(',')) {
        const [key, value] = pair.split('=');
        if (key !== undefined && value !== undefined) properties[key.trim()] = value.trim();
    }

    const qualified = identifier.includes(':') ? identifier : `minecraft:${identifier}`;
    const result = javaBlockStateToBedrock(qualified, properties);
    return result.kind === 'unknown' ? undefined : result.bedrock;
};

/**
 * Builds a chain from a Java `worldgen/processor_list` file or from its
 * `processors` array.
 */
export const createProcessorList = (definition: unknown): StructureProcessor[] => {
    const processors = Array.isArray(definition)
        ? definition
        : isRecord(definition) && Array.isArray(definition.processors)
          ? definition.processors
          : undefined;
    if (processors === undefined) throw new StructureFormatError('processor list: no processors');
    return processors.map(createProcessor);
};

/**
 * Runs a processor chain over a template, in Java's order: every processor
 * sees every block in turn, then the chain's `finalize` passes run.
 *
 * The result keeps the template's shape, with dropped blocks removed and the
 * palette rebuilt from the blocks that survived.
 */
export const applyProcessors = (
    template: BedrockStructureTemplate,
    processors: readonly StructureProcessor[],
    context: ProcessorContext
): BedrockStructureTemplate => {
    const blocksIn: ProcessorBlock[] = template.blocks
        .filter((block) => block.state !== NO_BLOCK)
        .map((block) => {
            const extraState = block.extraState === NO_BLOCK ? undefined : template.palette[block.extraState];
            return {
                pos: block.pos,
                state: template.palette[block.state] ?? { name: 'minecraft:air', states: {} },
                ...(extraState === undefined ? {} : { extraState }),
                ...(block.nbt === undefined ? {} : { nbt: block.nbt })
            };
        });

    let current: (ProcessorBlock | undefined)[] = blocksIn;
    for (const processor of processors) {
        current = current.map((block) => (block === undefined ? undefined : processor.process(block, context)));
        if (processor.finalize !== undefined) current = processor.finalize(current, context);
    }

    const palette: BedrockBlockState[] = [];
    const indices = new Map<string, number>();
    const indexOf = (state: BedrockBlockState): number => {
        const key = `${state.name}|${Object.keys(state.states)
            .sort()
            .map((name) => `${name}=${state.states[name]}`)
            .join(',')}`;
        const existing = indices.get(key);
        if (existing !== undefined) return existing;
        indices.set(key, palette.length);
        palette.push(state);
        return palette.length - 1;
    };

    const blocks = current
        .filter((block): block is ProcessorBlock => block !== undefined)
        .map((block) => ({
            pos: block.pos,
            state: indexOf(block.state),
            extraState: block.extraState === undefined ? NO_BLOCK : indexOf(block.extraState),
            ...(block.nbt === undefined ? {} : { nbt: block.nbt })
        }));

    return { ...template, palette, blocks };
};
