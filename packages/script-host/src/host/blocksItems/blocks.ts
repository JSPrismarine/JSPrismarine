/**
 * The `@minecraft/server` members of `Block` and `BlockPermutation` beyond the ones
 * `serverBlocks.ts` registers: the neighbors, the type's facts (tags, localization key, item,
 * liquid answers), matching, `withState`, light, waterlogging and the block's components.
 *
 * A type's facts come from the world's catalog; a permutation's liquid answers are its type's,
 * unless the catalog lists the permutation as one that answers differently. The edge cases follow
 * the `block-members` scenario recorded on the pinned Bedrock Dedicated Server.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { isRecord } from '../../isRecord';
import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';
import { blockAt, blockObjectAt } from '../serverBlocks';
import type { BlockKey } from '../serverObjects';
import { objectArray } from './handles';
import {
    blockKeyOf,
    itemState,
    permutationOf,
    plainError,
    SERVER,
    TAG,
    vectorArgument,
    withNamespace
} from '../serverObjects';
import type { ScriptBlockPermutation, ScriptBlockTypeInfo, ScriptStateValue, ScriptWaterAnswers } from '../world';

/** The liquid answers of a type a world's catalog does not describe: no water goes in, and water stops at it. */
const SOLID_WATER: ScriptWaterAnswers = { contain: false, blocking: true, destroyed: false, spawns: false };

/** Whether a permutation holds every state a partial set names, with the same value. */
const holds = (
    states: Readonly<Record<string, ScriptStateValue>>,
    wanted: Readonly<Record<string, ScriptStateValue>>
): boolean => Object.entries(wanted).every(([name, value]) => states[name] === value);

/** The water answers of a permutation of a type. */
export const waterOf = (
    info: ScriptBlockTypeInfo | undefined,
    permutation: ScriptBlockPermutation
): ScriptWaterAnswers => {
    if (info === undefined) return SOLID_WATER;
    return info.waterPermutations.find((each) => holds(permutation.states, each.states))?.water ?? info.water;
};

/** Reads a `Record` of states a script passed, which the engine copies as JSON. */
const statesArgument = (call: ScriptCall, index: number): Record<string, ScriptStateValue> | undefined => {
    const value = call.args[index];
    if (value === undefined || value === null) return undefined;
    const json = call.stringify(value);
    // The engine wrote the string with JSON.stringify.
    const parsed: unknown = json === undefined ? undefined : JSON.parse(json);
    const states: Record<string, ScriptStateValue> = {};
    if (isRecord(parsed)) {
        for (const [name, each] of Object.entries(parsed)) {
            if (typeof each === 'string' || typeof each === 'number' || typeof each === 'boolean') states[name] = each;
        }
    }
    return states;
};

/** The six neighbors a block reaches by name, and the step to each. */
const NEIGHBORS = [
    ['above', { x: 0, y: 1, z: 0 }],
    ['below', { x: 0, y: -1, z: 0 }],
    ['north', { x: 0, y: 0, z: -1 }],
    ['south', { x: 0, y: 0, z: 1 }],
    ['east', { x: 1, y: 0, z: 0 }],
    ['west', { x: -1, y: 0, z: 0 }]
] as const;

/**
 * Registers the block and permutation members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementBlockMembers = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    const info = (typeId: string): ScriptBlockTypeInfo | undefined => world.catalog?.blockType(typeId);
    const read = (call: ScriptCall): { readonly key: BlockKey; readonly permutation: ScriptBlockPermutation } => {
        const key = blockKeyOf(call.state);
        return { key, permutation: blockAt(world, key) };
    };
    const ofBlock = (call: ScriptCall) => read(call).permutation;
    /**
     * Whether a block of a type could be placed where a block is: into air or a liquid, and only
     * when it is solid or stands on a solid block. It is the rule the `block-members` and
     * `block-world-components` scenarios' nine placements fit; BDS also asks the block's own
     * placement rules, which JSPrismarine does not have for scripts yet.
     */
    const placeable = (key: BlockKey, here: ScriptBlockPermutation, typeId: string): boolean => {
        const current = info(here.typeId);
        const replaceable = current?.air ?? here.typeId === 'minecraft:air';
        if (!replaceable && !(current?.liquid ?? false)) return false;
        if (info(typeId)?.solid === true) return true;
        const below = world.block(key.dimension, { x: key.x, y: key.y - 1, z: key.z });
        return below !== undefined && info(below.typeId)?.solid === true;
    };
    const ofPermutation = (call: ScriptCall) => permutationOf(call.state);
    /** An item stack of the item a permutation gives, or undefined for one that gives none. */
    const itemStackOf = (
        permutation: ScriptBlockPermutation,
        amount: unknown
    ): ReturnType<PackHost['create']> | undefined => {
        const item = info(permutation.typeId)?.item;
        if (item === null || item === undefined) return undefined;
        const count = typeof amount === 'number' ? Math.trunc(amount) : 1;
        return host.engine.release(host.create('ItemStack', TAG.itemStack, itemState({ typeId: item, amount: count })));
    };
    const matches = (permutation: ScriptBlockPermutation, call: ScriptCall): boolean => {
        if (permutation.typeId !== withNamespace(String(call.args[0]))) return false;
        const states = statesArgument(call, 1);
        return states === undefined || holds(permutation.states, states);
    };
    /** The members both `Block` and `BlockPermutation` have, over the permutation each reads. */
    const shared = (
        owner: 'Block' | 'BlockPermutation',
        permutationOfCall: (call: ScriptCall) => ScriptBlockPermutation
    ) => {
        const water = (call: ScriptCall) => {
            const permutation = permutationOfCall(call);
            return waterOf(info(permutation.typeId), permutation);
        };
        implementations
            .implement(SERVER, owner, 'localizationKey', {
                get: (call) => info(permutationOfCall(call).typeId)?.localizationKey ?? ''
            })
            .implement(SERVER, owner, 'getTags', (call) =>
                JSON.stringify(info(permutationOfCall(call).typeId)?.tags ?? [])
            )
            .implement(SERVER, owner, 'hasTag', (call) =>
                (info(permutationOfCall(call).typeId)?.tags ?? []).includes(String(call.args[0]))
            )
            .implement(SERVER, owner, 'canContainLiquid', (call) => water(call).contain)
            .implement(SERVER, owner, 'isLiquidBlocking', (call) => water(call).blocking)
            .implement(SERVER, owner, 'canBeDestroyedByLiquidSpread', (call) => water(call).destroyed)
            .implement(SERVER, owner, 'liquidSpreadCausesSpawn', (call) => water(call).spawns)
            .implement(SERVER, owner, 'matches', (call) => matches(permutationOfCall(call), call));
    };
    shared('Block', ofBlock);
    shared('BlockPermutation', ofPermutation);

    for (const [member, step] of NEIGHBORS) {
        implementations.implement(SERVER, 'Block', member, (call) => {
            const { key } = read(call);
            const [steps] = call.args;
            const count = typeof steps === 'number' ? Math.trunc(steps) : 1;
            return blockObjectAt(host, key.dimension, {
                x: key.x + step.x * count,
                y: key.y + step.y * count,
                z: key.z + step.z * count
            });
        });
    }

    implementations
        .implement(SERVER, 'Block', 'offset', (call) => {
            const { key } = read(call);
            const offset = vectorArgument(call, 0);
            return blockObjectAt(host, key.dimension, {
                x: key.x + offset.x,
                y: key.y + offset.y,
                z: key.z + offset.z
            });
        })
        .implement(SERVER, 'Block', 'center', (call) => {
            const { x, y, z } = blockKeyOf(call.state);
            return JSON.stringify({ x: x + 0.5, y: y + 0.5, z: z + 0.5 });
        })
        .implement(SERVER, 'Block', 'bottomCenter', (call) => {
            const { x, y, z } = blockKeyOf(call.state);
            return JSON.stringify({ x: x + 0.5, y, z: z + 0.5 });
        })
        .implement(SERVER, 'Block', 'isValid', {
            get: (call) => {
                const key = blockKeyOf(call.state);
                return world.block(key.dimension, key) !== undefined;
            }
        })
        .implement(SERVER, 'Block', 'type', {
            get: (call) => host.engine.release(host.create('BlockType', TAG.blockType, ofBlock(call).typeId))
        })
        .implement(SERVER, 'Block', 'isAir', {
            get: (call) => {
                const { typeId } = ofBlock(call);
                return info(typeId)?.air ?? typeId === 'minecraft:air';
            }
        })
        .implement(SERVER, 'Block', 'isLiquid', { get: (call) => info(ofBlock(call).typeId)?.liquid ?? false })
        .implement(SERVER, 'Block', 'getItemStack', (call) => itemStackOf(ofBlock(call), call.args[0]))
        .implement(SERVER, 'BlockPermutation', 'getItemStack', (call) => itemStackOf(ofPermutation(call), call.args[0]))
        .implement(SERVER, 'BlockPermutation', 'withState', (call) => {
            const permutation = ofPermutation(call);
            const name = String(call.args[0]);
            const [, value] = call.args;
            const failed = () => plainError(`Failed to set property '${name}' on block '${permutation.typeId}'.`);
            const current = permutation.states[name];
            if (current === undefined) throw failed();
            if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
                throw new ScriptHostErrors.ArgumentConversionFailed({
                    index: 1,
                    expected: 'boolean | number | string'
                });
            }
            const resolved = world.resolveBlock(permutation.typeId, { ...permutation.states, [name]: value });
            let next = resolved?.states[name] === value ? resolved : undefined;
            // A value a text state does not take, or one of another type, gives the state its
            // default, while a number an integer state does not take fails, as the scenario recorded.
            if (next === undefined && (typeof current === 'string' || typeof value !== typeof current)) {
                const { [name]: _dropped, ...others } = permutation.states;
                next = world.resolveBlock(permutation.typeId, others);
            }
            if (next === undefined) throw failed();
            return host.engine.release(host.create('BlockPermutation', TAG.permutation, JSON.stringify(next)));
        })
        .implement(SERVER, 'Block', 'getLightLevel', (call) => {
            const { key } = read(call);
            const light = world.blockLight?.(key.dimension, key);
            return light === undefined ? 0 : Math.max(light.block, light.sky);
        })
        .implement(SERVER, 'Block', 'getSkyLightLevel', (call) => {
            const { key } = read(call);
            return world.blockLight?.(key.dimension, key)?.sky ?? 0;
        })
        .implement(SERVER, 'Block', 'isWaterlogged', {
            get: (call) => {
                const { key } = read(call);
                return world.waterlogged?.(key.dimension, key) ?? false;
            }
        })
        // Only water flows on BDS: `LiquidType` has no other member.
        .implement(SERVER, 'Block', 'liquidCanFlowFromDirection', (call) => {
            const { permutation } = read(call);
            // A `Direction` is its name, such as `Up`; the catalog names the side `up`.
            const face = String(call.args[1]).toLowerCase();
            // The table names every state the Script API reports, the legacy ones too, such as a
            // slab's `top_slot_bit`, and a bit state as a boolean; a permutation here holds only the
            // states a server keeps, and a bit state as 0 or 1.
            const stopping = info(permutation.typeId)?.liquidFlowStops?.find((each) =>
                Object.entries(each.states).every(([name, value]) => {
                    if (!(name in permutation.states)) return true;
                    const held = permutation.states[name];
                    return held === value || (typeof value === 'boolean' && held === (value ? 1 : 0));
                })
            );
            return !(stopping?.stops ?? []).some((each) => each === face);
        })
        .implement(SERVER, 'Block', 'setWaterlogged', (call) => {
            const { key, permutation } = read(call);
            const waterlogged = call.args[0] === true;
            if (waterlogged && !waterOf(info(permutation.typeId), permutation).contain) {
                throw plainError('Block type cannot be waterlogged.');
            }
            world.setWaterlogged?.(key.dimension, key, waterlogged);
            return undefined;
        })
        // BDS sets the permutation only where it could be placed, as `canPlace` answers.
        .implement(SERVER, 'Block', 'trySetPermutation', (call) => {
            const { key, permutation } = read(call);
            const next = permutationOf(call.stateOf(call.args[0] ?? null));
            if (!placeable(key, permutation, next.typeId)) return false;
            world.setBlock(key.dimension, key, next);
            return world.block(key.dimension, key)?.typeId === next.typeId;
        })
        .implement(SERVER, 'Block', 'canPlace', (call) => {
            const { key, permutation } = read(call);
            const [given] = call.args;
            const state = call.stateOf(given ?? null);
            const typeId =
                given instanceof ScriptHandle
                    ? state.startsWith('{')
                        ? permutationOf(state).typeId
                        : state
                    : withNamespace(String(given));
            return placeable(key, permutation, typeId);
        })
        .implement(SERVER, 'Block', 'isSolid', { get: (call) => info(ofBlock(call).typeId)?.solid ?? true })
        .implement(SERVER, 'Block', 'getMapColor', (call) =>
            JSON.stringify(info(ofBlock(call).typeId)?.mapColor ?? { red: 0, green: 0, blue: 0, alpha: 0 })
        )
        .implement(SERVER, 'Block', 'getParts', (call) => {
            const { key, permutation } = read(call);
            // A door's halves and a bed's ends are the blocks BDS counts as parts of one.
            const partner =
                permutation.states.upper_block_bit === true
                    ? { ...key, y: key.y - 1 }
                    : permutation.states.upper_block_bit === false
                      ? { ...key, y: key.y + 1 }
                      : undefined;
            if (partner === undefined) return undefined;
            const other = world.block(key.dimension, partner);
            if (other?.typeId !== permutation.typeId) return undefined;
            const [lower, upper] = partner.y < key.y ? [partner, key] : [key, partner];
            return objectArray(
                host,
                [lower, upper].map((each) => host.create('Block', TAG.block, JSON.stringify(each)))
            );
        })
        .implement(SERVER, 'Block', 'getRedstonePower', (call) => {
            const { key } = read(call);
            return world.redstonePower?.(key.dimension, key);
        });
};
