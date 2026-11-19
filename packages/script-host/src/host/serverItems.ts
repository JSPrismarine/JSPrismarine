/**
 * The `@minecraft/server` members of `ItemStack` and its durability component.
 *
 * An item stack is a value a script owns, not part of the world: its object carries the stack as
 * a {@link ScriptItem} in its state, and a setter writes the state back. A container's `getItem`
 * makes a new stack, so changing one never changes the slot it came from, as the `entities`
 * scenario recorded. The world is asked only which item types exist and how many of each stack.
 */

import type { ScriptApiImplementations, ScriptCall } from '../shape/implementations';
import { ScriptHandle } from '../values';
import type { PackHost } from './minecraftServer';
import { withLinkedStack } from './blocksItems/itemLink';
import { itemOf, itemState, plainError, SERVER, withNamespace } from './serverObjects';
import type { ScriptItem } from './world';

/**
 * Registers the item stack members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementItems = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    const stackOf = (call: ScriptCall): ScriptItem => itemOf(call.state);
    const write = (call: ScriptCall, item: ScriptItem): void => call.setState(itemState(item));
    const maxDurability = (item: ScriptItem): number => world.itemType(item.typeId)?.maxDurability ?? 0;

    implementations
        .implement(SERVER, 'ItemStack', 'constructor', (call) => {
            const [type, amount] = call.args;
            const typeId = withNamespace(type instanceof ScriptHandle ? call.stateOf(type) : String(type));
            const known = world.itemType(typeId);
            if (known === undefined) throw plainError(`Invalid item identifier '${typeId}'.`);
            // The binding checked the amount against the metadata's bounds, which allow more than a stack.
            const item: ScriptItem = {
                typeId: known.typeId,
                amount: typeof amount === 'number' ? Math.trunc(amount) : 1
            };
            return itemState(item);
        })
        .implement(SERVER, 'ItemStack', 'typeId', { get: (call) => stackOf(call).typeId })
        .implement(SERVER, 'ItemStack', 'amount', {
            get: (call) => stackOf(call).amount,
            set: (call) => {
                const item = stackOf(call);
                const [amount] = call.args;
                const most = world.itemType(item.typeId)?.maxStackSize ?? Number.POSITIVE_INFINITY;
                // A stack set past its type's size holds a full stack, as on BDS.
                write(call, { ...item, amount: Math.min(typeof amount === 'number' ? Math.trunc(amount) : 1, most) });
            }
        })
        .implement(SERVER, 'ItemStack', 'nameTag', {
            get: (call) => stackOf(call).nameTag,
            set: (call) => {
                const { nameTag: _previous, ...item } = stackOf(call);
                const [nameTag] = call.args;
                write(call, typeof nameTag === 'string' ? { ...item, nameTag } : item);
            }
        })
        .implement(SERVER, 'ItemDurabilityComponent', 'maxDurability', {
            get: (call) => withLinkedStack(call, (_stack, item) => maxDurability(item))
        })
        .implement(SERVER, 'ItemDurabilityComponent', 'damage', {
            get: (call) => withLinkedStack(call, (_stack, item) => item.damage ?? 0),
            set: (call) =>
                withLinkedStack(call, (stack, item) => {
                    const [damage] = call.args;
                    const value = typeof damage === 'number' ? Math.trunc(damage) : 0;
                    if (value > maxDurability(item)) {
                        throw plainError(
                            `Invalid damage value '${value}' set on item '${item.typeId}'. ` +
                                'Damage values cannot be greater than maxDurability.'
                        );
                    }
                    const { damage: _previous, ...rest } = item;
                    call.setStateOf(stack, itemState(value > 0 ? { ...rest, damage: value } : rest));
                })
        })
        .implement(SERVER, 'ItemStack', 'getLore', (call) => JSON.stringify(stackOf(call).lore ?? []))
        .implement(SERVER, 'ItemStack', 'setLore', (call) => {
            const json = call.args[0] === undefined ? undefined : call.stringify(call.args[0]);
            // The engine wrote the string with JSON.stringify, and the binding checked it is a string array.
            const lore: unknown = json === undefined ? [] : JSON.parse(json);
            const lines = Array.isArray(lore) ? lore.filter((line) => typeof line === 'string') : [];
            const { lore: _previous, ...item } = stackOf(call);
            write(call, lines.length === 0 ? item : { ...item, lore: lines });
            return undefined;
        });
};
