/** A global or a member that the pinned QuickJS defines and scripts on the pinned BDS cannot see. */
export interface AbsentGlobal {
    /**
     * A property path from the global object, such as `Set.prototype.union`. A last segment
     * written `[Symbol.toStringTag]` names a well-known symbol key.
     */
    readonly path: string;
}

/** An {@link AbsentGlobal}'s path, split into the object that holds the property and its key. */
export interface AbsentPath {
    /** The property names from the global object to the holder; empty for a global. */
    readonly owner: readonly string[];
    /** The property name, or the well-known symbol's name when {@link symbol} is true. */
    readonly key: string;
    /** Whether {@link key} names a well-known symbol, such as `toStringTag` for `Symbol.toStringTag`. */
    readonly symbol: boolean;
}

/**
 * What QuickJS 2026-06-04 defines and a script on Bedrock Dedicated Server 1.26.51.1 cannot see.
 * It is the difference between the two that the `scripting.engine` parity row's `globals`
 * scenario records, `packages/parity/goldens/scripting/globals.json`, so a path QuickJS never
 * defines does not belong here. The C layer deletes each path when it creates a context, members
 * before globals. The native build writes this list into a C header, so this is its only copy.
 */
const ABSENT_GLOBALS = [
    { path: 'eval' },
    { path: 'performance' },
    { path: 'Atomics' },
    { path: 'Float16Array' },
    { path: 'DataView.prototype.getFloat16' },
    { path: 'DataView.prototype.setFloat16' },
    { path: 'Math.f16round' },
    { path: 'Math.sumPrecise' },
    { path: 'Iterator' },
    { path: 'Iterator.from' },
    { path: 'Iterator.prototype.constructor' },
    { path: 'Iterator.prototype[Symbol.toStringTag]' },
    { path: 'Iterator.prototype.drop' },
    { path: 'Iterator.prototype.every' },
    { path: 'Iterator.prototype.filter' },
    { path: 'Iterator.prototype.find' },
    { path: 'Iterator.prototype.flatMap' },
    { path: 'Iterator.prototype.forEach' },
    { path: 'Iterator.prototype.map' },
    { path: 'Iterator.prototype.reduce' },
    { path: 'Iterator.prototype.some' },
    { path: 'Iterator.prototype.take' },
    { path: 'Iterator.prototype.toArray' },
    { path: 'ArrayBuffer.prototype.detached' },
    { path: 'ArrayBuffer.prototype.maxByteLength' },
    { path: 'ArrayBuffer.prototype.resizable' },
    { path: 'ArrayBuffer.prototype.resize' },
    { path: 'ArrayBuffer.prototype.transfer' },
    { path: 'ArrayBuffer.prototype.transferToFixedLength' },
    { path: 'SharedArrayBuffer.prototype.grow' },
    { path: 'SharedArrayBuffer.prototype.growable' },
    { path: 'SharedArrayBuffer.prototype.maxByteLength' },
    { path: 'Uint8Array.fromBase64' },
    { path: 'Uint8Array.fromHex' },
    { path: 'Uint8Array.prototype.setFromBase64' },
    { path: 'Uint8Array.prototype.setFromHex' },
    { path: 'Uint8Array.prototype.toBase64' },
    { path: 'Uint8Array.prototype.toHex' },
    { path: 'Map.prototype.getOrInsert' },
    { path: 'Map.prototype.getOrInsertComputed' },
    { path: 'WeakMap.prototype.getOrInsert' },
    { path: 'WeakMap.prototype.getOrInsertComputed' },
    { path: 'Set.prototype.union' },
    { path: 'Set.prototype.intersection' },
    { path: 'Set.prototype.difference' },
    { path: 'Set.prototype.symmetricDifference' },
    { path: 'Set.prototype.isSubsetOf' },
    { path: 'Set.prototype.isSupersetOf' },
    { path: 'Set.prototype.isDisjointFrom' },
    { path: 'JSON.isRawJSON' },
    { path: 'JSON.rawJSON' },
    { path: 'Error.isError' },
    { path: 'Promise.try' },
    { path: 'RegExp.escape' },
    { path: 'RegExp.prototype.unicodeSets' },
    { path: 'Function.prototype.columnNumber' }
] as const satisfies readonly AbsentGlobal[];

/**
 * The globals and members the C layer removes from every context.
 * @returns The list, in the order the C layer reads it.
 */
export const absentGlobals = (): readonly AbsentGlobal[] => ABSENT_GLOBALS;

const SYMBOL_KEY = /^(?<owner>.+)\[Symbol\.(?<key>\w+)\]$/;

/**
 * Splits a path into the property names that lead to its holder and its key.
 * @param path - A path in {@link AbsentGlobal.path}'s form.
 * @returns The holder's names from the global object, and the key.
 */
export const splitAbsentPath = (path: string): AbsentPath => {
    const symbolKey = SYMBOL_KEY.exec(path)?.groups;
    if (symbolKey?.owner !== undefined && symbolKey.key !== undefined) {
        return { owner: symbolKey.owner.split('.'), key: symbolKey.key, symbol: true };
    }
    const names = path.split('.');
    return { owner: names.slice(0, -1), key: names.at(-1) ?? path, symbol: false };
};
