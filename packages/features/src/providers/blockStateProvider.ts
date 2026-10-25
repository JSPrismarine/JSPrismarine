import type { Noise, RandomSource } from '@jsprismarine/worldgen';
import { clampedMap, LegacyRandomSource, NormalNoise, parseNoiseParameters } from '@jsprismarine/worldgen';

import { asArray, asInteger, asNumber, asObject, asString, fail } from '../json';
import type { Weighted } from '../placement/WorldgenRandom';
import { randomElement, randomWeighted } from '../placement/WorldgenRandom';
import { normalizeIdentifier, typeNameOf } from '../registry';
import type { BlockState, Direction } from '../world/BlockState';
import { ALL_DIRECTIONS, blockState, withProperty } from '../world/BlockState';
import type { BlockPos, FeatureWorld } from '../world/FeatureWorld';
import { offset } from '../world/FeatureWorld';
import type { BlockPredicate } from './blockPredicate';
import { parseBlockPredicate } from './blockPredicate';
import type { IntProvider } from './valueProviders';
import { parseIntProvider, parseWeightedList } from './valueProviders';

const f32 = Math.fround;

/**
 * Chooses the block a feature places at a position, Java's `BlockStateProvider`.
 *
 * Features are built almost entirely out of these: a tree's trunk, its leaves, an ore's two
 * targets, a patch's plant and a vegetation patch's ground are all providers rather than fixed
 * states, which is why one `tree` implementation covers 45 configured trees.
 */
export interface BlockStateProvider {
    /** The provider's registry name. */
    readonly type: BlockStateProviderTypeName;
    /** Chooses a state, falling back to the block already at the position when it cannot. */
    getState(world: FeatureWorld, random: RandomSource, position: BlockPos): BlockState;
    /** Chooses a state, returning `undefined` rather than falling back. */
    getOptionalState(world: FeatureWorld, random: RandomSource, position: BlockPos): BlockState | undefined;
}

/** The ten types Java 26.3 registers in `worldgen/block_state_provider_type`. */
export type BlockStateProviderTypeName =
    | 'simple'
    | 'weighted'
    | 'noise'
    | 'dual_noise'
    | 'noise_threshold'
    | 'randomized_int'
    | 'rotated'
    | 'rule_based'
    | 'random_block'
    | 'copy_properties';

const provider = (
    type: BlockStateProviderTypeName,
    pick: (world: FeatureWorld, random: RandomSource, position: BlockPos) => BlockState | undefined
): BlockStateProvider => ({
    type,
    getOptionalState: pick,
    getState: (world, random, position) => pick(world, random, position) ?? world.getBlock(position)
});

/** Always the same state. */
export const simpleProvider = (state: BlockState): BlockStateProvider => provider('simple', () => state);

/** Draws one of several states by weight. Costs one draw. */
export const weightedProvider = (entries: readonly Weighted<BlockState>[]): BlockStateProvider => {
    if (entries.length === 0) throw new RangeError('A weighted state provider needs at least one entry');
    return provider('weighted', (_world, random) => randomWeighted(entries, random));
};

/**
 * Indexes a state list by a normal noise sampled at the position. Costs no draws.
 *
 * It is positional rather than random, which is what makes a noise-picked flower field look like
 * patches instead of static.
 */
export const noiseProvider = (noise: Noise, scale: number, states: readonly BlockState[]): BlockStateProvider => {
    if (states.length === 0) throw new RangeError('A noise state provider needs at least one state');
    return provider('noise', (_world, _random, position) => stateFromNoise(states, sampleAt(noise, position, scale)));
};

const sampleAt = (noise: Noise, position: BlockPos, scale: number): number =>
    noise.get3(position.x * scale, position.y * scale, position.z * scale);

const stateFromNoise = (states: readonly BlockState[], value: number): BlockState => {
    const placement = Math.min(Math.max(f32(f32(1 + value) / 2), 0), 0.9999);
    const picked = states[Math.trunc(placement * states.length)];
    if (picked === undefined) throw new RangeError('Noise state index fell outside the state list');
    return picked;
};

/**
 * Picks a varying subset of the states with a slow noise, then indexes that subset with the fast
 * one. Costs no draws.
 *
 * Java samples the slow noise once per candidate at a position shifted by a large constant, which
 * is why the subset is stable across a region rather than per block.
 */
export const dualNoiseProvider = (
    slowNoise: Noise,
    slowScale: number,
    varietyMin: number,
    varietyMax: number,
    noise: Noise,
    scale: number,
    states: readonly BlockState[]
): BlockStateProvider =>
    provider('dual_noise', (_world, _random, position) => {
        const varietyNoise = sampleAt(slowNoise, position, slowScale);
        const localVariety = Math.trunc(clampedMap(varietyNoise, -1, 1, varietyMin, varietyMax + 1));
        const candidates: BlockState[] = [];
        for (let index = 0; index < localVariety; index++) {
            const shifted = offset(position, index * 54545, 0, index * 34234);
            candidates.push(stateFromNoise(states, sampleAt(slowNoise, shifted, slowScale)));
        }
        return stateFromNoise(candidates, sampleAt(noise, position, scale));
    });

/** Splits on a noise threshold, then draws uniformly from one side. Costs up to two draws. */
export const noiseThresholdProvider = (
    noise: Noise,
    scale: number,
    threshold: number,
    highChance: number,
    defaultState: BlockState,
    lowStates: readonly BlockState[],
    highStates: readonly BlockState[]
): BlockStateProvider =>
    provider('noise_threshold', (_world, random, position) => {
        if (sampleAt(noise, position, scale) < threshold) return randomElement(lowStates, random);
        return random.nextFloat() < highChance ? randomElement(highStates, random) : defaultState;
    });

/**
 * Draws a source state, then randomizes one integer property on it.
 *
 * Java looks the property up in the block's real state definition. This package has no block
 * registry, so it sets the property when the source state declares it and leaves the state alone
 * when it does not, which is the same answer for every provider in the vanilla data because each
 * one spells the property out in its source state.
 */
export const randomizedIntProvider = (
    source: BlockStateProvider,
    property: string,
    values: IntProvider
): BlockStateProvider =>
    provider('randomized_int', (world, random, position) => {
        const state = source.getState(world, random, position);
        if (!(property in state.properties)) return state;
        return withProperty(state, property, String(values.sample(random)));
    });

/**
 * Draws a source state and turns it to face a direction, randomly when none is given.
 *
 * `trySetValue` in Java sets a property only when the block has it. Here that is the same test
 * against the state's declared properties.
 */
export const rotatedProvider = (source: BlockStateProvider, direction?: Direction): BlockStateProvider =>
    provider('rotated', (world, random, position) => {
        const chosen = direction ?? randomElement(ALL_DIRECTIONS, random);
        let state = source.getState(world, random, position);
        state = trySet(state, 'axis', axisOf(chosen));
        state = trySet(state, 'facing', chosen);
        if (chosen !== 'up' && chosen !== 'down') state = trySet(state, 'horizontal_facing', chosen);
        return state;
    });

const axisOf = (direction: Direction): string => {
    if (direction === 'up' || direction === 'down') return 'y';
    return direction === 'north' || direction === 'south' ? 'z' : 'x';
};

const trySet = (state: BlockState, key: string, value: string): BlockState =>
    key in state.properties ? withProperty(state, key, value) : state;

/** Takes the first rule whose predicate holds, falling back when none does. */
export const ruleBasedProvider = (
    rules: readonly { readonly ifTrue: BlockPredicate; readonly then: BlockStateProvider }[],
    fallback?: BlockStateProvider
): BlockStateProvider =>
    provider('rule_based', (world, random, position) => {
        for (const rule of rules) {
            if (!rule.ifTrue(world, position)) continue;
            const state = rule.then.getOptionalState(world, random, position);
            if (state !== undefined) return state;
        }
        return fallback?.getOptionalState(world, random, position);
    });

/**
 * Draws one block uniformly from a set and uses its default state.
 *
 * The vanilla uses name a tag (`#minecraft:corals`), so this needs the oracle to enumerate it.
 * When the oracle cannot, the provider yields nothing and the caller keeps the existing block,
 * which is Java's behavior for an empty holder set.
 */
export const randomBlockProvider = (names: readonly string[], tag?: string): BlockStateProvider =>
    provider('random_block', (world, random) => {
        const members = tag === undefined ? names : (world.blocks.tagMembers?.(tag) ?? []);
        if (members.length === 0) return undefined;
        return blockState(randomElement(members, random));
    });

/** Draws a source state, then overwrites its properties with the ones the world block declares. */
export const copyPropertiesProvider = (source: BlockStateProvider): BlockStateProvider =>
    provider('copy_properties', (world, random, position) => {
        const state = source.getState(world, random, position);
        const existing = world.getBlock(position).properties;
        let result = state;
        for (const key of Object.keys(state.properties)) {
            const value = existing[key];
            if (value !== undefined) result = withProperty(result, key, value);
        }
        return result;
    });

/** Reads a `{"id": ..., "properties": {...}}` block state. */
export const parseBlockState = (source: unknown, path: string): BlockState => {
    const raw = asObject(source, path);
    const name = normalizeIdentifier(raw['id'] ?? raw['Name'], `${path}.id`);
    const properties = raw['properties'] ?? raw['Properties'];
    if (properties === undefined) return blockState(name);
    const values = asObject(properties, `${path}.properties`);
    const parsed: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
        parsed[key] = typeof value === 'string' ? value : asString(value, `${path}.properties.${key}`);
    }
    return blockState(name, parsed);
};

const parseStateList = (source: unknown, path: string): BlockState[] =>
    asArray(source, path).map((entry, index) => parseBlockState(entry, `${path}[${index}]`));

const buildNoise = (raw: Record<string, unknown>, path: string): { noise: Noise; scale: number } => {
    const seed = BigInt(asInteger(raw['seed'], `${path}.seed`));
    const parameters = new NormalNoise(parseNoiseParameters(raw['noise']));
    return { noise: parameters.create(new LegacyRandomSource(seed)), scale: asNumber(raw['scale'], `${path}.scale`) };
};

/**
 * Reads a `worldgen/block_state_provider_type` document.
 *
 * A bare `{"id": ...}` object is a `simple` provider, which is how most of the data spells a
 * fixed block.
 */
export const parseBlockStateProvider = (source: unknown, path: string): BlockStateProvider => {
    const raw = asObject(source, path);
    if (!('type' in raw)) return simpleProvider(parseBlockState(raw, path));

    const type = typeNameOf(raw['type'], path);
    switch (type) {
        case 'simple':
            return simpleProvider(parseBlockState(raw['state'], `${path}.state`));

        case 'weighted':
            return weightedProvider(
                parseWeightedList(raw['entries'], `${path}.entries`, (value, entryPath) =>
                    parseBlockState(value, entryPath)
                )
            );

        case 'noise': {
            const { noise, scale } = buildNoise(raw, path);
            return noiseProvider(noise, scale, parseStateList(raw['states'], `${path}.states`));
        }

        case 'dual_noise': {
            const { noise, scale } = buildNoise(raw, path);
            const variety = asObject(raw['variety'], `${path}.variety`);
            const slowParameters = new NormalNoise(parseNoiseParameters(raw['slow_noise']));
            const slowNoise = slowParameters.create(
                new LegacyRandomSource(BigInt(asInteger(raw['seed'], `${path}.seed`)))
            );
            return dualNoiseProvider(
                slowNoise,
                asNumber(raw['slow_scale'], `${path}.slow_scale`),
                asInteger(variety['min_inclusive'], `${path}.variety.min_inclusive`),
                asInteger(variety['max_inclusive'], `${path}.variety.max_inclusive`),
                noise,
                scale,
                parseStateList(raw['states'], `${path}.states`)
            );
        }

        case 'noise_threshold': {
            const { noise, scale } = buildNoise(raw, path);
            return noiseThresholdProvider(
                noise,
                scale,
                asNumber(raw['threshold'], `${path}.threshold`),
                asNumber(raw['high_chance'], `${path}.high_chance`),
                parseBlockState(raw['default_state'], `${path}.default_state`),
                parseStateList(raw['low_states'], `${path}.low_states`),
                parseStateList(raw['high_states'], `${path}.high_states`)
            );
        }

        case 'randomized_int':
            return randomizedIntProvider(
                parseBlockStateProvider(raw['source'], `${path}.source`),
                asString(raw['property'], `${path}.property`),
                parseIntProvider(raw['values'], `${path}.values`)
            );

        case 'rotated': {
            const direction = raw['direction'];
            return rotatedProvider(
                parseBlockStateProvider(raw['state'], `${path}.state`),
                direction === undefined ? undefined : parseDirectionValue(direction, `${path}.direction`)
            );
        }

        case 'rule_based': {
            const rules = asArray(raw['rules'], `${path}.rules`).map((entry, index) => {
                const rulePath = `${path}.rules[${index}]`;
                const rule = asObject(entry, rulePath);
                return {
                    ifTrue: parseBlockPredicate(rule['if_true'], `${rulePath}.if_true`),
                    then: parseBlockStateProvider(rule['then'], `${rulePath}.then`)
                };
            });
            const fallback = raw['fallback'];
            return ruleBasedProvider(
                rules,
                fallback === undefined ? undefined : parseBlockStateProvider(fallback, `${path}.fallback`)
            );
        }

        case 'random_block': {
            const blocks = raw['blocks'];
            if (typeof blocks === 'string' && blocks.startsWith('#')) {
                return randomBlockProvider([], normalizeIdentifier(blocks.slice(1), `${path}.blocks`));
            }
            if (typeof blocks === 'string') return randomBlockProvider([normalizeIdentifier(blocks, `${path}.blocks`)]);
            return randomBlockProvider(
                asArray(blocks, `${path}.blocks`).map((entry, index) =>
                    normalizeIdentifier(entry, `${path}.blocks[${index}]`)
                )
            );
        }

        case 'copy_properties':
            return copyPropertiesProvider(parseBlockStateProvider(raw['source'], `${path}.source`));

        default:
            return fail(path, `unknown block state provider type ${JSON.stringify(type)}`);
    }
};

const parseDirectionValue = (value: unknown, path: string): Direction => {
    if (typeof value === 'string' && (ALL_DIRECTIONS as readonly string[]).includes(value)) {
        // The membership test narrows the string to the Direction union.
        return value as Direction;
    }
    return fail(path, `expected a direction, got ${JSON.stringify(value)}`);
};
