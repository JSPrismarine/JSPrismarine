/**
 * The data-driven UI of `@minecraft/server-ui` 2.1.0 and later: `CustomForm`, `MessageBox` and the
 * four `Observable*` classes. Unlike the older builders, a data-driven form keeps its controls and
 * their reactive values while it is on screen: a button runs its callback without closing the form,
 * and `setData()` on a bound observable changes what the player sees.
 *
 * A shown form is one property of the client's `minecraft` data store, laid out as the pinned
 * Bedrock Dedicated Server lays it out: `custom_form_data_<n>` or `message_box_data_<n>`, whose
 * `layout` lists a custom form's controls by index. `show()` hands the world that property and the
 * screen to open; a bound observable's `setData()` changes one path of it, such as
 * `layout[7].value`. The client answers by writing paths too: a button's `onClick`, or a
 * client-writable observable's value. Those writes and the close reasons arrive as inputs
 * ([ADR 0009](../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)). The
 * `data-driven-forms` scenario of `packages/parity` records the layout and the settling rules.
 *
 * Each object's state lives in these tables, keyed by the number its constructor gave it, so the
 * callbacks it holds are freed when its pack goes away.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import type { ScriptApiContext } from '../shape/binding';
import type { ScriptApiImplementations, ScriptCall, ScriptMemberName } from '../shape/implementations';
import type { ScriptEngine } from '../ScriptEngine';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import { ScriptApiError } from '../errors';
import { isRecord } from '../isRecord';
import type { FormDeferred, PackForms } from './PackForms';
import { SERVER_UI } from './PackForms';
import type { SettleInPack } from './ScriptForms';
import type { FormPlayer } from './minecraftServerUi';
import { invalidEntity, PLAYER } from './serverObjects';
import type {
    DataDrivenCloseReason,
    DataDrivenLeaf,
    DataDrivenRecord,
    DataDrivenResponse,
    DataDrivenScreen,
    DataDrivenValue,
    ScriptFormChannel
} from './world';

/** The marker in an object's state that says which observable or form instance it is. */
const OBSERVABLE_STATE = 'observable:';
const FORM_STATE = 'form:';

/** The kind of value an observable holds, which the input controls check. */
export type ObservableKind = 'boolean' | 'number' | 'string' | 'raw';

/** One observable's value and the callbacks waiting on it. The kind and value travel together. */
type ObservableState<Owner> = {
    readonly clientWritable: boolean;
    readonly owner: Owner;
    readonly subscribers: ScriptHandle[];
} & (
    | { readonly kind: 'boolean'; value: boolean }
    | { readonly kind: 'number'; value: number }
    | { readonly kind: 'string'; value: string }
    /** A `UIRawMessage`, as the JSON text of the object the script passed. */
    | { readonly kind: 'raw'; value: string }
);

/** One field of a control: a value fixed by the builder call, or an observable it follows. */
type Field = { readonly value: DataDrivenValue } | { readonly observable: number };

/** One control of a form, as its builder call left it. */
interface StoredControl {
    /** The builder method that added it, such as `button` or `slider`. */
    readonly type: string;
    /** The control's fields in the data store, in the order BDS's layout lists them. */
    readonly fields: (readonly [string, Field])[];
    /** A button's callback, which a click runs without settling the form. */
    readonly callback?: ScriptHandle;
}

/** A form the script built, before and while it is on screen. */
interface StoredForm<Owner> {
    readonly id: number;
    readonly kind: 'custom' | 'message';
    /** The pack whose script made the form, which settles its promise. */
    readonly pack: DataDrivenPack<Owner>;
    /** The player's entity id, copied out when the form was made. */
    readonly player: string;
    readonly title: Field;
    /** A custom form's controls, in call order. */
    readonly controls: StoredControl[];
    /** Whether a custom form shows its close button, which `closeButton()` turns on. */
    closeButton: boolean;
    /** A message box's body, which `body()` sets. */
    body?: Field;
    /** A message box's buttons' fields, by their data store key. */
    readonly buttons: Map<'button1' | 'button2', readonly (readonly [string, Field])[]>;
    /** Set once `show()` succeeds; a form can be shown only once. */
    shown: boolean;
    /** Set when the form closed, so it cannot be built on or shown again. */
    settled: boolean;
    /** Set once its callback handles have been freed, so pack teardown does not free them twice. */
    freed: boolean;
    formId?: number;
    /** The data store property the form is shown in, such as `custom_form_data_3`. */
    property?: string;
    /** Each path of the shown property that follows an observable, by the observable's id. */
    bindings?: Map<number, string[]>;
    /** The message box button the client clicked last, counting from 1. */
    selection?: number;
    deferred?: FormDeferred;
}

/** What one pack's data-driven UI reaches of its realm and the world. */
export interface DataDrivenPack<Owner> {
    /** The pack's form kit, which makes promises in the pack's realm. */
    readonly forms: PackForms;
    readonly api: ScriptApiContext;
    readonly owner: Owner;
    /** The player an object stands for, or undefined for an object the host did not make. */
    player(value: ScriptValue): FormPlayer | undefined;
}

/** What the runtime reaches of its packs and the world, for all data-driven screens. */
export interface DataDrivenHost<Owner> {
    readonly channel: ScriptFormChannel | undefined;
    readonly engine: ScriptEngine;
    /** The players in the world now, by id. */
    players(): readonly string[];
    /** The pack whose script made a call, by its stable identity. */
    pack(id: string): DataDrivenPack<Owner> | undefined;
    /** The next form id, shared with the older forms. */
    nextFormId(): number;
}

/** What `show()` settles with, as the Script API's `DataDrivenScreenClosedReason` names it. */
type ClosedReason = 'ClientClosed' | 'ServerClosed' | 'UserBusy';

/** How each close reason a client reports settles `show()`; `invalidform` rejects it instead. */
const CLOSED_REASONS: Readonly<Record<Exclude<DataDrivenCloseReason, 'invalidform'>, ClosedReason>> = {
    programmaticclose: 'ServerClosed',
    programmaticcloseall: 'ServerClosed',
    clientcanceled: 'ClientClosed',
    userbusy: 'UserBusy'
};

/** The screen BDS opens for each form kind. */
const SCREEN_IDS = { custom: 'minecraft:custom_form', message: 'minecraft:message_box' } as const;

/** The start of the data store property each form kind is shown in, before its instance number. */
const PROPERTY_PREFIXES = { custom: 'custom_form_data_', message: 'message_box_data_' } as const;

/** The style every form's property names, which is BDS's only one. */
const STYLE_ID = 'modalForm';

/** A path to a custom form's button or image, as a client's click writes it. */
const CONTROL_CLICK = /^layout\[(\d+)\]\.(?:image_)?onClick$/;

/** A path to a message box's button, as a client's click writes it. */
const MESSAGE_CLICK = /^button([12])\.onClick$/;

const uiError = (className: string, message: string, fields: Record<string, string | number | boolean> = {}) =>
    new ScriptApiError(SERVER_UI, className, message, fields);

/** The observable object an argument holds, or undefined when it is a literal or another object. */
const observableOf = (call: ScriptCall, value: ScriptValue): number | undefined => {
    if (!(value instanceof ScriptHandle)) return undefined;
    const state = call.stateOf(value);
    if (!state.startsWith(OBSERVABLE_STATE)) return undefined;
    const id = Number(state.slice(OBSERVABLE_STATE.length));
    return Number.isInteger(id) ? id : undefined;
};

/** Parsed JSON as a data store value: an object becomes a map and an array a list. */
const valueOfJson = (json: unknown): DataDrivenValue => {
    if (json === null || typeof json === 'boolean' || typeof json === 'number' || typeof json === 'string') return json;
    if (Array.isArray(json)) return json.map(valueOfJson);
    if (isRecord(json)) return Object.fromEntries(Object.entries(json).map(([key, each]) => [key, valueOfJson(each)]));
    return null;
};

/**
 * A list as BDS lays one out in a form's property: a map from each index to its item, and the
 * count as an int64 under `length`.
 */
const indexed = (items: readonly DataDrivenValue[]): DataDrivenRecord => ({
    ...Object.fromEntries(items.map((item, index) => [String(index), item])),
    length: BigInt(items.length)
});

/**
 * The data-driven forms and observables of every pack in one runtime. One instance owns the state
 * of all the objects scripts built, and settles their promises in the pack that made them.
 */
export class DataDrivenUi<Owner> {
    private readonly observables = new Map<number, ObservableState<Owner>>();
    private readonly forms = new Map<number, StoredForm<Owner>>();
    /** The forms on screen, by form id, in the order they were shown. */
    private readonly open = new Map<number, StoredForm<Owner>>();
    private nextId = 1;
    private nextInstance = 1;

    public constructor(private readonly hostOf: () => DataDrivenHost<Owner>) {}

    private get host(): DataDrivenHost<Owner> {
        return this.hostOf();
    }

    /** Registers the behavior of every data-driven member the served version declares. */
    public register(implementations: ScriptApiImplementations): ScriptApiImplementations {
        for (const [className, kind] of [
            ['ObservableBoolean', 'boolean'],
            ['ObservableNumber', 'number'],
            ['ObservableString', 'string'],
            ['ObservableUIRawMessage', 'raw']
        ] as const) {
            implementations
                .implement(SERVER_UI, className, 'constructor', (call) => {
                    const options = this.optionsOf(call, call.args[1]);
                    const id = this.nextId++;
                    const state = this.observableState(kind, call, options.clientWritable === true);
                    this.observables.set(id, state);
                    return `${OBSERVABLE_STATE}${id}`;
                })
                .implement(SERVER_UI, className, 'getData', (call) => this.observable(call).value)
                .implement(SERVER_UI, className, 'setData', (call) => {
                    const id = observableOf(call, call.self);
                    const observable = this.observable(call);
                    this.setObservable(observable, this.observableValue(observable.kind, call));
                    if (id !== undefined) this.publish(id, observable);
                    return undefined;
                })
                .implement(SERVER_UI, className, 'subscribe', (call) => {
                    const callback = this.callbackOf(call, 0, 'subscribe');
                    this.observable(call).subscribers.push(callback);
                    return callback;
                })
                .implement(SERVER_UI, className, 'unsubscribe', (call) => {
                    const observable = this.observable(call);
                    const callback = this.callbackOf(call, 0, 'unsubscribe');
                    const at = observable.subscribers.findIndex((each) => this.same(call, each, callback));
                    call.engine.free(callback);
                    if (at < 0) return false;
                    for (const removed of observable.subscribers.splice(at, 1)) call.engine.free(removed);
                    return true;
                });
        }

        const customMembers = [
            'button',
            'closeButton',
            'divider',
            'dropdown',
            'header',
            'image',
            'label',
            'slider',
            'spacer',
            'textField',
            'toggle'
        ] as const satisfies readonly ScriptMemberName<typeof SERVER_UI, 'CustomForm'>[];
        const messageMembers = [
            'body',
            'button1',
            'button1WithOptions',
            'button2',
            'button2WithOptions'
        ] as const satisfies readonly ScriptMemberName<typeof SERVER_UI, 'MessageBox'>[];
        this.registerForm('custom', 'CustomFormConstructor', customMembers, (member, fn) =>
            implementations.implement(SERVER_UI, 'CustomForm', member, fn)
        );
        this.registerForm('message', 'MessageBoxConstructor', messageMembers, (member, fn) =>
            implementations.implement(SERVER_UI, 'MessageBox', member, fn)
        );
        return implementations;
    }

    private registerForm<Member extends string>(
        kind: 'custom' | 'message',
        constructorName: string,
        members: readonly Member[],
        implement: (
            member: Member | 'constructor' | 'show' | 'isShowing' | 'close',
            fn: (call: ScriptCall) => ScriptValue
        ) => void
    ): void {
        implement('constructor', (call) => {
            const pack = this.packOf(call);
            const player = pack.player(call.args[0]);
            // BDS checks the player as it builds the form, naming the constructor's native function.
            if (player?.present !== true)
                throw invalidEntity('call', constructorName, { id: player?.id ?? '', typeId: PLAYER });
            const id = this.nextId++;
            this.forms.set(id, {
                id,
                kind,
                pack,
                player: player.id,
                title: this.textField(call, call.args[1], 1),
                controls: [],
                closeButton: false,
                buttons: new Map(),
                shown: false,
                settled: false,
                freed: false
            });
            return `${FORM_STATE}${id}`;
        });
        implement('show', (call) => {
            const form = this.formOf(call);
            if (form.shown || form.settled) throw this.visibilityError(form, 'AlreadyShowing');
            if (!this.host.players().includes(form.player))
                throw invalidEntity('call', 'show', { id: form.player, typeId: PLAYER });
            form.shown = true;
            form.formId = this.host.nextFormId();
            form.deferred = form.pack.forms.deferred();
            const promise = form.pack.forms.returning(form.deferred.promise);
            const screen = this.screenOf(form);
            // A world or a client that cannot show a data-driven screen reads to a script as a
            // client busy with something else, rather than as a promise that never settles.
            if (this.host.channel?.showDataDriven?.(form.player, form.formId, screen) === true) {
                this.open.set(form.formId, form);
            } else {
                this.resolve(form, 'UserBusy');
                this.release(form);
            }
            return promise;
        });
        implement('isShowing', (call) => {
            const form = this.formOf(call);
            return form.shown && !form.settled;
        });
        implement('close', (call) => {
            const form = this.formOf(call);
            if (!form.shown || form.settled || form.formId === undefined)
                throw this.visibilityError(form, 'NotShowing');
            // The form settles once the client reports it closed, as on BDS, and shows until then.
            this.host.channel?.closeDataDriven?.(form.player, form.formId);
            return undefined;
        });
        for (const member of members)
            implement(member, (call) => {
                const form = this.formOf(call);
                if (form.shown || form.settled)
                    throw uiError('InvalidFormModificationError', 'Cannot modify a form being shown.', {
                        formId: String(form.formId ?? '')
                    });
                this.build(form, member, call);
                return call.self;
            });
    }

    /**
     * Applies the client writes, clicks and closes the input step admitted, and rejects the screens
     * of players who left. The `settle` callback runs each in its pack's context, as the older
     * forms' answers do.
     */
    public update(
        responses: readonly DataDrivenResponse[],
        players: readonly string[],
        settle: SettleInPack<Owner>
    ): void {
        for (const response of responses) {
            if ('reason' in response) this.closed(response.player, response.formId, response.reason, settle);
            else this.written(response.player, response.property, response.path, response.value, settle);
        }
        const present = new Set(players);
        // BDS rejects a leaving player's screens newest first.
        for (const [id, form] of [...this.open].reverse()) {
            if (present.has(form.player)) continue;
            this.open.delete(id);
            settle(form.pack.owner, () =>
                this.reject(form, 'PlayerLeftError', 'was rejected because the player left.')
            );
            this.release(form);
        }
    }

    /** Forgets every screen without settling it, as a reload or shutdown does. */
    public clear(): void {
        for (const form of this.open.values()) this.release(form);
        this.open.clear();
    }

    /** Frees the handles a loaded pack still holds, when the pack goes away. */
    public clearOwner(owner: Owner): void {
        for (const [id, form] of this.forms) {
            if (form.pack.owner !== owner) continue;
            this.forms.delete(id);
            this.freeControls(form);
        }
        for (const [id, observable] of this.observables) {
            if (observable.owner !== owner) continue;
            this.observables.delete(id);
            for (const callback of observable.subscribers) this.host.engine.free(callback);
        }
    }

    /** Settles a screen the client reported closed. */
    private closed(player: string, formId: number, reason: DataDrivenCloseReason, settle: SettleInPack<Owner>): void {
        const form = this.open.get(formId);
        if (form === undefined || form.player !== player) return;
        this.open.delete(formId);
        settle(form.pack.owner, () => {
            if (reason === 'invalidform') this.reject(form, 'InvalidFormError', 'is not valid and could not be shown.');
            else this.resolve(form, CLOSED_REASONS[reason], form.selection);
        });
        this.release(form);
    }

    /**
     * Applies a client write to one path of a shown form's property: a click runs a custom form
     * button's callback or picks a message box button, and a value sets the client-writable
     * observable the path follows when its type fits. BDS runs a disabled button's callback too.
     * Any other write is dropped without changing a value.
     */
    private written(
        player: string,
        property: string,
        path: string,
        value: DataDrivenLeaf,
        settle: SettleInPack<Owner>
    ): void {
        const form = [...this.open.values()].find((each) => each.property === property && each.player === player);
        if (form === undefined) return;
        const click = CONTROL_CLICK.exec(path);
        if (click !== null && form.kind === 'custom') {
            const callback = form.controls[Number(click[1])]?.callback;
            if (callback !== undefined) settle(form.pack.owner, () => this.invoke(callback));
            return;
        }
        const button = MESSAGE_CLICK.exec(path);
        if (button !== null && form.kind === 'message') {
            form.selection = Number(button[1]);
            return;
        }
        for (const [id, paths] of form.bindings ?? []) {
            if (!paths.includes(path)) continue;
            const observable = this.observables.get(id);
            if (observable === undefined || observable.kind === 'raw' || !observable.clientWritable) return;
            if (
                (observable.kind === 'boolean' && typeof value === 'boolean') ||
                (observable.kind === 'number' && typeof value === 'number') ||
                (observable.kind === 'string' && typeof value === 'string')
            )
                settle(form.pack.owner, () => {
                    this.setObservable(observable, value);
                    // The client already shows the value at the path it wrote.
                    this.publish(id, observable, { form, path });
                });
            return;
        }
    }

    private packOf(call: ScriptCall): DataDrivenPack<Owner> {
        const pack = call.packId === undefined ? undefined : this.host.pack(call.packId);
        if (pack === undefined) throw uiError('InvalidFormError', 'The script pack is gone.', { formId: '' });
        return pack;
    }

    /** Whether two handles hold the same script function, which a new handle may not share an id with. */
    private same(call: ScriptCall, first: ScriptHandle, second: ScriptHandle): boolean {
        const same = call.engine.evaluate('(a, b) => a === b');
        if (!(same instanceof ScriptHandle)) return false;
        try {
            return call.engine.call(same, undefined, first, second) === true;
        } finally {
            call.engine.free(same);
        }
    }

    private observable(call: ScriptCall): ObservableState<Owner> {
        const id = observableOf(call, call.self);
        const found = id === undefined ? undefined : this.observables.get(id);
        if (found === undefined) throw uiError('InvalidObservableError', 'Invalid Observable.');
        return found;
    }

    private formOf(call: ScriptCall): StoredForm<Owner> {
        if (!(call.self instanceof ScriptHandle) || !call.state.startsWith(FORM_STATE))
            throw uiError('InvalidFormError', 'Invalid form.', { formId: '' });
        const id = Number(call.state.slice(FORM_STATE.length));
        const form = this.forms.get(id);
        if (form === undefined) throw uiError('InvalidFormError', 'Invalid form.', { formId: '' });
        return form;
    }

    /** Makes an observable of one kind, with the value the binding has already checked. */
    private observableState(kind: ObservableKind, call: ScriptCall, clientWritable: boolean): ObservableState<Owner> {
        const base = { clientWritable, owner: this.packOf(call).owner, subscribers: [] };
        switch (kind) {
            case 'boolean':
                return { ...base, kind, value: typeof call.args[0] === 'boolean' ? call.args[0] : false };
            case 'number':
                return { ...base, kind, value: typeof call.args[0] === 'number' ? call.args[0] : 0 };
            case 'string':
                return { ...base, kind, value: typeof call.args[0] === 'string' ? call.args[0] : '' };
            case 'raw':
                return { ...base, kind, value: call.stringify(call.args[0]) ?? '{}' };
        }
    }

    /** The value of one kind, as the binding has already checked it. */
    private observableValue(kind: ObservableKind, call: ScriptCall): string | number | boolean {
        switch (kind) {
            case 'boolean':
                return typeof call.args[0] === 'boolean' ? call.args[0] : false;
            case 'number':
                return typeof call.args[0] === 'number' ? call.args[0] : 0;
            case 'string':
                return typeof call.args[0] === 'string' ? call.args[0] : '';
            case 'raw':
                return call.stringify(call.args[0]) ?? '{}';
        }
    }

    private setObservable(observable: ObservableState<Owner>, value: string | number | boolean): void {
        switch (observable.kind) {
            case 'boolean':
                if (typeof value === 'boolean') observable.value = value;
                break;
            case 'number':
                if (typeof value === 'number') observable.value = value;
                break;
            case 'string':
            case 'raw':
                if (typeof value === 'string') observable.value = value;
                break;
        }
        this.notify(observable);
    }

    /**
     * Sends an observable's new value to every path of a shown form that follows it, but the one a
     * client wrote it at.
     */
    private publish(
        id: number,
        observable: ObservableState<Owner>,
        from?: { readonly form: StoredForm<Owner>; readonly path: string }
    ): void {
        const value = this.leafOf(observable);
        for (const form of this.open.values()) {
            if (form.property === undefined) continue;
            for (const path of form.bindings?.get(id) ?? []) {
                if (form === from?.form && path === from.path) continue;
                this.host.channel?.updateDataDriven?.(form.player, form.property, { path, value });
            }
        }
    }

    /** An observable's value as one path of a property carries it; a `UIRawMessage` travels as its JSON text. */
    private leafOf(observable: ObservableState<Owner>): DataDrivenLeaf {
        return observable.kind === 'raw' ? `${observable.value}\n` : observable.value;
    }

    /** An observable's value inside a whole property, where a `UIRawMessage` is an object. */
    private treeOf(observable: ObservableState<Owner>): DataDrivenValue {
        if (observable.kind !== 'raw') return observable.value;
        // The value is JSON the engine wrote.
        return valueOfJson(JSON.parse(observable.value));
    }

    private optionsOf(call: ScriptCall, value: ScriptValue | undefined): Record<string, unknown> {
        const json = value === undefined || !(value instanceof ScriptHandle) ? undefined : call.stringify(value);
        if (json === undefined) return {};
        const parsed: unknown = JSON.parse(json);
        return isRecord(parsed) ? parsed : {};
    }

    /**
     * A text argument as a field: a string, a `UIRawMessage` object, or an observable it follows,
     * kept apart so a label bound to an observable never sends its id as display text.
     */
    private textField(call: ScriptCall, value: ScriptValue | undefined, argument: number): Field {
        if (typeof value === 'string') return { value };
        if (!(value instanceof ScriptHandle)) return { value: '' };
        const observable = observableOf(call, value);
        if (observable !== undefined) return { observable };
        const json = call.stringify(value);
        if (json === undefined) throw new ScriptHostErrors.TextConversionFailed({ argument });
        // The engine wrote the string with JSON.stringify. BDS puts a message that is not a
        // `rawtext` list into one, so `{ translate }` reaches the client as `{ rawtext: [{ translate }] }`.
        const message = valueOfJson(JSON.parse(json));
        return { value: isRecord(message) && !('rawtext' in message) ? { rawtext: [message] } : message };
    }

    /** An input control's observable, which must be client-writable and hold the control's kind. */
    private boundObservable(call: ScriptCall, value: ScriptValue | undefined, kind: ObservableKind): Field {
        const id = value === undefined ? undefined : observableOf(call, value);
        const observable = id === undefined ? undefined : this.observables.get(id);
        if (id === undefined || observable === undefined || observable.kind !== kind || !observable.clientWritable)
            throw uiError('InvalidObservableError', 'Invalid Observable.');
        return { observable: id };
    }

    /** A number argument, or the number observable it follows. */
    private numberField(call: ScriptCall, value: ScriptValue | undefined, fallback: number): Field {
        const id = value === undefined ? undefined : observableOf(call, value);
        if (id !== undefined && this.observables.get(id)?.kind === 'number') return { observable: id };
        return { value: typeof value === 'number' ? value : fallback };
    }

    /** A boolean argument, or the boolean observable it follows. */
    private booleanField(call: ScriptCall, value: ScriptValue | undefined, fallback: boolean): Field {
        const id = value === undefined ? undefined : observableOf(call, value);
        if (id !== undefined && this.observables.get(id)?.kind === 'boolean') return { observable: id };
        return { value: typeof value === 'boolean' ? value : fallback };
    }

    /**
     * Reads one property of an options or item object, as the script value it holds, so an
     * observable keeps its handle. Undefined when the object or the property is absent.
     */
    private property<T>(
        call: ScriptCall,
        object: ScriptValue | undefined,
        key: string,
        read: (value: ScriptValue) => T
    ): T | undefined {
        if (!(object instanceof ScriptHandle)) return undefined;
        const value = call.engine.get(object, key);
        try {
            return value === undefined || value === null ? undefined : read(value);
        } finally {
            if (value instanceof ScriptHandle) call.engine.free(value);
        }
    }

    /**
     * The fields a control's options add, in the order BDS lists them: `description`, `disabled`
     * and `tooltip` only when the script passed them, `visible` always.
     */
    private optionFields(
        call: ScriptCall,
        options: ScriptValue | undefined,
        keys: readonly ('description' | 'disabled' | 'tooltip')[]
    ): (readonly [string, Field])[] {
        const fields: (readonly [string, Field])[] = [];
        for (const key of keys) {
            const field = this.property(call, options, key, (value) =>
                key === 'disabled' ? this.booleanField(call, value, false) : this.textField(call, value, 0)
            );
            if (field !== undefined) fields.push([key, field]);
        }
        const visible = this.property(call, options, 'visible', (value) => this.booleanField(call, value, true));
        fields.push(['visible', visible ?? { value: true }]);
        return fields;
    }

    /** Adds what one builder call says to a form. */
    private build(form: StoredForm<Owner>, member: string, call: ScriptCall): void {
        const { args } = call;
        if (form.kind === 'message') {
            if (member === 'body') {
                form.body = this.textField(call, args[0], 0);
                return;
            }
            const key = member.startsWith('button1') ? 'button1' : 'button2';
            const fields: (readonly [string, Field])[] = [
                ['label', this.textField(call, args[0], 0)],
                ['onClick', { value: 0 }]
            ];
            const tooltip = args[1];
            if (tooltip !== undefined && tooltip !== null) fields.push(['tooltip', this.textField(call, tooltip, 1)]);
            form.buttons.set(key, fields);
            return;
        }
        const text = (index: number): Field => this.textField(call, args[index], index);
        switch (member) {
            case 'closeButton':
                form.closeButton = true;
                return;
            case 'header':
            case 'label':
                this.add(form, member, [['text', text(0)], ...this.optionFields(call, args[1], [])]);
                return;
            case 'divider':
            case 'spacer':
                this.add(form, member, this.optionFields(call, args[0], []));
                return;
            case 'button':
                this.add(
                    form,
                    member,
                    [
                        ['label', text(0)],
                        ['onClick', { value: 0 }],
                        ...this.optionFields(call, args[2], ['tooltip', 'disabled'])
                    ],
                    this.callbackOf(call, 1, 'button')
                );
                return;
            case 'toggle':
                this.add(form, member, [
                    ['label', text(0)],
                    ['toggled', this.boundObservable(call, args[1], 'boolean')],
                    ...this.optionFields(call, args[2], ['description', 'disabled'])
                ]);
                return;
            case 'slider':
                this.add(form, member, [
                    ['label', text(0)],
                    ['value', this.boundObservable(call, args[1], 'number')],
                    ['minValue', this.numberField(call, args[2], 0)],
                    ['maxValue', this.numberField(call, args[3], 0)],
                    [
                        'step',
                        this.property(call, args[4], 'step', (value) => this.numberField(call, value, 1)) ?? {
                            value: 1
                        }
                    ],
                    ...this.optionFields(call, args[4], ['description', 'disabled'])
                ]);
                return;
            case 'dropdown':
                this.add(form, member, [
                    ['label', text(0)],
                    ['value', this.boundObservable(call, args[1], 'number')],
                    ['items', { value: indexed(this.itemsOf(call, args[2])) }],
                    ...this.optionFields(call, args[3], ['description', 'disabled'])
                ]);
                return;
            case 'textField':
                this.add(form, member, [
                    ['label', text(0)],
                    ['text', this.boundObservable(call, args[1], 'string')],
                    ...this.optionFields(call, args[2], ['description', 'disabled'])
                ]);
                return;
            case 'image': {
                // An image's own fields carry an `image_` prefix, and a click writes `image_onClick`.
                const onClick = this.property(call, args[2], 'onClick', (value) =>
                    value instanceof ScriptHandle ? call.engine.duplicate(value) : undefined
                );
                const tooltip = this.property(call, args[2], 'tooltip', (value) => this.textField(call, value, 2));
                this.add(
                    form,
                    member,
                    [
                        ['image_src', text(0)],
                        ['image_pack', text(1)],
                        [
                            'image_width',
                            this.property(call, args[2], 'width', (value) => this.numberField(call, value, 1)) ?? {
                                value: 1
                            }
                        ],
                        ...(tooltip === undefined ? [] : [['image_tooltip', tooltip] as const]),
                        ...(onClick === undefined
                            ? []
                            : [
                                  ['image_clickable', { value: true }] as const,
                                  ['image_onClick', { value: 0 }] as const
                              ]),
                        ...this.optionFields(call, args[2], [])
                    ],
                    onClick
                );
                return;
            }
        }
    }

    /** Adds a control, with the marker field BDS gives each kind, such as `slider_visible`. */
    private add(
        form: StoredForm<Owner>,
        type: string,
        fields: (readonly [string, Field])[],
        callback?: ScriptHandle
    ): void {
        const marker = `${type === 'textField' ? 'textfield' : type}_visible`;
        form.controls.push({ type, fields: [...fields, [marker, { value: true }]], callback });
    }

    /**
     * A dropdown's items, each with its label, value and description. An item's text is copied
     * when the dropdown is built: BDS does not update it when an observable it names changes.
     */
    private itemsOf(call: ScriptCall, items: ScriptValue | undefined): DataDrivenValue[] {
        if (!(items instanceof ScriptHandle)) return [];
        const length = this.property(call, items, 'length', (value) => (typeof value === 'number' ? value : 0)) ?? 0;
        const read: DataDrivenValue[] = [];
        for (let index = 0; index < length; index++) {
            const item = call.engine.get(items, String(index));
            try {
                const snapshot = (key: string): DataDrivenValue | undefined =>
                    this.property(call, item, key, (value) => this.snapshot(this.textField(call, value, 2)));
                const label = snapshot('label');
                const description = snapshot('description');
                const value = this.property(call, item, 'value', (each) => (typeof each === 'number' ? each : 0));
                read.push({
                    label: label ?? '',
                    value: value ?? 0,
                    ...(description === undefined ? {} : { description })
                });
            } finally {
                if (item instanceof ScriptHandle) call.engine.free(item);
            }
        }
        return read;
    }

    /** A field's value now. */
    private snapshot(field: Field): DataDrivenValue {
        if ('value' in field) return field.value;
        const observable = this.observables.get(field.observable);
        return observable === undefined ? null : this.treeOf(observable);
    }

    private callbackOf(call: ScriptCall, index: number, member: string): ScriptHandle {
        const callback = call.args[index];
        if (!(callback instanceof ScriptHandle))
            throw uiError('InvalidFormError', `${member} needs a callback.`, { formId: '' });
        // The handle a call receives dies with the call; keep one for later clicks and writes.
        return call.engine.duplicate(callback);
    }

    private visibilityError(form: StoredForm<Owner>, reason: 'AlreadyShowing' | 'NotShowing') {
        return uiError('FormVisibilityError', `Form is ${reason.toLowerCase()}.`, {
            formId: String(form.formId ?? ''),
            reason
        });
    }

    /**
     * The form's data store property, laid out as BDS lays it out, and the paths that follow
     * observables. A `UIRawMessage` observable's path is also sent as an update before the screen
     * opens, as BDS does.
     */
    private screenOf(form: StoredForm<Owner>): DataDrivenScreen {
        const instance = this.nextInstance++;
        const property = `${PROPERTY_PREFIXES[form.kind]}${instance}`;
        const bindings = new Map<number, string[]>();
        const resolve = (path: string, field: Field): DataDrivenValue => {
            if ('observable' in field)
                bindings.set(field.observable, [...(bindings.get(field.observable) ?? []), path]);
            return this.snapshot(field);
        };
        const record = (prefix: string, fields: readonly (readonly [string, Field])[]): DataDrivenRecord =>
            Object.fromEntries(fields.map(([key, field]) => [key, resolve(`${prefix}${key}`, field)]));

        const title = resolve('title', form.title);
        let value: DataDrivenRecord;
        if (form.kind === 'custom') {
            value = {
                title,
                style_id: STYLE_ID,
                closeButton: { label: 'Close', onClick: 0, visible: form.closeButton, button_visible: true },
                layout: indexed(form.controls.map((control, index) => record(`layout[${index}].`, control.fields)))
            };
        } else {
            const button = (key: 'button1' | 'button2'): DataDrivenRecord => ({
                ...record(
                    `${key}.`,
                    form.buttons.get(key) ?? [
                        ['label', { value: '' }],
                        ['onClick', { value: 0 }]
                    ]
                ),
                visible: true
            });
            value = {
                title,
                style_id: STYLE_ID,
                body: resolve('body', form.body ?? { value: '' }),
                is_vertical: true,
                is_horizontal: false,
                button1: button('button1'),
                button2: button('button2'),
                button3: { label: '', onClick: 0, visible: false }
            };
        }
        form.property = property;
        form.bindings = bindings;
        const updates = [...bindings].flatMap(([id, paths]) => {
            const observable = this.observables.get(id);
            if (observable?.kind !== 'raw') return [];
            return paths.map((path) => ({ path, value: this.leafOf(observable) }));
        });
        return { screenId: SCREEN_IDS[form.kind], property, instance, value, updates };
    }

    private resolve(form: StoredForm<Owner>, reason: ClosedReason, selection?: number): void {
        if (form.deferred === undefined) return;
        // A message box settles with a `MessageBoxResult`, a plain object of the pack's realm.
        const value =
            form.kind === 'custom'
                ? reason
                : form.pack.forms.parsed(
                      JSON.stringify({ closeReason: reason, ...(selection === undefined ? {} : { selection }) })
                  );
        try {
            this.host.engine.call(form.deferred.resolve, undefined, value);
        } finally {
            if (value instanceof ScriptHandle) this.host.engine.free(value);
            this.host.engine.free(form.deferred.resolve);
            this.host.engine.free(form.deferred.reject);
            form.deferred = undefined;
        }
    }

    /** Rejects `show()` with one of the errors BDS words after the screen id, such as `PlayerLeftError`. */
    private reject(form: StoredForm<Owner>, errorClass: 'InvalidFormError' | 'PlayerLeftError', words: string): void {
        if (form.deferred === undefined) return;
        const error = form.pack.api.makeError(
            new ScriptApiError(SERVER_UI, errorClass, `'${SCREEN_IDS[form.kind]}' ${words}`, {
                formId: String(form.formId ?? 0)
            })
        );
        try {
            this.host.engine.call(form.deferred.reject, undefined, error);
        } finally {
            this.host.engine.free(error);
            this.host.engine.free(form.deferred.resolve);
            this.host.engine.free(form.deferred.reject);
            form.deferred = undefined;
        }
    }

    private release(form: StoredForm<Owner>): void {
        form.shown = false;
        form.settled = true;
        if (form.deferred !== undefined) {
            this.host.engine.free(form.deferred.resolve);
            this.host.engine.free(form.deferred.reject);
            form.deferred = undefined;
        }
        this.freeControls(form);
    }

    private freeControls(form: StoredForm<Owner>): void {
        if (form.freed) return;
        form.freed = true;
        for (const control of form.controls)
            if (control.callback instanceof ScriptHandle) this.host.engine.free(control.callback);
    }

    /** Calls a script callback and frees the handle it returned, if any. */
    private invoke(callback: ScriptHandle, args: readonly ScriptValue[] = []): void {
        const returned = this.host.engine.call(callback, undefined, ...args);
        if (returned instanceof ScriptHandle) this.host.engine.free(returned);
    }

    /** Calls every subscriber of an observable with its value, in the pack's context. */
    private notify(observable: ObservableState<Owner>): void {
        for (const callback of observable.subscribers) this.invoke(callback, [observable.value]);
    }
}
