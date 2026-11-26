/**
 * The data-driven UI of `@minecraft/server-ui` 2.1.0 and later: `CustomForm`, `MessageBox` and the
 * four `Observable*` classes. Unlike the older builders, a data-driven form keeps its controls and
 * their reactive values while it is on screen: a button runs its callback without closing the form,
 * and `setData()` on a bound observable changes what the player sees.
 *
 * Each object's state lives in these tables, keyed by the number its constructor gave it, so the
 * callbacks it holds are freed when its pack goes away. `show()` hands a plain description of the
 * screen to the world; a world that can display data-driven screens sends back clicks, writes to
 * client-writable observables and close reasons as inputs
 * ([ADR 0009](../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)).
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
import type { DataDrivenControl, DataDrivenResponse, DataDrivenScreen, ScriptFormChannel } from './world';

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
    | { readonly kind: 'raw'; value: string }
);

/** One control of a form, as its builder call left it. */
interface StoredControl {
    /** The builder method that added it, such as `button` or `slider`. */
    type: string;
    text?: string;
    textObservable?: number;
    observable?: number;
    options?: string;
    items?: string;
    min?: number | { readonly observable: number };
    max?: number | { readonly observable: number };
    imagePack?: string;
    /** A button's callback, which a click runs without settling the form. */
    callback?: ScriptHandle;
}

/** A form the script built, before and while it is on screen. */
interface StoredForm<Owner> {
    readonly id: number;
    readonly kind: 'custom' | 'message';
    /** The pack whose script made the form, which settles its promise. */
    readonly pack: DataDrivenPack<Owner>;
    /** The player's entity id, copied out when the form was made. */
    readonly player: string;
    readonly controls: StoredControl[];
    title?: string;
    titleObservable?: number;
    /** Set once `show()` succeeds; a form can be shown only once. */
    shown: boolean;
    /** Set when the form closed, so it cannot be built on or shown again. */
    settled: boolean;
    /** Set once its callback handles have been freed, so pack teardown does not free them twice. */
    freed: boolean;
    formId?: number;
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

/** The close reasons a data-driven screen reports, as the Script API enum names them. */
type CloseReason = NonNullable<DataDrivenResponse['reason']>;

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

/**
 * The data-driven forms and observables of every pack in one runtime. One instance owns the state
 * of all the objects scripts built, and settles their promises in the pack that made them.
 */
export class DataDrivenUi<Owner> {
    private readonly observables = new Map<number, ObservableState<Owner>>();
    private readonly forms = new Map<number, StoredForm<Owner>>();
    private readonly open = new Map<number, StoredForm<Owner>>();
    private nextId = 1;

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
                    const observable = this.observable(call);
                    this.setObservable(observable, this.observableValue(observable.kind, call));
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
        this.registerForm('custom', customMembers, (member, fn) =>
            implementations.implement(SERVER_UI, 'CustomForm', member, fn)
        );
        this.registerForm('message', messageMembers, (member, fn) =>
            implementations.implement(SERVER_UI, 'MessageBox', member, fn)
        );
        return implementations;
    }

    private registerForm<Member extends string>(
        kind: 'custom' | 'message',
        members: readonly Member[],
        implement: (
            member: Member | 'constructor' | 'show' | 'isShowing' | 'close',
            fn: (call: ScriptCall) => ScriptValue
        ) => void
    ): void {
        implement('constructor', (call) => {
            const id = this.nextId++;
            const form: StoredForm<Owner> = {
                id,
                kind,
                pack: this.packOf(call),
                player: this.packOf(call).player(call.args[0])?.id ?? '',
                controls: [],
                shown: false,
                settled: false,
                freed: false
            };
            this.forms.set(id, form);
            const title = this.textBinding(call, call.args[1], 1);
            form.title = title.text;
            form.titleObservable = title.textObservable;
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
            if (this.host.channel?.showDataDriven === undefined) {
                // A world with no data-driven screens cannot show one, which reads to a script
                // as a client busy with something else rather than as a promise that never settles.
                this.resolve(form, 'UserBusy');
                this.release(form);
            } else {
                this.open.set(form.formId, form);
                this.host.channel.showDataDriven(form.player, form.formId, this.screenOf(form));
            }
            return promise;
        });
        implement('isShowing', (call) => {
            const form = this.formOf(call);
            return form.shown && !form.settled;
        });
        implement('close', (call) => {
            const form = this.formOf(call);
            if (!form.shown || form.settled) throw this.visibilityError(form, 'NotShowing');
            this.host.channel?.closeDataDriven?.(form.formId ?? 0);
            this.open.delete(form.formId ?? 0);
            this.resolve(form, 'ServerClosed');
            this.release(form);
            return undefined;
        });
        for (const member of members)
            implement(member, (call) => {
                const form = this.formOf(call);
                if (form.shown || form.settled)
                    throw uiError('InvalidFormModificationError', 'Cannot modify a form being shown.', {
                        formId: String(form.formId ?? '')
                    });
                form.controls.push(this.controlOf(member, call));
                return call.self;
            });
    }

    /**
     * Settles the screens a client clicked, closed or could not show, and those whose player left.
     * The `settle` callback runs each in its pack's context, as the older forms' answers do.
     */
    public update(
        responses: readonly DataDrivenResponse[],
        players: readonly string[],
        settle: SettleInPack<Owner>
    ): void {
        for (const response of responses) {
            const form = this.open.get(response.formId);
            if (form === undefined || form.player !== response.player) continue;
            if (response.values !== undefined)
                settle(form.pack.owner, () => {
                    for (const [key, value] of Object.entries(response.values ?? {}))
                        this.write(form, Number(key), value);
                });
            // A value subscriber may have closed the form, freeing the button callbacks it held.
            if (form.settled) continue;
            const button = response.button;
            if (button !== undefined && form.kind === 'custom') {
                const callback = form.controls.filter((each) => each.type === 'button')[button]?.callback;
                if (callback !== undefined)
                    settle(form.pack.owner, () => {
                        this.invoke(callback);
                    });
            }
            if (response.reason === undefined && !(button !== undefined && form.kind === 'message')) continue;
            this.open.delete(response.formId);
            const reason = response.reason ?? 'ClientClosed';
            settle(form.pack.owner, () => this.resolve(form, reason, button));
            this.release(form);
        }
        const present = new Set(players);
        for (const [id, form] of [...this.open]) {
            if (form.player === '' || present.has(form.player)) continue;
            this.open.delete(id);
            settle(form.pack.owner, () => this.reject(form));
            this.release(form);
        }
    }

    /** Closes every data-driven screen of a player, settling each in the pack that made it. */
    public closeAll(player: string, settle: SettleInPack<Owner>): void {
        this.host.channel?.closeAllDataDriven?.(player);
        for (const [id, form] of [...this.open]) {
            if (form.player !== player) continue;
            this.open.delete(id);
            settle(form.pack.owner, () => {
                this.resolve(form, 'ServerClosed');
                this.release(form);
            });
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

    private optionsOf(call: ScriptCall, value: ScriptValue | undefined): Record<string, unknown> {
        const json = value === undefined || !(value instanceof ScriptHandle) ? undefined : call.stringify(value);
        if (json === undefined) return {};
        const parsed: unknown = JSON.parse(json);
        return isRecord(parsed) ? parsed : {};
    }

    /**
     * Copies a text argument into literal text or a separate observable reference, so a label bound
     * to an observable never sends its id in the field that carries display text.
     */
    private textBinding(
        call: ScriptCall,
        value: ScriptValue,
        argument: number
    ): { readonly text?: string; readonly textObservable?: number } {
        if (typeof value === 'string') return { text: value };
        if (!(value instanceof ScriptHandle)) return {};
        const observable = observableOf(call, value);
        if (observable !== undefined) return { textObservable: observable };
        const json = call.stringify(value);
        if (json !== undefined) return { text: json };
        throw new ScriptHostErrors.TextConversionFailed({ argument });
    }

    private boundObservable(call: ScriptCall, value: ScriptValue, kind: ObservableKind): number {
        const id = observableOf(call, value);
        const observable = id === undefined ? undefined : this.observables.get(id);
        if (id === undefined || observable === undefined || observable.kind !== kind || !observable.clientWritable)
            throw uiError('InvalidObservableError', 'Invalid Observable.');
        return id;
    }

    private controlOf(type: string, call: ScriptCall): StoredControl {
        const control: StoredControl = { type };
        const applyText = (index: number): void => {
            const binding = this.textBinding(call, call.args[index] ?? null, index);
            control.text = binding.text;
            control.textObservable = binding.textObservable;
        };
        const options = (index: number): string | undefined => {
            const value = call.args[index];
            return value instanceof ScriptHandle ? (call.stringify(value) ?? undefined) : undefined;
        };
        switch (type) {
            case 'button':
                applyText(0);
                control.callback = this.callbackOf(call, 1, 'button');
                control.options = options(2);
                break;
            case 'button1':
            case 'button2':
            case 'button1WithOptions':
            case 'button2WithOptions':
            case 'body':
                applyText(0);
                control.options = options(1);
                break;
            case 'dropdown':
                applyText(0);
                control.observable = this.boundObservable(call, call.args[1], 'number');
                control.items = options(2);
                control.options = options(3);
                break;
            case 'slider': {
                applyText(0);
                control.observable = this.boundObservable(call, call.args[1], 'number');
                control.min = this.bound(call, call.args[2]);
                control.max = this.bound(call, call.args[3]);
                control.options = options(4);
                break;
            }
            case 'toggle':
                applyText(0);
                control.observable = this.boundObservable(call, call.args[1], 'boolean');
                control.options = options(2);
                break;
            case 'textField':
                applyText(0);
                control.observable = this.boundObservable(call, call.args[1], 'string');
                control.options = options(2);
                break;
            case 'header':
            case 'label':
                applyText(0);
                control.options = options(1);
                break;
            case 'image':
                applyText(0);
                control.imagePack = this.textBinding(call, call.args[1] ?? null, 1).text;
                control.options = options(2);
                break;
            default:
                control.options = options(0);
                break;
        }
        return control;
    }

    private bound(call: ScriptCall, value: ScriptValue): number | { readonly observable: number } {
        const id = observableOf(call, value);
        if (id !== undefined && this.observables.get(id)?.kind === 'number') return { observable: id };
        return typeof value === 'number' ? value : 0;
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

    private screenOf(form: StoredForm<Owner>): DataDrivenScreen {
        const controls: DataDrivenControl[] = form.controls.map(({ callback: _callback, ...rest }) => rest);
        return {
            kind: form.kind,
            title: form.title ?? '',
            ...(form.titleObservable === undefined ? {} : { titleObservable: form.titleObservable }),
            controls
        };
    }

    private resolve(form: StoredForm<Owner>, reason: CloseReason, button?: number): void {
        if (form.deferred === undefined) return;
        const value =
            form.kind === 'custom'
                ? reason
                : JSON.stringify({
                      ...(button === undefined ? {} : { selection: button + 1 }),
                      closeReason: reason
                  });
        try {
            this.host.engine.call(form.deferred.resolve, undefined, value);
        } finally {
            this.host.engine.free(form.deferred.resolve);
            this.host.engine.free(form.deferred.reject);
            form.deferred = undefined;
        }
    }

    private reject(form: StoredForm<Owner>): void {
        if (form.deferred === undefined) return;
        const error = form.pack.api.makeError(
            new ScriptApiError(SERVER_UI, 'PlayerLeftError', 'The player left before the form closed.', {
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

    /**
     * Applies a client write to one of the responding form's client-writable observables, and only
     * when its type fits the observable. Other writes are dropped without changing a value.
     */
    private write(form: StoredForm<Owner>, id: number, value: string | number | boolean): void {
        const observable = this.observables.get(id);
        if (
            observable === undefined ||
            observable.kind === 'raw' ||
            !observable.clientWritable ||
            !form.controls.some((control) => control.observable === id)
        )
            return;
        if (
            (observable.kind === 'boolean' && typeof value === 'boolean') ||
            (observable.kind === 'number' && typeof value === 'number') ||
            (observable.kind === 'string' && typeof value === 'string')
        )
            this.setObservable(observable, value);
    }
}
