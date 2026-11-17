import { engineFunctionSource } from '../engineSource';

/**
 * The part of `@minecraft/server-ui` that runs inside a pack's engine context, never in Node.js.
 *
 * A form builder and a form response are objects a script holds and may drop at any time, so
 * what the host knows of each lives beside it, in a `WeakMap` of the pack's realm, and goes when
 * the script lets the object go. The host writes and reads it through the functions this returns.
 * Reading a script's argument into plain data runs here too, so the watchdog counts every getter
 * and element it visits, as it counts the script's own work.
 */
export interface FormKit {
    /**
     * Copies a `RawMessage`, an options object or a list of either into plain data and returns it
     * as JSON text, reading only the properties the Script API defines. A value nested deeper than
     * the kit follows is copied as `null`.
     */
    plain(value: unknown): string;
    /** Sets one of a form's fields, such as its title, to a fragment of form JSON, and returns the form. */
    set(form: object, field: string, fragment: string): object;
    /** Adds an element to a form, a fragment of form JSON and its kind, and returns the form. */
    add(form: object, kind: string, fragment: string): object;
    /** A form's fields and elements as JSON text: `{ fields, elements: [kind, fragment][] }`. */
    read(form: object): string;
    /** A new promise and the two functions that settle it. */
    deferred(): [Promise<unknown>, (value: unknown) => void, (reason: unknown) => void];
    /** Attaches what a response holds, as JSON text, to the response object a script gets. */
    attach(response: object, data: string): void;
    /**
     * Reads one field of a response. `formValues` is a new array each time, with each `null` of a
     * response that writes an absent value as `undefined`.
     */
    field(response: object, key: string): unknown;
}

/**
 * Makes the kit of one context. It runs inside a script engine, so it must not refer to anything
 * outside its own body, and it takes the built-ins it uses before any of the pack's code runs.
 */
export function formKit(): FormKit {
    // biome-ignore lint/suspicious/noRedundantUseStrict: the engine runs this source as a script, which is sloppy unless it says otherwise.
    'use strict';
    const { stringify, parse } = JSON;
    const { isArray } = Array;
    const { apply } = Reflect;
    const { defineProperty } = Object;
    /** Makes an own property, which no setter a script put on `Object.prototype` can intercept. */
    const put = (target: object, key: string, value: unknown): void => {
        defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
    };
    const PromiseConstructor = Promise;
    const WeakMapConstructor = WeakMap;
    const uncurry =
        <This, Args extends unknown[], Result>(fn: (this: This, ...args: Args) => Result) =>
        (self: This, ...args: Args): Result =>
            apply(fn, self, args);
    // The uncurried accessors lose the collections' type parameters, which these restore.
    const weakGet = uncurry(WeakMap.prototype.get) as <V>(map: WeakMap<object, V>, key: object) => V | undefined;
    const weakSet = uncurry(WeakMap.prototype.set);
    const push = uncurry(Array.prototype.push) as <T>(list: T[], value: T) => number;
    /** The properties of `RawMessage`, `RawMessageScore` and the form options interfaces. */
    const KEYS = [
        'rawtext',
        'score',
        'name',
        'objective',
        'text',
        'translate',
        'with',
        'defaultValue',
        'defaultValueIndex',
        'tooltip',
        'valueStep'
    ];
    /** How deep a raw message nests before the kit stops following it. */
    const DEPTH = 32;

    type Plain = string | number | boolean | null | Plain[] | { [key: string]: Plain };
    const copy = (value: unknown, depth: number): Plain => {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
        if (typeof value !== 'object' || value === null || depth > DEPTH) return null;
        if (isArray(value)) {
            const list: Plain[] = [];
            const { length } = value;
            for (let index = 0; index < length; index++) push(list, copy(value[index], depth + 1));
            return list;
        }
        // Any object a script passed; only the Script API's own properties are read from it.
        const object = value as Readonly<Record<string, unknown>>;
        const copied: { [key: string]: Plain } = {};
        for (let index = 0; index < KEYS.length; index++) {
            const key = KEYS[index];
            if (key === undefined) continue;
            const field = object[key];
            if (field !== undefined) put(copied, key, copy(field, depth + 1));
        }
        return copied;
    };

    interface FormState {
        readonly fields: { [field: string]: string };
        readonly elements: [string, string][];
    }
    const forms = new WeakMapConstructor<object, FormState>();
    const stateOf = (form: object): FormState => {
        const known = weakGet(forms, form);
        if (known !== undefined) return known;
        const made: FormState = { fields: {}, elements: [] };
        weakSet(forms, form, made);
        return made;
    };

    interface ResponseData {
        readonly canceled: boolean;
        readonly cancelationReason?: string;
        readonly selection?: number;
        /** The JSON array the client sent, for a submitted modal form. */
        readonly formValues?: Plain[];
        /** Whether a `null` among the form values reads as `undefined`. */
        readonly nullIsUndefined?: boolean;
    }
    const responses = new WeakMapConstructor<object, ResponseData>();

    return {
        plain: (value) => stringify(copy(value, 0)),
        set(form, field, fragment) {
            put(stateOf(form).fields, field, fragment);
            return form;
        },
        add(form, kind, fragment) {
            push(stateOf(form).elements, [kind, fragment]);
            return form;
        },
        read: (form) => stringify(weakGet(forms, form) ?? { fields: {}, elements: [] }),
        deferred() {
            let resolve: (value: unknown) => void = () => {};
            let reject: (reason: unknown) => void = () => {};
            const promise = new PromiseConstructor((onResolve, onReject) => {
                resolve = onResolve;
                reject = onReject;
            });
            return [promise, resolve, reject];
        },
        attach(response, data) {
            weakSet(responses, response, parse(data));
        },
        field(response, key) {
            const data = weakGet(responses, response);
            if (data === undefined) return undefined;
            if (key === 'canceled') return data.canceled;
            if (key === 'cancelationReason') return data.cancelationReason;
            if (key === 'selection') return data.selection;
            if (key !== 'formValues' || data.formValues === undefined) return undefined;
            const values: unknown[] = [];
            for (let index = 0; index < data.formValues.length; index++) {
                const value = data.formValues[index];
                push(values, value === null && data.nullIsUndefined === true ? undefined : value);
            }
            return values;
        }
    };
}

/** The source text that evaluates, inside an engine, to {@link formKit}. */
export const formKitSource = (): string => engineFunctionSource(formKit.toString());
