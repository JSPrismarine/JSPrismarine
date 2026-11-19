/**
 * How an item component reaches the stack it belongs to: the host links the component object to
 * its `ItemStack` object by a property a script does not see in its keys, so a component reads
 * the stack as it is now and writes it back.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import type { ScriptCall } from '../../shape/implementations';
import { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';
import { itemOf } from '../serverObjects';
import type { ScriptItem } from '../world';

/** The property that links an item component to its stack. */
const LINK_KEY = '__jspItemStack';

const LINK_SOURCE = `(component, stack) => Object.defineProperty(component, '${LINK_KEY}', { value: stack })`;

/**
 * Makes a component object of a stack, linked to the stack object the call was made on. The
 * caller releases it to return it, or frees it.
 */
export const linkedComponent = (
    host: PackHost,
    call: ScriptCall,
    className: string,
    tag: number,
    state = ''
): ScriptHandle => {
    const component = host.create(className, tag, state);
    const link = call.engine.evaluate(LINK_SOURCE, '<jsp item component>');
    if (link instanceof ScriptHandle) {
        call.engine.call(link, undefined, component, call.self ?? null);
        call.engine.free(link);
    }
    return component;
};

/** Runs `use` with the stack object a component belongs to, and what the stack holds now. */
export const withLinkedStack = <Result>(
    call: ScriptCall,
    use: (stack: ScriptHandle, item: ScriptItem) => Result
): Result => {
    const stack = call.self instanceof ScriptHandle ? call.engine.get(call.self, LINK_KEY) : undefined;
    if (!(stack instanceof ScriptHandle)) throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'item component' });
    try {
        return use(stack, itemOf(call.stateOf(stack)));
    } finally {
        call.engine.free(stack);
    }
};
