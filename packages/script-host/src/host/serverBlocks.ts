/**
 * The `@minecraft/server` members of blocks: `Dimension.getBlock`, `Block`, `BlockPermutation`
 * and `BlockType.id`.
 *
 * A block object carries its dimension and position ({@link BlockKey}) and reads the world each
 * time a member runs, so it always shows the block there now, as BDS's does. A permutation and a
 * block type are values: each carries its type and states. The errors and edge cases follow the
 * `blocks` scenario recorded on BDS.
 */
import type { ScriptApiImplementations, ScriptCall } from '../shape/implementations';
import { ScriptHandle } from '../values';
import type { PackHost } from './minecraftServer';
import type { BlockKey } from './serverObjects';
import {
    blockKeyOf,
    blockPosition,
    outsideWorld,
    permutationOf,
    plainError,
    SERVER,
    TAG,
    unloadedChunk,
    vectorArgument,
    withNamespace
} from './serverObjects';
import type { ScriptBlockPermutation } from './world';
import { isRecord } from '../isRecord';

/** A state value as `BlockPermutation.resolve` takes it. */
type StateValue = string | number | boolean;

/**
 * Registers the block members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementBlocks = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    const permutationObject = (permutation: ScriptBlockPermutation): ScriptHandle =>
        host.engine.release(host.create('BlockPermutation', TAG.permutation, JSON.stringify(permutation)));
    /** The block an object stands for, as the world holds it now. */
    const read = (call: ScriptCall): { readonly key: BlockKey; readonly permutation: ScriptBlockPermutation } => {
        const key = blockKeyOf(call.state);
        const permutation = world.block(key.dimension, key);
        if (permutation === undefined) throw unloadedChunk(key);
        return { key, permutation };
    };
    /** Completes a type's permutation, or throws BDS's error for a type it does not have. */
    const resolveType = (call: ScriptCall): ScriptBlockPermutation => {
        const [type] = call.args;
        const typeId = withNamespace(type instanceof ScriptHandle ? call.stateOf(type) : String(type));
        const resolved = world.resolveBlock(typeId, {});
        if (resolved === undefined) throw plainError(`Block type ${typeId} not found.`);
        return resolved;
    };

    implementations
        .implement(SERVER, 'Dimension', 'getBlock', (call) => {
            const location = blockPosition(vectorArgument(call, 0));
            const { min, max } = world.heightRange(call.state);
            // BDS answers the height just above the top with air, and refuses anything past it.
            if (location.y < min || location.y > max) throw outsideWorld(location);
            if (world.block(call.state, location) === undefined) return undefined;
            const key: BlockKey = { dimension: call.state, ...location };
            return host.engine.release(host.create('Block', TAG.block, JSON.stringify(key)));
        })
        .implement(SERVER, 'Block', 'typeId', { get: (call) => read(call).permutation.typeId })
        .implement(SERVER, 'Block', 'location', {
            get: (call) => {
                const { x, y, z } = blockKeyOf(call.state);
                return JSON.stringify({ x, y, z });
            }
        })
        .implement(SERVER, 'Block', 'x', { get: (call) => blockKeyOf(call.state).x })
        .implement(SERVER, 'Block', 'y', { get: (call) => blockKeyOf(call.state).y })
        .implement(SERVER, 'Block', 'z', { get: (call) => blockKeyOf(call.state).z })
        .implement(SERVER, 'Block', 'dimension', {
            get: (call) => host.instance('Dimension', TAG.dimension, blockKeyOf(call.state).dimension)
        })
        .implement(SERVER, 'Block', 'permutation', { get: (call) => permutationObject(read(call).permutation) })
        .implement(SERVER, 'Block', 'setType', (call) => {
            const { key } = read(call);
            world.setBlock(key.dimension, key, resolveType(call));
            return undefined;
        })
        .implement(SERVER, 'Block', 'setPermutation', (call) => {
            const { key } = read(call);
            world.setBlock(key.dimension, key, permutationOf(call.stateOf(call.args[0] ?? null)));
            return undefined;
        })
        .implement(SERVER, 'BlockPermutation', 'resolve', (call) => {
            const typeId = withNamespace(String(call.args[0]));
            const json = call.args[1] === undefined ? undefined : call.stringify(call.args[1]);
            // The engine wrote the string with JSON.stringify.
            const given: unknown = json === undefined ? {} : JSON.parse(json);
            const states: Record<string, StateValue> = {};
            if (isRecord(given)) {
                for (const [name, value] of Object.entries(given)) {
                    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                        states[name] = value;
                    }
                }
            }
            const resolved = world.resolveBlock(typeId, states);
            if (resolved !== undefined) return permutationObject(resolved);
            if (world.resolveBlock(typeId, {}) === undefined) throw plainError(`Failed to resolve block "${typeId}".`);
            // BDS ends this message with a line break.
            throw plainError(`Failed to resolve block "${typeId}" with properties: ${JSON.stringify(states)}\n`);
        })
        .implement(SERVER, 'BlockPermutation', 'type', {
            get: (call) =>
                host.engine.release(host.create('BlockType', TAG.blockType, permutationOf(call.state).typeId))
        })
        .implement(SERVER, 'BlockPermutation', 'getAllStates', (call) =>
            JSON.stringify(permutationOf(call.state).states)
        )
        .implement(
            SERVER,
            'BlockPermutation',
            'getState',
            (call) => permutationOf(call.state).states[String(call.args[0])]
        )
        .implement(SERVER, 'BlockType', 'id', { get: (call) => call.state });
};
