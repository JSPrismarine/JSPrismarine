import { ScriptApiError } from '../errors';
import type { ScriptContextId, ScriptEngine } from '../ScriptEngine';
import type { ScriptApiContext } from '../shape/binding';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import { formKitSource } from './formKit';
import type { FormChange, FormKind, FormOutcome, FormParts, PlainValue } from './forms';
import { writeBdsJsonValue } from './formJson';
import { isRecord } from '../isRecord';

/** The module the forms belong to. */
export const SERVER_UI = '@minecraft/server-ui';

/** Why a `show()` promise rejects, as `FormRejectReason` names it, with BDS's message for each. */
export const FORM_REJECT_MESSAGES = {
    MalformedResponse: 'Response from the client was malformed.',
    PlayerQuit: 'Player quit before responding.'
} as const;

/** A reason a `show()` promise rejects with. */
export type FormRejectReason = keyof typeof FORM_REJECT_MESSAGES;

/** The response class a script gets for each form kind. */
const RESPONSE_CLASS = {
    action: 'ActionFormResponse',
    modal: 'ModalFormResponse',
    message: 'MessageFormResponse'
} as const satisfies Record<FormKind, string>;

/** A `show()` promise and the functions that settle it. The host owns all three handles. */
export interface FormDeferred {
    readonly promise: ScriptHandle;
    readonly resolve: ScriptHandle;
    readonly reject: ScriptHandle;
}

const handleOf = (value: ScriptValue, what: string): ScriptHandle => {
    if (value instanceof ScriptHandle) return value;
    throw new TypeError(`${what} is not an object`);
};

/**
 * The forms of one pack: the kit that keeps each form's parts and each response's data in the
 * pack's realm ({@link formKitSource}), and what the host makes there, such as a response object
 * or the `FormRejectError` a promise rejects with.
 */
export class PackForms {
    private readonly engine: ScriptEngine;
    private readonly api: ScriptApiContext;
    private readonly kit: ScriptHandle;
    private readonly functions: Readonly<Record<string, ScriptHandle>>;
    /**
     * Handles the host made to return to a script, such as a `show()` promise. The engine copies
     * a returned handle, so the host frees its own after the call, at {@link releaseReturned}.
     */
    private returned: ScriptHandle[] = [];
    private destroyed = false;

    /**
     * Makes the kit in the pack's context, before any of the pack's code runs, so the built-ins
     * it keeps are the pack's own and not ones a script replaced.
     * @param major - The major version of `@minecraft/server-ui` the pack is served.
     */
    public constructor(
        engine: ScriptEngine,
        context: ScriptContextId,
        api: ScriptApiContext,
        public readonly major: number
    ) {
        this.engine = engine;
        this.api = api;
        this.kit = engine.inContext(context, () => {
            const factory = handleOf(engine.evaluate(formKitSource(), '<jsp server-ui>'), 'The form kit');
            try {
                return handleOf(engine.call(factory, undefined), 'The form kit');
            } finally {
                engine.free(factory);
            }
        });
        const functions: Record<string, ScriptHandle> = {};
        for (const name of ['plain', 'set', 'add', 'read', 'deferred', 'attach', 'field']) {
            functions[name] = handleOf(engine.get(this.kit, name), name);
        }
        this.functions = functions;
    }

    /** Copies an argument out of the engine: a primitive as it is, an object or list as plain data. */
    public plain(value: ScriptValue): PlainValue {
        if (!(value instanceof ScriptHandle)) return value === undefined ? null : value;
        const text = this.call('plain', value);
        // The kit wrote it with JSON.stringify from strings, numbers, booleans, null, lists and objects.
        return typeof text === 'string' ? (JSON.parse(text) as PlainValue) : null;
    }

    /** Applies one builder call's change to a form. */
    public apply(form: ScriptValue, change: FormChange): void {
        const target = handleOf(form, 'The form');
        const result =
            'field' in change
                ? this.call('set', target, change.field, writeBdsJsonValue(change.json))
                : this.call('add', target, change.element, writeBdsJsonValue(change.json));
        if (result instanceof ScriptHandle) this.engine.free(result);
    }

    /** A form's parts, as the builder calls made so far left them. */
    public read(form: ScriptValue): FormParts {
        const text = this.call('read', handleOf(form, 'The form'));
        const parsed: unknown = typeof text === 'string' ? JSON.parse(text) : undefined;
        if (!isRecord(parsed) || !isRecord(parsed.fields) || !Array.isArray(parsed.elements)) {
            return { fields: {}, elements: [] };
        }
        const fields: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed.fields)) if (typeof value === 'string') fields[key] = value;
        const elements = parsed.elements.flatMap((element: unknown): (readonly [string, string])[] =>
            Array.isArray(element) && typeof element[0] === 'string' && typeof element[1] === 'string'
                ? [[element[0], element[1]]]
                : []
        );
        return { fields, elements };
    }

    /** Makes a promise in the pack's realm, for `show()` to return. */
    public deferred(): FormDeferred {
        const list = handleOf(this.call('deferred'), 'The deferred promise');
        try {
            return {
                promise: handleOf(this.engine.get(list, '0'), 'The promise'),
                resolve: handleOf(this.engine.get(list, '1'), 'The resolve function'),
                reject: handleOf(this.engine.get(list, '2'), 'The reject function')
            };
        } finally {
            this.engine.free(list);
        }
    }

    /**
     * Makes the response object a settled form resolves with. The caller frees it.
     * @param outcome - What the client answered; anything but a rejection.
     */
    public response(kind: FormKind, outcome: Exclude<FormOutcome, { settle: 'malformed' | 'none' }>): ScriptHandle {
        const response = this.api.create(SERVER_UI, RESPONSE_CLASS[kind], 0);
        const data =
            outcome.settle === 'canceled'
                ? { canceled: true, cancelationReason: outcome.reason }
                : outcome.settle === 'selection'
                  ? { canceled: false, selection: outcome.selection }
                  : { canceled: false, formValues: outcome.formValues, nullIsUndefined: outcome.nullIsUndefined };
        this.call('attach', response, JSON.stringify(data));
        return response;
    }

    /** Makes the `FormRejectError` a promise rejects with. The caller frees it. */
    public rejection(reason: FormRejectReason): ScriptHandle {
        return this.api.makeError(
            new ScriptApiError(SERVER_UI, 'FormRejectError', FORM_REJECT_MESSAGES[reason], { reason })
        );
    }

    /** Reads one field of a response object, for its getters. A list it returns is freed at {@link releaseReturned}. */
    public field(
        response: ScriptValue,
        key: 'canceled' | 'cancelationReason' | 'selection' | 'formValues'
    ): ScriptValue {
        return this.returning(this.call('field', handleOf(response, 'The response'), key));
    }

    /** Keeps a handle the host returns to a script until {@link releaseReturned}, and returns it. */
    public returning<Value extends ScriptValue>(value: Value): Value {
        if (value instanceof ScriptHandle) this.returned.push(value);
        return value;
    }

    /** Frees the handles returned to scripts since the last call, whose calls are over. */
    public releaseReturned(): void {
        for (const handle of this.returned.splice(0)) this.engine.free(handle);
    }

    /** Frees the kit's handles. The engine keeps what scripts still refer to. */
    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.releaseReturned();
        for (const handle of Object.values(this.functions)) this.engine.free(handle);
        this.engine.free(this.kit);
    }

    private call(name: string, ...args: ScriptValue[]): ScriptValue {
        const fn = this.functions[name];
        if (fn === undefined) throw new ReferenceError(`The form kit has no ${name}`);
        return this.engine.call(fn, this.kit, ...args);
    }
}
