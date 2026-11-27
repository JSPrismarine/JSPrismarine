/**
 * The `ui` pack of the `data-driven-forms` scenario. Once the scenario's client has joined, the
 * pack shows it one `CustomForm` or `MessageBox` after another and records how each `show()`
 * settles, what the client's clicks and writes did, and what each observable holds. The client
 * plays the actions the scenario lists for each screen as soon as it is shown, and records the
 * data store changes and screens it received, so the golden holds both sides.
 *
 * When the client's writes arrive depends on the network, so every observation is stamped with
 * tick 0 rather than `system.currentTick`, and a step records what changed only once
 * `WRITE_TICKS` have passed, with the subscriber calls sorted. A step that never settles is
 * recorded as pending after `STEP_TICKS` ticks, with whether it is still showing.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';
import {
    CustomForm,
    MessageBox,
    ObservableBoolean,
    ObservableNumber,
    ObservableString,
    ObservableUIRawMessage,
    uiManager
} from '@minecraft/server-ui';

const PACK = 'ui';
/** How long a step waits for its screen to settle before it records `pending` and moves on. */
const STEP_TICKS = 60;
/** How long a step waits for the client's writes and clicks before it reads what they changed. */
const WRITE_TICKS = 20;
/** How long the pack waits after the client appears, so it has finished joining. */
const JOIN_TICKS = 20;
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and tick 0. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: 0, event, ...observed })}`);
};

const wait = (ticks) => new Promise((resolve) => system.runTimeout(resolve, ticks));

/** What a script sees of a settled `show()`: a close reason, or a message box's result. */
const describe = (value) => (typeof value === 'string' ? value : JSON.parse(JSON.stringify(value)));

/**
 * Shows a screen and records how it settles, or `pending` once `STEP_TICKS` have passed. `during`
 * runs while the screen is up.
 */
const step = (name, form, during) =>
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
            shown = form.show();
        } catch (error) {
            finish({ value: { error: String(error), thrown: true } });
            return;
        }
        shown.then(
            (value) => finish({ value: describe(value) }),
            (error) => finish({ value: { error: String(error) } })
        );
        during?.().catch((error) => record(`${name} failed`, { error: String(error) }));
        system.runTimeout(() => {
            if (!settled) {
                settled = true;
                record(name, { value: { pending: true, isShowing: form.isShowing() } });
                resolve();
            }
        }, STEP_TICKS);
    });

/** Subscribes to each observable and returns the calls so far, sorted, since their order depends on the network. */
const watch = (observables) => {
    const calls = [];
    for (const [label, observable] of Object.entries(observables))
        observable.subscribe((value) => calls.push(`${label}=${JSON.stringify(value)}`));
    return () => [...calls].sort();
};

const run = async (player) => {
    // Every control, the client writing each input and clicking both buttons, then the server
    // changing two values and closing the screen.
    const toggled = new ObservableBoolean(true, { clientWritable: true });
    const amount = new ObservableNumber(3, { clientWritable: true });
    const picked = new ObservableNumber(1, { clientWritable: true });
    const name = new ObservableString('Steve', { clientWritable: true });
    const title = new ObservableString('Bound title');
    const clicks = [];
    const calls = watch({ toggled, amount, picked, name });
    const custom = new CustomForm(player, title)
        .header('A header')
        .label({ translate: 'gui.ok' })
        .divider()
        .spacer()
        .button('Press', () => clicks.push('Press'), { tooltip: 'tip' })
        .button({ rawtext: [{ text: 'Raw' }] }, () => clicks.push('Raw'), { disabled: true })
        .toggle('On', toggled, { description: 'flip' })
        .slider('Amount', amount, 0, 10, { step: 2 })
        .dropdown('Pick', picked, [
            { label: 'a', value: 0 },
            { label: 'b', value: 1, description: 'bee' }
        ])
        .textField('Name', name, { description: 'your name' })
        .closeButton();
    await step('custom', custom, async () => {
        await wait(WRITE_TICKS);
        record('custom written', {
            value: {
                clicks: [...clicks].sort(),
                calls: calls(),
                toggled: toggled.getData(),
                amount: amount.getData(),
                picked: picked.getData(),
                name: name.getData()
            }
        });
        title.setData('Changed title');
        amount.setData(4);
        await wait(5);
        custom.close();
        record('custom isShowing after close', { value: custom.isShowing() });
    });
    record('custom isShowing after settling', { value: custom.isShowing() });

    // The defaults each builder call leaves out, closed by the client.
    const level = new ObservableNumber(5, { clientWritable: true });
    const on = new ObservableBoolean(false, { clientWritable: true });
    const text = new ObservableString('', { clientWritable: true });
    await step(
        'custom defaults',
        new CustomForm(player, 'Defaults')
            .label('l')
            .header('h')
            .button('b', () => {})
            .toggle('t', on)
            .slider('s', level, 1, 9)
            .dropdown('d', level, [{ label: 'x', value: 5 }])
            .textField('f', text)
            .divider()
            .spacer()
    );

    // Values the server changes while the screen is up, through observable options and texts.
    const visible = new ObservableBoolean(true);
    const disabled = new ObservableBoolean(false);
    const tooltip = new ObservableString('tip a');
    const sliderStep = new ObservableNumber(1);
    const max = new ObservableNumber(5);
    const rawTitle = new ObservableUIRawMessage({ rawtext: [{ text: 'A' }] });
    const labelText = new ObservableString('label a');
    const value = new ObservableNumber(2, { clientWritable: true });
    const bound = new CustomForm(player, rawTitle)
        .label(labelText, { visible })
        .button('b', () => {}, { disabled, tooltip, visible })
        .slider('s', value, 0, max, { step: sliderStep })
        .dropdown('d', value, [{ label: labelText, value: 0, description: tooltip }]);
    await step('custom bound', bound, async () => {
        await wait(5);
        visible.setData(false);
        disabled.setData(true);
        tooltip.setData('tip b');
        sliderStep.setData(3);
        max.setData(9);
        rawTitle.setData({ rawtext: [{ text: 'B' }] });
        labelText.setData('label b');
        await wait(5);
        bound.close();
        try {
            bound.close();
            record('custom bound closed twice');
        } catch (error) {
            record('custom bound closed twice', { error: String(error) });
        }
    });

    // Images, from server-ui 2.2.0: a click runs the image's callback, and a bound source or width
    // changes one path.
    const source = new ObservableString('textures/items/apple');
    const width = new ObservableNumber(20);
    const imageClicks = [];
    const images = new CustomForm(player, 'Images')
        .image('textures/items/bread', 'vanilla')
        .image(source, 'vanilla', { onClick: () => imageClicks.push('apple'), tooltip: 'an apple', width });
    await step('custom images', images, async () => {
        await wait(WRITE_TICKS);
        record('custom images clicked', { value: imageClicks });
        source.setData('textures/items/carrot');
        width.setData(40);
        await wait(5);
        images.close();
    });

    // How each close reason a client can send settles the screen.
    await step(
        'custom client closes',
        new CustomForm(player, 'Client closes').button('x', () => {})
    );
    await step('custom close button', new CustomForm(player, 'Close button').closeButton());
    await step('custom busy', new CustomForm(player, 'Busy').label('l'));
    await step('custom invalid', new CustomForm(player, 'Invalid').label('l'));
    await step('custom closed with every screen', new CustomForm(player, 'Every screen').label('l'));

    // A message box settles with the button the client clicked last before it closed.
    await step(
        'message button1',
        new MessageBox(player, 'Message').body('Pick one').button1('Yes', 'tip yes').button2('No')
    );
    await step('message button2', new MessageBox(player, 'Message').body('Pick one').button1('Yes').button2('No'));
    await step('message defaults', new MessageBox(player, 'Empty'));
    await step('message busy', new MessageBox(player, 'Busy').body('b'));

    // `uiManager.closeAllForms` closes the older forms only; the screen stays up.
    const untouched = new CustomForm(player, 'Untouched').label('x');
    await step('closeAllForms', untouched, async () => {
        await wait(5);
        record('uiManager.closeAllForms', { value: String(uiManager.closeAllForms(player)) });
        record('closeAllForms isShowing', { value: untouched.isShowing() });
        await wait(5);
        untouched.close();
    });

    // A screen the client never reports closed stays showing after the server closes it, and a
    // second screen shows while it is up. Both are still up when the client leaves.
    const unacknowledged = new CustomForm(player, 'Unacknowledged').label('x');
    await step('unacknowledged', unacknowledged, async () => {
        await wait(5);
        unacknowledged.close();
    });
    await step('second screen', new CustomForm(player, 'Second').label('x'));
    await step('player leaves', new CustomForm(player, 'Goodbye').label('x'));
    try {
        new CustomForm(player, 'Gone');
        record('form after leaving');
    } catch (error) {
        record('form after leaving', { error: String(error) });
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
