/**
 * The `ui` pack of the `forms` scenario. Once the scenario's client has joined, the pack shows it
 * one form after another and records how each `show()` settles. The client answers each form
 * with the answer the scenario lists for it, in order, and records the form JSON it received, so
 * the golden holds both sides: what the server sent, and what the script made of the answer.
 *
 * When the client's answer arrives depends on the network, so every observation is stamped with
 * tick 0 rather than `system.currentTick`. A step that never settles is recorded as `pending`
 * after `STEP_TICKS` ticks, and the last step's form makes the client leave.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';
import {
    ActionFormData,
    ActionFormResponse,
    FormRejectError,
    MessageFormData,
    MessageFormResponse,
    ModalFormData,
    ModalFormResponse,
    uiManager
} from '@minecraft/server-ui';

const PACK = 'ui';
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

/** What a script sees of a rejection. */
const describeError = (error) => ({
    error: String(error),
    isFormRejectError: error instanceof FormRejectError,
    reason: plain(error?.reason)
});

/** Shows a form and records how it settles, or `pending` once `STEP_TICKS` have passed. */
const step = (name, player, form, after) =>
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
            shown = form.show(player);
        } catch (error) {
            // Thrown by a builder call or by show() itself, rather than a rejection of its promise.
            finish({ value: { ...describeError(error), thrown: true } });
            return;
        }
        shown.then(
            (response) => finish({ value: describeResponse(response) }),
            (error) => finish({ value: describeError(error) })
        );
        after?.();
        system.runTimeout(() => {
            if (!settled) {
                settled = true;
                record(name, { value: 'pending' });
                resolve();
            }
        }, STEP_TICKS);
    });

const RAW_TITLE = { rawtext: [{ text: 'Raw ' }, { translate: 'gui.cancel', with: ['x'] }] };

const run = async (player) => {
    await step(
        'action',
        player,
        new ActionFormData()
            .title('Action title')
            .body('Body with "quotes", a slash / and é ✓\nand a newline')
            .button('Plain')
            .button('With icon', 'textures/items/apple')
            .header('A header')
            .label('A label')
            .divider()
            .button({ translate: 'gui.ok' }, 'https://example.com/icon.png')
    );
    await step('action closed', player, new ActionFormData().title(RAW_TITLE).button('Only'));
    await step(
        'modal',
        player,
        new ModalFormData()
            .title('Modal')
            .header('A header')
            .label({ translate: 'gui.ok' })
            .divider()
            .textField('Name', 'placeholder', { defaultValue: 'Steve', tooltip: 'Your name' })
            .dropdown('Pick', ['a', { translate: 'gui.ok' }, 'c'], { defaultValueIndex: 2, tooltip: 'One of three' })
            .slider('Amount', 0, 10, { valueStep: 2, defaultValue: 4, tooltip: 'Even only' })
            .toggle('On', { defaultValue: true, tooltip: 'Flip it' })
            .submitButton('Send')
    );
    await step('modal busy', player, new ModalFormData().title('Busy').toggle('x'));
    await step(
        'modal defaults',
        player,
        new ModalFormData().textField('L', 'P').dropdown('D', ['x']).slider('S', 0.5, 3.25).toggle('T')
    );
    await step(
        'message yes',
        player,
        new MessageFormData().title('Message').body('Pick one').button1('Yes').button2('No')
    );
    await step(
        'message no',
        player,
        new MessageFormData().title('Message').body('Pick one').button1('Yes').button2('No')
    );
    await step('message closed', player, new MessageFormData().title('Message').button1('Yes').button2('No'));
    await step('action out of range', player, new ActionFormData().title('Two').button('a').button('b'));
    await step('modal not an array', player, new ModalFormData().title('Bad').toggle('x'));
    await step('modal wrong types', player, new ModalFormData().title('Bad').textField('t', 'p').toggle('x'));
    await step('action empty', player, new ActionFormData());
    await step('close all forms', player, new ActionFormData().title('Closed by the server').button('x'), () =>
        system.run(() => {
            try {
                record('uiManager.closeAllForms', { value: plain(uiManager.closeAllForms(player)) });
            } catch (error) {
                record('uiManager.closeAllForms', { error: String(error) });
            }
        })
    );
    await step('player leaves', player, new ActionFormData().title('Goodbye').button('x'));
    await step('show after leaving', player, new ActionFormData().title('Gone').button('x'));
    try {
        record('uiManager.closeAllForms after leaving', { value: plain(uiManager.closeAllForms(player)) });
    } catch (error) {
        record('uiManager.closeAllForms after leaving', { error: String(error) });
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
