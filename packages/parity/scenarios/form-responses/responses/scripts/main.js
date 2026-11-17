/**
 * The `responses` pack of the `form-responses` scenario. Once the scenario's client has joined,
 * the pack shows it simple forms, and the client answers each with a response of another shape:
 * JSON of the wrong type, out of range or not JSON at all, an unknown cancel reason, neither a
 * response nor a reason, or both. The record shows what `show()` settles with for each, which
 * is how BDS checks a response against the form it sent.
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

const PACK = 'responses';
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

const action = () => new ActionFormData().title('Two').button('a').button('b');
const modal = () => new ModalFormData().title('Two').toggle('t').textField('l', 'p');
const message = () => new MessageFormData().title('Two').button1('a').button2('b');

const run = async (player) => {
    for (const name of [
        'action string',
        'action float',
        'action whole float',
        'action negative',
        'action boolean',
        'action array',
        'action huge',
        'action whitespace'
    ]) {
        await step(name, player, action);
    }
    for (const name of ['modal short', 'modal long', 'modal object', 'modal nulls', 'modal nested', 'modal number']) {
        await step(name, player, modal);
    }
    for (const name of ['message number', 'message string', 'message null', 'message zero']) {
        await step(name, player, message);
    }
    // An answer that is not JSON at all comes last: BDS disconnects a client that sends one.
    for (const name of [
        'cancel reason 2',
        'neither',
        'response and reason',
        'action empty text',
        'action invalid json'
    ]) {
        await step(name, player, action);
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
