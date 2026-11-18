import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { engineFunctionSource } from '../engineSource';
import type { ScriptContextId, ScriptEngine } from '../ScriptEngine';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';

/**
 * The part of `@minecraft/server-net` that runs inside a pack's engine context, never in Node.js.
 *
 * BDS gives each `HttpRequest` one list for its `headers`: every read returns the same array,
 * filled again with new `HttpHeader`s, so an element a script pushed stays and a list read before
 * an `addHeader` grows with it (the `net-http` scenario of the parity suite recorded it). The list
 * lives beside the request, in a `WeakMap` of the pack's realm, and goes when the script lets the
 * request go.
 */
export interface NetKit {
    /** The request's list, empty the first time it is asked for. */
    list(owner: object): unknown[];
    /** Puts a value at one place of a list, past any setter a script put on `Array.prototype`. */
    put(list: unknown[], index: number, value: unknown): void;
    /** Drops every element of a list from `length` on. */
    truncate(list: unknown[], length: number): void;
}

/**
 * Makes the kit of one context. It runs inside a script engine, so it must not refer to anything
 * outside its own body, and it takes the built-ins it uses before any of the pack's code runs.
 */
export function netKit(): NetKit {
    // biome-ignore lint/suspicious/noRedundantUseStrict: the engine runs this source as a script, which is sloppy unless it says otherwise.
    'use strict';
    const { apply } = Reflect;
    const { defineProperty } = Object;
    const WeakMapConstructor = WeakMap;
    const weakGet = WeakMap.prototype.get;
    const weakSet = WeakMap.prototype.set;
    const lists: WeakMap<object, unknown[]> = new WeakMapConstructor();
    return {
        list(owner: object): unknown[] {
            const known: unknown[] | undefined = apply(weakGet, lists, [owner]);
            if (known !== undefined) return known;
            const made: unknown[] = [];
            apply(weakSet, lists, [owner, made]);
            return made;
        },
        put(list: unknown[], index: number, value: unknown): void {
            defineProperty(list, index, { value, writable: true, enumerable: true, configurable: true });
        },
        truncate(list: unknown[], length: number): void {
            if (list.length > length) list.length = length;
        }
    };
}

/** The source text that evaluates, inside an engine, to {@link netKit}. */
export const netKitSource = (): string => engineFunctionSource(netKit.toString());

const handleOf = (value: ScriptValue, what: string): ScriptHandle => {
    if (value instanceof ScriptHandle) return value;
    throw new ScriptHostErrors.NotAnObject({ what });
};

/** One pack's {@link NetKit}, as the host calls it. */
export class PackNet {
    private readonly engine: ScriptEngine;
    private readonly kit: ScriptHandle;
    private readonly functions: Readonly<Record<keyof NetKit, ScriptHandle>>;
    private destroyed = false;

    /** Makes the kit in the pack's context, before any of the pack's code runs. */
    public constructor(engine: ScriptEngine, context: ScriptContextId) {
        this.engine = engine;
        this.kit = engine.inContext(context, () => {
            const factory = handleOf(engine.evaluate(netKitSource(), '<jsp server-net>'), 'The net kit');
            try {
                return handleOf(engine.call(factory, undefined), 'The net kit');
            } finally {
                engine.free(factory);
            }
        });
        this.functions = {
            list: handleOf(engine.get(this.kit, 'list'), 'list'),
            put: handleOf(engine.get(this.kit, 'put'), 'put'),
            truncate: handleOf(engine.get(this.kit, 'truncate'), 'truncate')
        };
    }

    /**
     * Fills a request's list with `items`, in order, and returns it; the caller frees it.
     * @param exact - Whether elements past the items go, as when the request's headers are replaced.
     */
    public fill(owner: ScriptValue, items: readonly ScriptValue[], exact: boolean): ScriptHandle {
        const list = handleOf(
            this.engine.call(this.functions.list, this.kit, handleOf(owner, 'The request')),
            'The list'
        );
        items.forEach((item, index) => this.engine.call(this.functions.put, this.kit, list, index, item));
        if (exact) this.engine.call(this.functions.truncate, this.kit, list, items.length);
        return list;
    }

    /** Frees the kit's handles. The engine keeps what scripts still refer to. */
    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const handle of Object.values(this.functions)) this.engine.free(handle);
        this.engine.free(this.kit);
    }
}
