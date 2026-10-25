import type { FlatTable, FlattenException, } from '@jsprismarine/content';
import { flatten } from '@jsprismarine/content';

import {
    blockProperties,
    destructibleByExplosion,
    destructibleByMining,
    friction as frictionComponent,
    lightDampening,
    lightEmission
} from './components';
import type { BlockResolveResult, BlockState } from './types';

/**
 * The blast resistance stored for `"minecraft:destructible_by_explosion": false`.
 *
 * Bedrock's grammar has no number for "no explosion breaks this", and Java
 * gives bedrock itself 3600000, so the table stores that rather than an
 * infinity a `Float32Array` cannot hold.
 */
export const EXPLOSION_PROOF_RESISTANCE = 3_600_000;

/** The hardness stored for a block no mining breaks, matching Java's own `-1`. */
export const UNBREAKABLE_HARDNESS = -1;

/**
 * The columns the flattened table holds.
 *
 * `friction` prefers `jsprismarine:block_properties` over
 * `minecraft:friction`, because Mojang's component caps at 0.9 and Java's
 * blue ice is 0.989. `randomTick` has no Bedrock component at all, since
 * `minecraft:random_ticking` is internal and `Blocks.json` forbids it at the
 * top level, so it comes from the overlay's own component or from a behavior
 * that implements `onRandomTick`.
 */
const COLUMNS = {
    solid: {
        kind: 'u8',
        read: (state: BlockState) => (state.content.flags.solid ? 1 : 0)
    },
    lightEmission: {
        kind: 'u8',
        read: (state: BlockState) => state.content.params(lightEmission),
        default: 0
    },
    lightFilter: {
        kind: 'u8',
        read: (state: BlockState) => state.content.params(lightDampening),
        default: 15
    },
    blastResistance: {
        kind: 'f32',
        read: (state: BlockState) => {
            const resistance = state.content.params(destructibleByExplosion);
            if (resistance === undefined) return undefined;
            if (typeof resistance !== 'boolean') return resistance.explosionResistance;
            return resistance ? 0 : EXPLOSION_PROOF_RESISTANCE;
        },
        default: 0
    },
    hardness: {
        kind: 'f32',
        read: (state: BlockState) => {
            const mining = state.content.params(destructibleByMining);
            if (mining === undefined) return undefined;
            if (typeof mining !== 'boolean') return mining.secondsToDestroy;
            return mining ? 0 : UNBREAKABLE_HARDNESS;
        },
        default: 0
    },
    friction: {
        kind: 'f32',
        read: (state: BlockState) =>
            state.content.params(blockProperties)?.friction ?? state.content.params(frictionComponent),
        default: 0.6
    },
    randomTick: {
        kind: 'u8',
        read: (state: BlockState) =>
            state.content.params(blockProperties)?.randomTick === true || state.content.flags.randomTicking ? 1 : 0
    }
} as const;

/** The flattened per-state table: one typed array per column, indexed by runtime id. */
export type BlockTable = FlatTable<typeof COLUMNS>;

/**
 * Precomputes the properties the tick loop, the lighting engine and the
 * explosion code read, as one typed array per column indexed by the dense
 * runtime id.
 *
 * This is Dragonfly's `Finalize` idea as `@jsprismarine/content`'s `flatten`
 * implements it: the hot path reads an array slot instead of asking a type.
 *
 * @param exceptions - Reviewed rows for an id a column has no value for and
 *   no default covers. An exception that matches nothing fails the build.
 * @throws {FlattenError} On a value the column kind cannot hold, an id with
 *   neither a value nor an exception, or an unused exception.
 */
export const flattenBlockStates = (
    resolved: BlockResolveResult,
    exceptions: readonly FlattenException[] = []
): BlockTable =>
    flatten(resolved.states, {
        id: (state) => state.runtimeId,
        length: resolved.palette.stateCount,
        columns: COLUMNS,
        exceptions
    });
