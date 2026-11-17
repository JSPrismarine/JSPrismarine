/**
 * The `json` pack of the `form-json` scenario. Once the scenario's client has joined, the pack
 * shows it forms whose text, numbers, raw messages and icons test how BDS writes form JSON: its
 * string escapes, its number format and how it writes each shape of `RawMessage`. The client
 * dismisses each form, so the record that matters is the client's: the JSON it received. The
 * steps whose builder calls BDS may refuse come last, so a refusal, which sends no form, does
 * not shift the client's answers to the forms before it.
 *
 * Every observation is stamped with tick 0, since when the client's answer arrives depends on
 * the network. `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';
import {
    ActionFormData,
    ActionFormResponse,
    FormRejectError,
    MessageFormData,
    MessageFormResponse,
    ModalFormData,
    ModalFormResponse
} from '@minecraft/server-ui';

const PACK = 'json';
/** How long a step waits for its form to settle before it records `pending` and moves on. */
const STEP_TICKS = 60;
/** How long the pack waits after the client appears, so it has finished joining. */
const JOIN_TICKS = 20;
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and tick 0. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: 0, event, ...observed })}`);
};

/** Writes a value JSON cannot hold, such as `undefined` in `formValues`, as a string that says so. */
const plain = (value) => (value === undefined ? '<undefined>' : value);

/** What a script sees of a form response. */
const describeResponse = (response) => {
    const kind =
        response instanceof ActionFormResponse
            ? 'ActionFormResponse'
            : response instanceof ModalFormResponse
              ? 'ModalFormResponse'
              : response instanceof MessageFormResponse
                ? 'MessageFormResponse'
                : String(response);
    const seen = { kind, canceled: response.canceled, cancelationReason: plain(response.cancelationReason) };
    if ('selection' in response) seen.selection = plain(response.selection);
    if ('formValues' in response) {
        seen.formValues = response.formValues === undefined ? '<undefined>' : response.formValues.map(plain);
    }
    return seen;
};

/** What a script sees of an error. */
const describeError = (error) => ({
    error: String(error),
    isFormRejectError: error instanceof FormRejectError,
    reason: plain(error?.reason)
});

/**
 * Builds a form, shows it, and records how it settles, or `pending` once `STEP_TICKS` have
 * passed. A builder call that throws is recorded, and no form is sent.
 */
const step = (name, player, build) =>
    new Promise((resolve) => {
        let settled = false;
        const finish = (observed) => {
            if (settled) {
                record(`${name} settled late`, observed);
                return;
            }
            settled = true;
            record(name, observed);
            resolve();
        };
        let shown;
        try {
            shown = build().show(player);
        } catch (error) {
            // Thrown by a builder call or by show() itself, rather than a rejection of its promise.
            finish({ value: { ...describeError(error), thrown: true } });
            return;
        }
        shown.then(
            (response) => finish({ value: describeResponse(response) }),
            (error) => finish({ value: describeError(error) })
        );
        system.runTimeout(() => {
            if (!settled) {
                settled = true;
                record(name, { value: 'pending' });
                resolve();
            }
        }, STEP_TICKS);
    });

const run = async (player) => {
    await step('escapes', player, () =>
        new ActionFormData()
            .title('tab\t cr\r bs\b ff\f one\u0001 us\u001f del\u007f backslash\\ emoji \u{1F600} ls  nbsp ')
            .body("<script> & 'single' </end>")
            .button('x')
    );
    await step('numbers', player, () =>
        new ModalFormData()
            .slider('a', 0.1, 0.2)
            .slider('b', -2.5, 1e-7)
            .slider('c', 1 / 3, 2 / 3)
            .slider('d', 123456789, 1e21)
            .slider('e', -0, 16777217)
            .slider('f', 1e-45, 0.30000001192092896)
            .slider('g', 100.5, 3.4028234663852886e38, { valueStep: 3, defaultValue: -7 })
            .slider('h', 0, 1, { valueStep: 1, defaultValue: 2147483647 })
            .slider('i', 12.75, 1000000, { valueStep: 25 })
    );
    await step('icons', player, () =>
        new ActionFormData()
            .button('empty', '')
            .button('path', 'textures/ui/icon')
            .button('spaces', 'textures/my icon é')
            .button('undefined', undefined)
    );
    await step('raw elements', player, () =>
        new ModalFormData()
            .title({ translate: 'title' })
            .textField(
                { translate: 'label' },
                { translate: 'placeholder' },
                { defaultValue: 'd', tooltip: { translate: 'tip' } }
            )
            .dropdown('d', ['a'], { tooltip: { rawtext: [{ text: 'tip' }] } })
            .slider({ text: 's' }, 0, 1, { tooltip: '' })
            .toggle('t', { defaultValue: false, tooltip: 'tip' })
            .submitButton({ translate: 'gui.ok' })
    );
    await step('called twice', player, () =>
        new ModalFormData().title('first').title('second').submitButton('first').submitButton('second').toggle('t')
    );
    await step('message twice', player, () =>
        new MessageFormData()
            .title('a')
            .body('first')
            .body('second')
            .button1('one')
            .button1('uno')
            .button2({ translate: 'two' })
    );
    await step('empty modal', player, () => new ModalFormData());
    await step('empty message', player, () => new MessageFormData());
    await step('text default raw', player, () =>
        new ModalFormData().textField('l', 'p', { defaultValue: { translate: 'd' } })
    );
    await step('dropdown default out of range', player, () =>
        new ModalFormData().dropdown('d', ['a'], { defaultValueIndex: 5 })
    );
    await step('dropdown empty', player, () => new ModalFormData().dropdown('d', []));
    await step('slider min above max', player, () => new ModalFormData().slider('s', 5, 1));
    await step('slider step 0', player, () => new ModalFormData().slider('s', 0, 1, { valueStep: 0 }));
    await step('slider step negative', player, () => new ModalFormData().slider('s', 0, 1, { valueStep: -1 }));
    await step('lone surrogate', player, () => new ActionFormData().title('lone \ud800 end'));
    // Each shape of RawMessage in a form of its own, since BDS refuses some of them.
    const rawMessages = [
        ['empty rawtext', { rawtext: [] }],
        ['text and translate', { text: 'a', translate: 'b' }],
        ['text and rawtext', { text: 'a', rawtext: [{ text: 'b' }] }],
        ['nested rawtext', { rawtext: [{ rawtext: [{ text: 'nested' }] }] }],
        ['with a raw message', { translate: 't', with: { rawtext: [{ text: 'y' }] } }],
        ['with an empty list', { translate: 't', with: [] }],
        ['with two strings', { translate: 't', with: ['a', 'b'] }],
        ['score', { score: { name: '*', objective: 'obj' } }],
        ['empty object', {}],
        ['empty text', { text: '' }],
        ['unknown key', { text: 'x', extra: 1 }],
        ['rawtext of strings', { rawtext: ['a'] }],
        ['rawtext holding an empty object', { rawtext: [{}] }]
    ];
    for (const [name, message] of rawMessages) {
        await step(`raw message: ${name}`, player, () => new ActionFormData().button(message));
    }
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
};

record('ready for the client');
const waiting = system.runInterval(() => {
    const [player] = world.getAllPlayers();
    if (player === undefined) return;
    system.clearRun(waiting);
    system.runTimeout(() => {
        record('client joined');
        run(player).catch((error) => record('run failed', { error: String(error) }));
    }, JOIN_TICKS);
}, 1);
