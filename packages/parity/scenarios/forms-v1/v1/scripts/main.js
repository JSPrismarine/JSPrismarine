/**
 * The `v1` pack of the `forms-v1` scenario: the forms of the `forms` scenario built through the
 * version 1 signatures of `@minecraft/server-ui`, where a text field, dropdown, slider and toggle
 * take their default and the slider its step as plain arguments rather than an options object.
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

const PACK = 'v1';
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
    await step('v1 modal', player, () =>
        new ModalFormData()
            .title('Modal')
            .textField('Name', 'placeholder', 'Steve')
            .dropdown('Pick', ['a', { translate: 'gui.ok' }], 1)
            .slider('Amount', 0, 10, 2, 4)
            .slider('Fractional', 0.5, 2.5, 0.25, 1.25)
            .toggle('On', true)
            .submitButton('Send')
    );
    await step('v1 action', player, () =>
        new ActionFormData().title('Action').body('Body').button('Icon', 'textures/items/apple').button('Plain')
    );
    await step('v1 message', player, () =>
        new MessageFormData().title('Message').body('Body').button1('Yes').button2('No')
    );
    await step('v1 message true', player, () => new MessageFormData().title('Message').button1('Yes').button2('No'));
    await step('v1 modal defaults', player, () =>
        new ModalFormData().textField('l', 'p').slider('s', 0, 1, 0.1).dropdown('d', ['x']).toggle('t')
    );
    await step('v1 modal nulls', player, () => new ModalFormData().toggle('t').textField('l', 'p'));
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
