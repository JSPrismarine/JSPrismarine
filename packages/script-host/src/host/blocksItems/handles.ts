/**
 * Building the values the block and item members hand back that the binding does not parse from
 * JSON: arrays of objects the host made.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';

/**
 * Builds a script array of objects, which the caller returns.
 * @param items - The objects, each made for the array, which this frees once the array holds it.
 */
export const objectArray = (host: PackHost, items: readonly ScriptHandle[]): ScriptHandle => {
    const array = host.engine.evaluate('[]');
    if (!(array instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
    items.forEach((item, index) => {
        host.engine.set(array, String(index), item);
        host.engine.free(item);
    });
    return host.engine.release(array);
};

/** Builds a script array of objects the host keeps, such as the one object of a type, which the caller returns. */
export const keptArray = (host: PackHost, items: readonly ScriptHandle[]): ScriptHandle => {
    const array = host.engine.evaluate('[]');
    if (!(array instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
    items.forEach((item, index) => host.engine.set(array, String(index), item));
    return host.engine.release(array);
};
