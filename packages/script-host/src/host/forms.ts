/**
 * The forms of `@minecraft/server-ui`, as Bedrock Dedicated Server (BDS) builds them and reads
 * their answers. Everything here is plain data in and out: a builder call's arguments, copied out
 * of the engine, become a fragment of form JSON; a form's fragments become the document a
 * `ModalFormRequestPacket` carries; and the client's `ModalFormResponsePacket` becomes what
 * `show()` settles with.
 *
 * The `forms`, `form-json`, `form-responses` and `forms-v1` scenarios of the parity suite's
 * `scripting.ui` family record each rule on the pinned BDS.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptApiError } from '../errors';
import { isRecord } from '../isRecord';
import type { BdsJson, BdsJsonObject } from './formJson';
import { BdsFloat, writeBdsJson, writeBdsJsonValue } from './formJson';

/** The three form builders, by the `type` their JSON has. */
export type FormKind = 'action' | 'modal' | 'message';

/** The JSON `type` of each form kind. */
const FORM_TYPE: Readonly<Record<FormKind, string>> = { action: 'form', modal: 'custom_form', message: 'modal' };

/** An argument as the engine copied it out: a primitive, or a plain copy of an object or list. */
export type PlainValue = string | number | boolean | null | readonly PlainValue[] | PlainObject;

/** A plain copy of an object a script passed. */
export interface PlainObject {
    readonly [key: string]: PlainValue;
}

/** Whether a copied value is an object, not a list or a primitive. */
const isPlainObject = (value: PlainValue | undefined): value is PlainObject => isRecord(value) && !Array.isArray(value);

/** The TypeError the binding throws for an argument that is neither a string nor a `RawMessage`. */
const notTextError = (argument: number): TypeError => new ScriptHostErrors.TextConversionFailed({ argument });

/**
 * One `RawMessage` as BDS turns it into JSON, or null when it holds nothing. A non-empty
 * `rawtext` wins over `translate`, which wins over `text`, which wins over `score`. A child that
 * holds nothing is left out of its `rawtext`, which is null when no child is left. A `with` list
 * of strings becomes a `rawtext` of texts, and an empty one is left out.
 * @throws {TypeError} When a part is not of a `RawMessage` property's type.
 */
const rawMessagePart = (message: PlainValue, argument: number): BdsJsonObject | null => {
    if (!isPlainObject(message)) throw notTextError(argument);
    const { rawtext, translate, text, score } = message;
    if (rawtext !== undefined && rawtext !== null) {
        if (!Array.isArray(rawtext)) throw notTextError(argument);
        if (rawtext.length > 0) {
            const parts = rawtext
                .map((part: PlainValue) => rawMessagePart(part, argument))
                .filter((part): part is BdsJsonObject => part !== null);
            return { rawtext: parts.length === 0 ? null : parts };
        }
    }
    if (typeof translate === 'string') {
        const with_ = message.with;
        if (Array.isArray(with_)) {
            if (with_.length === 0) return { translate };
            const texts = with_.map((each: PlainValue) => {
                if (typeof each !== 'string') throw notTextError(argument);
                return { text: each };
            });
            return { translate, with: { rawtext: texts } };
        }
        if (isPlainObject(with_)) return { translate, with: rawMessagePart(with_, argument) };
        return { translate };
    }
    if (typeof text === 'string') return { text };
    if (isPlainObject(score)) {
        const { name, objective } = score;
        return {
            score: {
                ...(typeof name === 'string' ? { name } : {}),
                ...(typeof objective === 'string' ? { objective } : {})
            }
        };
    }
    return null;
};

/**
 * A string or `RawMessage` argument as form JSON: a string as it is, and a `RawMessage` as a
 * `rawtext` list, unless it is one already.
 * @param argument - The argument's index, which the errors name.
 * @throws {ScriptApiError} BDS's `RawMessageError` for a message that holds nothing.
 * @throws {TypeError} When the value is neither.
 */
export const formText = (value: PlainValue, argument: number): BdsJson => {
    if (typeof value === 'string') return value;
    const part = rawMessagePart(value, argument);
    if (part !== null && 'rawtext' in part) return part;
    const wrapped: BdsJsonObject = { rawtext: [part] };
    if (part === null) {
        throw new ScriptApiError(
            '@minecraft/server',
            'RawMessageError',
            `Failed to resolve raw message from json: \n${writeBdsJson(wrapped)}.`
        );
    }
    return wrapped;
};

/** A form element's kind, as its JSON `type` names it. */
export type FormElementKind = 'button' | 'header' | 'label' | 'divider' | 'input' | 'dropdown' | 'slider' | 'toggle';

/** What one builder call does to a form: set one of its fields, or add an element. */
export type FormChange =
    | { readonly field: string; readonly json: BdsJson }
    | { readonly element: FormElementKind; readonly json: BdsJsonObject };

/** A 32-bit integer, as BDS converts a number argument or option of an integer type. */
const int32 = (value: number): number => Math.trunc(value) | 0;

/** An option's value, when the options object has it with the type it must have. */
const option = <Value extends PlainValue>(
    options: PlainValue | undefined,
    key: string,
    is: (value: PlainValue) => value is Value
): Value | undefined => {
    if (!isPlainObject(options)) return undefined;
    const value = options[key];
    return value !== undefined && is(value) ? value : undefined;
};
const isNumber = (value: PlainValue): value is number => typeof value === 'number' && Number.isFinite(value);
const isBoolean = (value: PlainValue): value is boolean => typeof value === 'boolean';
const isText = (value: PlainValue): value is PlainValue => typeof value === 'string' || isPlainObject(value);

/** The `tooltip` of a version 2 options object, when it has one. */
const tooltipOf = (options: PlainValue | undefined, argument: number): BdsJsonObject => {
    const tooltip = option(options, 'tooltip', isText);
    return tooltip === undefined ? {} : { tooltip: formText(tooltip, argument) };
};

/** A number argument the binding has checked. */
const numberAt = (args: readonly PlainValue[], index: number): number => {
    const value = args[index];
    return typeof value === 'number' ? value : 0;
};

/** The elements every builder of a version that has them shares: a header, a label and a divider. */
const textElement = (member: string, args: readonly PlainValue[]): FormChange | undefined => {
    if (member === 'header' || member === 'label') {
        return { element: member, json: { text: formText(args[0] ?? null, 0), type: member } };
    }
    if (member === 'divider') return { element: 'divider', json: { text: '', type: 'divider' } };
    return undefined;
};

/** One modal form element, under the version 1 signatures or the version 2 options objects. */
const modalElement = (member: string, args: readonly PlainValue[], major: number): FormChange | undefined => {
    const label = (): BdsJson => formText(args[0] ?? null, 0);
    switch (member) {
        case 'textField': {
            const third = args[2];
            const fallback = major === 1 ? (third ?? undefined) : option(third, 'defaultValue', isText);
            return {
                element: 'input',
                json: {
                    ...(fallback === undefined || fallback === null ? {} : { default: formText(fallback, 2) }),
                    placeholder: formText(args[1] ?? null, 1),
                    text: label(),
                    ...(major === 1 ? {} : tooltipOf(third, 2)),
                    type: 'input'
                }
            };
        }
        case 'dropdown': {
            const items = args[1];
            const options = Array.isArray(items) && items.length > 0 ? items.map((item) => formText(item, 1)) : null;
            const third = args[2];
            const index =
                major === 1
                    ? typeof third === 'number'
                        ? third
                        : undefined
                    : option(third, 'defaultValueIndex', isNumber);
            return {
                element: 'dropdown',
                json: {
                    ...(index === undefined ? {} : { default: int32(index) }),
                    options,
                    text: label(),
                    ...(major === 1 ? {} : tooltipOf(third, 2)),
                    type: 'dropdown'
                }
            };
        }
        case 'slider': {
            const fourth = args[3];
            const step = major === 1 ? numberAt(args, 3) : option(fourth, 'valueStep', isNumber);
            const fifth = args[4];
            const fallback =
                major === 1
                    ? typeof fifth === 'number'
                        ? fifth
                        : undefined
                    : option(fourth, 'defaultValue', isNumber);
            return {
                element: 'slider',
                json: {
                    ...(fallback === undefined ? {} : { default: int32(fallback) }),
                    max: new BdsFloat(numberAt(args, 2)),
                    min: new BdsFloat(numberAt(args, 1)),
                    step: new BdsFloat(step === undefined ? 1 : major === 1 ? step : int32(step)),
                    text: label(),
                    timeout: new BdsFloat(100),
                    ...(major === 1 ? {} : tooltipOf(fourth, 3)),
                    type: 'slider'
                }
            };
        }
        case 'toggle': {
            const second = args[1];
            const fallback =
                major === 1
                    ? typeof second === 'boolean'
                        ? second
                        : undefined
                    : option(second, 'defaultValue', isBoolean);
            return {
                element: 'toggle',
                json: {
                    ...(fallback === undefined ? {} : { default: fallback }),
                    text: label(),
                    ...(major === 1 ? {} : tooltipOf(second, 1)),
                    type: 'toggle'
                }
            };
        }
        default:
            return textElement(member, args);
    }
};

/**
 * What one builder call does to a form.
 * @param kind - The builder.
 * @param member - The member the script called, such as `button`.
 * @param args - Its arguments, after the binding's checks, copied out of the engine.
 * @param major - The major version of `@minecraft/server-ui` the pack is served.
 * @throws {ScriptApiError} BDS's `RawMessageError` for a `RawMessage` that holds nothing.
 * @throws {TypeError} For a `RawMessage` with a part of the wrong type.
 * @throws {RangeError} For a member that is not a builder call.
 */
export const formChange = (kind: FormKind, member: string, args: readonly PlainValue[], major: number): FormChange => {
    const text = (index: number): BdsJson => formText(args[index] ?? null, index);
    if (member === 'title') return { field: 'title', json: text(0) };
    if (kind === 'action') {
        if (member === 'body') return { field: 'content', json: text(0) };
        if (member === 'button') {
            const icon = args[1];
            return {
                element: 'button',
                json: {
                    image: typeof icon === 'string' ? { data: icon, type: 'path' } : null,
                    text: text(0),
                    type: 'button'
                }
            };
        }
        const element = textElement(member, args);
        if (element !== undefined) return element;
    } else if (kind === 'modal') {
        if (member === 'submitButton') return { field: 'submit', json: text(0) };
        const element = modalElement(member, args, major);
        if (element !== undefined) return element;
    } else {
        if (member === 'body') return { field: 'content', json: text(0) };
        // Version 1 writes the two buttons the other way round, and reads the answer the other way round.
        if (member === 'button1') return { field: major === 1 ? 'button2' : 'button1', json: text(0) };
        if (member === 'button2') return { field: major === 1 ? 'button1' : 'button2', json: text(0) };
    }
    throw new ScriptHostErrors.NotAFormBuilderMember({ member, kind });
};

/** A form as the host keeps it: each field and each element as a written fragment of form JSON. */
export interface FormParts {
    readonly fields: Readonly<Record<string, string>>;
    readonly elements: readonly (readonly [string, string])[];
}

/** A form ready to send: its JSON, and what a response to it is read against. */
export interface BuiltForm {
    readonly kind: FormKind;
    readonly major: number;
    /** The document a `ModalFormRequestPacket` carries, byte for byte as BDS writes it. */
    readonly json: string;
}

/** A written fragment, kept as it is when the document around it is written. */
class Fragment {
    public readonly text: string;
    public constructor(text: string) {
        this.text = text;
    }
}

/**
 * Writes a whole form from its parts, with the defaults BDS writes for what the script left out:
 * an empty title, body and buttons, and `null` for a form with no elements.
 */
export const buildForm = (kind: FormKind, major: number, parts: FormParts): BuiltForm => {
    const field = (name: string, fallback: string): Fragment =>
        new Fragment(parts.fields[name] ?? writeBdsJsonValue(fallback));
    const elements =
        parts.elements.length === 0 ? null : new Fragment(`[${parts.elements.map(([, json]) => json).join(',')}]`);
    const top: Record<string, Fragment | string | null> = { title: field('title', ''), type: FORM_TYPE[kind] };
    if (kind === 'action') {
        top.content = field('content', '');
        top.elements = elements;
    } else if (kind === 'modal') {
        top.content = elements;
        top.icon = null;
        if (parts.fields.submit !== undefined) top.submit = new Fragment(parts.fields.submit);
    } else {
        top.content = field('content', '');
        top.button1 = field('button1', '');
        top.button2 = field('button2', '');
    }
    const keys = Object.keys(top).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const body = keys.map((key) => {
        const value = top[key] ?? null;
        return `${writeBdsJsonValue(key)}:${value instanceof Fragment ? value.text : writeBdsJsonValue(value)}`;
    });
    return { kind, major, json: `{${body.join(',')}}\n` };
};

/** Why a form closed without an answer, as `FormCancelationReason` names it. */
export type FormCancelationReason = 'UserBusy' | 'UserClosed';

/** What a `show()` promise settles with, by what the client sent. */
export type FormOutcome =
    | { readonly settle: 'canceled'; readonly reason: FormCancelationReason }
    | { readonly settle: 'selection'; readonly selection: number }
    | { readonly settle: 'values'; readonly formValues: readonly PlainValue[]; readonly nullIsUndefined: boolean }
    | { readonly settle: 'malformed' }
    /** A response with neither JSON nor a reason: BDS drops it and the form stays open. */
    | { readonly settle: 'none' };

/** JSON's whitespace, which the response may have around its value. */
const JSON_WHITESPACE = /^[ \t\n\r]*|[ \t\n\r]*$/g;

/** The range a JSON integer must be in to be read as one rather than as a double. */
const INT64_MIN = -(2n ** 63n);
const UINT64_MAX = 2n ** 64n - 1n;

/**
 * Reads a response that is an integer or a boolean as BDS does: an integer as a 32-bit unsigned
 * number, so -1 is 4294967295, and a boolean as 1 or 0. A number with a fraction or an exponent,
 * even `1.0`, is not an integer.
 */
const unsignedOf = (text: string, value: unknown): number | undefined => {
    if (typeof value === 'boolean') return value ? 1 : 0;
    const trimmed = text.replace(JSON_WHITESPACE, '');
    if (!/^-?(0|[1-9][0-9]*)$/.test(trimmed)) return undefined;
    const integer = BigInt(trimmed);
    if (integer < INT64_MIN || integer > UINT64_MAX) return undefined;
    return Number(BigInt.asUintN(32, integer));
};

/**
 * Reads a client's answer to a form as BDS does. A cancel reason, when the response has one, wins
 * over its JSON: 1 is `UserBusy` and any other byte `UserClosed`. Otherwise the JSON must fit the
 * form, or the promise rejects as malformed:
 *
 * - an action form takes an integer or a boolean, as {@link unsignedOf} reads it, whatever its
 *   number of buttons;
 * - a message form takes the same, except that a boolean picks the first button with `true` in
 *   version 2, and with `false` in version 1, whose buttons are written the other way round;
 * - a modal form takes a list of strings, numbers and booleans, of any length, and version 2
 *   also takes `null`, which reads as `undefined`.
 *
 * A response whose text is not JSON reads as malformed here; the server disconnects the client
 * that sent it before it gets this far, as BDS does.
 */
export const readFormResponse = (form: BuiltForm, json: string | null, cancelReason: number | null): FormOutcome => {
    if (cancelReason !== null) return { settle: 'canceled', reason: cancelReason === 1 ? 'UserBusy' : 'UserClosed' };
    if (json === null) return { settle: 'none' };
    let value: unknown;
    try {
        value = JSON.parse(json);
    } catch {
        return { settle: 'malformed' };
    }
    if (form.kind === 'modal') {
        if (!Array.isArray(value)) return { settle: 'malformed' };
        const nullIsUndefined = form.major !== 1;
        const fits = value.every(
            (each: unknown) =>
                typeof each === 'string' ||
                typeof each === 'number' ||
                typeof each === 'boolean' ||
                (each === null && nullIsUndefined)
        );
        // Checked above: every element is a string, a number, a boolean or null.
        return fits
            ? { settle: 'values', formValues: value as PlainValue[], nullIsUndefined }
            : { settle: 'malformed' };
    }
    if (form.kind === 'message' && typeof value === 'boolean') {
        return { settle: 'selection', selection: value === (form.major === 1) ? 1 : 0 };
    }
    const selection = unsignedOf(json, value);
    return selection === undefined ? { settle: 'malformed' } : { settle: 'selection', selection };
};
