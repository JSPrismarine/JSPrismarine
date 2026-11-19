/**
 * The members of the block custom component events the world raises for an entity, redstone
 * and state changes: `onStepOn`, `onEntityFallOn`, `onEntity`, `onRedstoneUpdate` and
 * `onBlockStateChange`. Each object carries the hook's event as its state, as the other component
 * events of `serverCustom.ts` do.
 */
import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import type { ScriptValue } from '../../values';
import type { PackHost } from '../minecraftServer';
import { hookEventOf } from '../serverCustom';
import { SERVER } from '../serverObjects';
import type { ScriptBlockHookEvent } from '../world';
import { scriptValueOf } from './eventValues';

/** The hook's event, when it is one of `hook`'s. */
const eventOf = <Hook extends ScriptBlockHookEvent['hook']>(
    call: ScriptCall,
    hook: Hook
): Extract<ScriptBlockHookEvent, { hook: Hook }> | undefined => {
    const event = hookEventOf(call.state);
    // Narrowed by its hook, which the compiler cannot carry through the generic Extract.
    return event.hook === hook ? (event as Extract<ScriptBlockHookEvent, { hook: Hook }>) : undefined;
};

/** Registers the members of the block component events for entities, redstone and state changes. */
export const implementComponentEvents = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const entity = (ref: { readonly id: string; readonly typeId: string } | undefined): ScriptValue =>
        ref === undefined ? undefined : host.entity(ref);
    implementations
        .implement(SERVER, 'BlockComponentStepOnEvent', 'entity', {
            get: (call) => entity(eventOf(call, 'onStepOn')?.entity)
        })
        .implement(SERVER, 'BlockComponentEntityFallOnEvent', 'entity', {
            get: (call) => entity(eventOf(call, 'onEntityFallOn')?.entity)
        })
        .implement(SERVER, 'BlockComponentEntityFallOnEvent', 'fallDistance', {
            get: (call) => eventOf(call, 'onEntityFallOn')?.fallDistance
        })
        .implement(SERVER, 'BlockComponentEntityEvent', 'entitySource', {
            get: (call) => entity(eventOf(call, 'onEntity')?.entitySource)
        })
        .implement(SERVER, 'BlockComponentEntityEvent', 'name', { get: (call) => eventOf(call, 'onEntity')?.name })
        .implement(SERVER, 'BlockComponentEntityEvent', 'blockPermutation', {
            get: (call) => {
                const permutation = eventOf(call, 'onEntity')?.blockPermutation;
                return permutation === undefined ? undefined : scriptValueOf(host, { permutation });
            }
        })
        .implement(SERVER, 'BlockComponentRedstoneUpdateEvent', 'powerLevel', {
            get: (call) => eventOf(call, 'onRedstoneUpdate')?.powerLevel
        })
        .implement(SERVER, 'BlockComponentRedstoneUpdateEvent', 'previousPowerLevel', {
            get: (call) => eventOf(call, 'onRedstoneUpdate')?.previousPowerLevel
        })
        .implement(SERVER, 'BlockComponentRedstoneUpdateEvent', 'firstUpdate', {
            get: (call) => eventOf(call, 'onRedstoneUpdate')?.firstUpdate
        })
        .implement(SERVER, 'BlockComponentBlockStateChangeEvent', 'previousPermutation', {
            get: (call) => {
                const permutation = eventOf(call, 'onBlockStateChange')?.previousPermutation;
                return permutation === undefined ? undefined : scriptValueOf(host, { permutation });
            }
        });
};
