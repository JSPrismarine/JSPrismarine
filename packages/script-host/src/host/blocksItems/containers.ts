/**
 * The `@minecraft/server` members of `Container` beyond the ones `serverEntities.ts` registers,
 * and the members a `ContainerSlot` shares with an item stack.
 *
 * A container object names an entity's inventory or a block's container by its state, and each
 * member reads the slots as they are now. The orders and edge cases follow the `containers`
 * scenario recorded on the pinned Bedrock Dedicated Server: `moveItem` overwrites the slot it
 * moves to, and `transferItem` leaves what did not fit in the slot it came from.
 */
import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import type { PackHost } from '../minecraftServer';
import {
    containerSlots,
    invalidSlot,
    slotItemOf,
    slotKeyOf,
    slotPastEnd,
    writeContainerSlot,
    writeSlotOf
} from '../serverComponents';
import { placeItem } from '../serverEntities';
import { itemOf, itemState, plainError, SERVER, TAG } from '../serverObjects';
import {
    CONVERTS_VALUE,
    CONVERTS_VALUES,
    idList,
    propertiesByteCount,
    propertyValueOf,
    recordArgument,
    scriptValueOf,
    stackableItem
} from '../serverProperties';
import type { ScriptItem, ScriptPropertyValue } from '../world';
import { implementStackMembers, sameItems } from './items';

/**
 * Registers the container and slot members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementContainers = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    const info = (item: ScriptItem) => world.catalog?.itemType(item.typeId);
    /** The container's slots, or BDS's error for a container that is gone. */
    const slotsOf = (state: string, member: string, access: 'get' | 'call' = 'call') => {
        const found = containerSlots(world, state);
        if (found === undefined) {
            throw plainError(`Failed to ${access === 'get' ? 'get property' : 'call function'} '${member}'.`);
        }
        return found;
    };
    const slotArgument = (value: unknown, size: number): number => {
        const index = typeof value === 'number' ? Math.trunc(value) : -1;
        if (index >= size) throw slotPastEnd(index, size);
        return index;
    };
    const otherContainer = (call: ScriptCall, index: number): string => call.stateOf(call.args[index] ?? null);
    const stackArgument = (call: ScriptCall): ScriptItem => itemOf(call.stateOf(call.args[0] ?? null));
    /** The slots whose stack merges with the argument's, whatever its amount. */
    const matching = (call: ScriptCall, member: string): number[] => {
        const wanted = stackArgument(call);
        return slotsOf(call.state, member).flatMap((slot, index) =>
            slot !== null && sameItems(slot, wanted) ? [index] : []
        );
    };

    implementations
        .implement(SERVER, 'Container', 'weight', {
            get: (call) =>
                slotsOf(call.state, 'weight', 'get').reduce(
                    (total, slot) => total + (slot === null ? 0 : (info(slot)?.weight ?? 1) * slot.amount),
                    0
                )
        })
        // Only an item's own container, such as a bundle's, has rules; JSPrismarine has none of those yet.
        .implement(SERVER, 'Container', 'containerRules', {
            get: (call) => {
                slotsOf(call.state, 'containerRules', 'get');
                return undefined;
            }
        })
        .implement(SERVER, 'Container', 'firstItem', (call) => {
            const index = slotsOf(call.state, 'firstItem').findIndex((slot) => slot !== null);
            return index < 0 ? undefined : index;
        })
        .implement(SERVER, 'Container', 'firstEmptySlot', (call) => {
            const index = slotsOf(call.state, 'firstEmptySlot').findIndex((slot) => slot === null);
            return index < 0 ? undefined : index;
        })
        .implement(SERVER, 'Container', 'contains', (call) => {
            const wanted = stackArgument(call);
            const slots = slotsOf(call.state, 'contains');
            const held = matching(call, 'contains').reduce((total, index) => total + (slots[index]?.amount ?? 0), 0);
            return held >= wanted.amount;
        })
        .implement(SERVER, 'Container', 'find', (call) => matching(call, 'find')[0])
        .implement(SERVER, 'Container', 'findLast', (call) => matching(call, 'findLast').at(-1))
        .implement(SERVER, 'Container', 'clearAll', (call) => {
            slotsOf(call.state, 'clearAll').forEach((slot, index) => {
                if (slot !== null) writeContainerSlot(world, call.state, index, undefined);
            });
            return undefined;
        })
        .implement(SERVER, 'Container', 'moveItem', (call) => {
            const from = slotsOf(call.state, 'moveItem');
            const fromSlot = slotArgument(call.args[0], from.length);
            const target = otherContainer(call, 2);
            const to = slotsOf(target, 'moveItem');
            const toSlot = slotArgument(call.args[1], to.length);
            const item = from[fromSlot];
            if (item === null || item === undefined) return undefined;
            writeContainerSlot(world, call.state, fromSlot, undefined);
            writeContainerSlot(world, target, toSlot, item);
            return undefined;
        })
        .implement(SERVER, 'Container', 'swapItems', (call) => {
            const own = slotsOf(call.state, 'swapItems');
            const slot = slotArgument(call.args[0], own.length);
            const target = otherContainer(call, 2);
            const other = slotsOf(target, 'swapItems');
            const otherSlot = slotArgument(call.args[1], other.length);
            const mine = own[slot] ?? null;
            const theirs = other[otherSlot] ?? null;
            writeContainerSlot(world, call.state, slot, theirs ?? undefined);
            writeContainerSlot(world, target, otherSlot, mine ?? undefined);
            return undefined;
        })
        .implement(SERVER, 'Container', 'transferItem', (call) => {
            const from = slotsOf(call.state, 'transferItem');
            const fromSlot = slotArgument(call.args[0], from.length);
            const target = otherContainer(call, 1);
            const to = slotsOf(target, 'transferItem');
            const item = from[fromSlot];
            if (item === null || item === undefined) return undefined;
            const most = info(item)?.maxAmount ?? world.itemType(item.typeId)?.maxStackSize ?? item.amount;
            const { writes, left } = placeItem(to, item, Math.max(1, most));
            for (const [slot, written] of writes) writeContainerSlot(world, target, slot, written);
            // What did not fit stays where it was.
            const kept = left > 0 ? { ...item, amount: left } : undefined;
            writeContainerSlot(world, call.state, fromSlot, kept);
            return kept === undefined
                ? undefined
                : host.engine.release(host.create('ItemStack', TAG.itemStack, itemState(kept)));
        });

    /** The stack a slot holds, or BDS's error for an empty slot or one whose container is gone. */
    const held = (call: ScriptCall): ScriptItem => {
        const item = slotItemOf(world, slotKeyOf(call.state));
        if (item === undefined || item === null) throw invalidSlot();
        return item;
    };
    const write = (call: ScriptCall, item: ScriptItem): void => {
        writeSlotOf(world, slotKeyOf(call.state), item);
    };
    implementStackMembers(implementations, host, 'ContainerSlot', { read: held, write });

    /** The pack's dynamic properties on a slot's stack, which BDS keys by the pack's script module UUID. */
    const properties = (call: ScriptCall) => held(call).dynamicProperties?.get(host.moduleUuid);
    const writeProperties = (call: ScriptCall, values: ReadonlyMap<string, ScriptPropertyValue | undefined>): void => {
        const item = held(call);
        if ((info(item)?.maxAmount ?? world.itemType(item.typeId)?.maxStackSize ?? 1) > 1) throw stackableItem();
        const mine = new Map(item.dynamicProperties?.get(host.moduleUuid));
        for (const [id, value] of values) {
            if (value === undefined) mine.delete(id);
            else mine.set(id, value);
        }
        const all = new Map(item.dynamicProperties);
        if (mine.size === 0) all.delete(host.moduleUuid);
        else all.set(host.moduleUuid, mine);
        const { dynamicProperties: _previous, ...rest } = item;
        write(call, all.size === 0 ? rest : { ...rest, dynamicProperties: all });
    };
    implementations
        .implement(SERVER, 'ContainerSlot', 'getDynamicProperty', (call) =>
            scriptValueOf(call, properties(call)?.get(String(call.args[0])))
        )
        .implement(SERVER, 'ContainerSlot', 'getDynamicPropertyIds', (call) => idList(properties(call)))
        .implement(SERVER, 'ContainerSlot', 'getDynamicPropertyTotalByteCount', (call) =>
            propertiesByteCount(properties(call))
        )
        .implement(
            SERVER,
            'ContainerSlot',
            'setDynamicProperty',
            (call) => {
                const id = String(call.args[0]);
                writeProperties(call, new Map([[id, propertyValueOf(call, id, call.args[1])]]));
                return undefined;
            },
            CONVERTS_VALUE
        )
        .implement(
            SERVER,
            'ContainerSlot',
            'setDynamicProperties',
            (call) => {
                writeProperties(call, recordArgument(call));
                return undefined;
            },
            CONVERTS_VALUES
        )
        .implement(SERVER, 'ContainerSlot', 'clearDynamicProperties', (call) => {
            const ids = [...(properties(call)?.keys() ?? [])];
            if (ids.length > 0) writeProperties(call, new Map(ids.map((id) => [id, undefined])));
            return undefined;
        });
};
