import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptHostLibrary } from '../ScriptEngine';
import { loadLibrary, scriptHostAvailable, TEST_SERVER } from '../testing/library.test-utils';
import { MemoryWorld } from '../testing/memoryWorld.test-utils';
import { readScriptConfig, readScriptPack } from './pack';
import { WorldScripts } from './WorldScripts';
import type {
    DataDrivenPathValue,
    DataDrivenResponse,
    DataDrivenScreen,
    ScriptFormChannel,
    ScriptFormResponse
} from './world';

/** A {@link MemoryWorld} whose form channel records data-driven screens and takes scripted answers. */
class DataDrivenWorld extends MemoryWorld implements ScriptFormChannel {
    public readonly forms = this;
    /** The id of the player online from the start. */
    public readonly player = this.join('Alex');
    /** Whether the player's client can show a data-driven screen. */
    public canShow = true;
    public readonly screens: { readonly player: string; readonly formId: number; readonly screen: DataDrivenScreen }[] =
        [];
    public readonly updates: {
        readonly player: string;
        readonly property: string;
        readonly change: DataDrivenPathValue;
    }[] = [];
    public readonly closed: { readonly player: string; readonly formId: number }[] = [];
    public readonly closedAll: string[] = [];
    private readonly answers: DataDrivenResponse[] = [];

    public answer(response: DataDrivenResponse): void {
        this.answers.push(response);
    }
    public show(): void {}
    public closeAll(player: string): void {
        this.closedAll.push(player);
    }
    public takeResponses(): readonly ScriptFormResponse[] {
        return [];
    }
    public showDataDriven(player: string, formId: number, screen: DataDrivenScreen): boolean {
        if (!this.canShow) return false;
        this.screens.push({ player, formId, screen });
        return true;
    }
    public updateDataDriven(player: string, property: string, change: DataDrivenPathValue): void {
        this.updates.push({ player, property, change });
    }
    public closeDataDriven(player: string, formId: number): void {
        this.closed.push({ player, formId });
    }
    public takeDataDrivenResponses(): readonly DataDrivenResponse[] {
        return this.answers.splice(0);
    }

    /** The screen shown last. */
    public get shown(): { readonly player: string; readonly formId: number; readonly screen: DataDrivenScreen } {
        const last = this.screens.at(-1);
        if (last === undefined) throw new Error('no screen was shown');
        return last;
    }
}

/** A world with only the older form channel, as a server that cannot show DDUI screens has. */
class LegacyWorld extends MemoryWorld implements ScriptFormChannel {
    public readonly forms = this;
    public readonly player = this.join('Alex');
    public show(): void {}
    public closeAll(): void {}
    public takeResponses(): readonly ScriptFormResponse[] {
        return [];
    }
}

const directories: string[] = [];
afterAll(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/** Writes a pack declaring both script modules at server-ui 2.1.0 or later. */
const writePack = (source: string) => {
    const directory = mkdtempSync(join(tmpdir(), 'jsp-world-ddui-'));
    directories.push(directory);
    mkdirSync(join(directory, 'scripts'));
    writeFileSync(
        join(directory, 'manifest.json'),
        JSON.stringify({
            header: { name: 'ddui', uuid: 'aac52733-889b-4c87-abcb-f064ea7735a2', version: [1, 0, 0] },
            modules: [{ type: 'script', uuid: '13f251b3-41c9-4271-b2d1-d4abde28890b', entry: 'scripts/main.js' }],
            dependencies: [
                { module_name: '@minecraft/server', version: '2.0.0' },
                { module_name: '@minecraft/server-ui', version: '2.3.0' }
            ]
        })
    );
    writeFileSync(join(directory, 'scripts', 'main.js'), PRELUDE + `system.run(() => {\n${source}\n});`);
    const pack = readScriptPack(directory);
    if (pack === undefined) throw new Error('the pack has a script module');
    return pack;
};

const PRELUDE = `
import { system, world } from '@minecraft/server';
import { CustomForm, MessageBox, ObservableBoolean, ObservableNumber, ObservableString, ObservableUIRawMessage, uiManager } from '@minecraft/server-ui';
const log = (line) => console.warn(typeof line === 'string' ? line : JSON.stringify(line));
const player = () => world.getAllPlayers()[0];
const describeError = (error) => ({ name: error.name, reason: error.reason ?? null });
`;

describe.skipIf(!scriptHostAvailable())("WorldScripts's data-driven @minecraft/server-ui", () => {
    let library: ScriptHostLibrary;
    beforeAll(() => {
        library = loadLibrary();
    });
    const running: WorldScripts[] = [];
    afterEach(() => {
        for (const scripts of running.splice(0)) scripts.shutdown();
    });

    function start(source: string): {
        world: DataDrivenWorld;
        scripts: WorldScripts;
        printed: () => string[];
        infos: () => string[];
    };
    function start<World extends DataDrivenWorld | LegacyWorld>(
        source: string,
        world: World
    ): {
        world: World;
        scripts: WorldScripts;
        printed: () => string[];
        infos: () => string[];
    };
    function start(source: string, world: DataDrivenWorld | LegacyWorld = new DataDrivenWorld()) {
        const lines: string[] = [];
        const infos: string[] = [];
        const scripts = new WorldScripts({
            server: TEST_SERVER,
            library,
            world,
            packs: [writePack(source)],
            config: readScriptConfig(undefined),
            log: {
                info: (line: string) => infos.push(line),
                warn: (line: string) => lines.push(line),
                error: (line: string) => lines.push(line)
            },
            seed: 1n
        });
        running.push(scripts);
        scripts.startEarly();
        scripts.startWorld();
        return {
            world,
            scripts,
            printed: () => lines.map((line) => line.replace(/^\[Scripting\] /, '')),
            infos: () => infos
        };
    }

    it('copies observable values, callbacks and subscriptions', () => {
        const { scripts, printed } = start(`
const name = new ObservableString('Steve', { clientWritable: true });
const seen = [];
const callback = (value) => seen.push(value);
name.subscribe(callback);
name.setData('Alex');
log(name.getData());
log(name.unsubscribe(callback));
name.setData('Again');
log(seen);
const count = new ObservableNumber(1, { clientWritable: true });
count.subscribe((value) => log('count ' + value));
count.setData(2.5);
const on = new ObservableBoolean(false, { clientWritable: true });
on.subscribe((value) => log('on ' + value));
on.setData(true);
`);
        scripts.flush();
        expect(printed()).toEqual(['Alex', 'true', '["Alex"]', 'count 2.5', 'on true']);
    });

    it("sends a CustomForm as BDS's data store property and settles show() when the client closes it", () => {
        const { world, scripts, printed } = start(`
const on = new ObservableBoolean(true, { clientWritable: true });
const level = new ObservableNumber(5, { clientWritable: true });
const title = new ObservableString('Status');
const form = new CustomForm(player(), title)
    .label('Hello')
    .toggle('Lights', on, { description: 'flip' })
    .slider('Range', level, 1, 15)
    .button({ rawtext: [{ text: 'Apply' }] }, () => log('clicked'), { tooltip: 'tip' })
    .closeButton();
form.show().then((reason) => log('closed ' + reason + ' showing ' + form.isShowing()));
`);
        scripts.flush();
        const { player: shown, formId, screen } = world.shown;
        expect(shown).toBe(world.player);
        expect(screen).toEqual({
            screenId: 'minecraft:custom_form',
            property: `custom_form_data_${screen.instance}`,
            instance: screen.instance,
            value: {
                title: 'Status',
                style_id: 'modalForm',
                closeButton: { label: 'Close', onClick: 0, visible: true, button_visible: true },
                layout: {
                    '0': { text: 'Hello', visible: true, label_visible: true },
                    '1': { label: 'Lights', toggled: true, description: 'flip', visible: true, toggle_visible: true },
                    '2': {
                        label: 'Range',
                        value: 5,
                        minValue: 1,
                        maxValue: 15,
                        step: 1,
                        visible: true,
                        slider_visible: true
                    },
                    '3': {
                        label: { rawtext: [{ text: 'Apply' }] },
                        onClick: 0,
                        tooltip: 'tip',
                        visible: true,
                        button_visible: true
                    },
                    length: 4n
                }
            },
            updates: []
        });

        world.answer({ player: shown, property: screen.property, path: 'layout[3].onClick', value: 1 });
        scripts.flush();
        expect(printed()).toEqual(['clicked']);

        world.answer({ player: shown, formId, reason: 'clientcanceled' });
        scripts.flush();
        expect(printed()).toEqual(['clicked', 'closed ClientClosed showing false']);
    });

    it('settles a MessageBox with the button the client clicked last before it closed', () => {
        const { world, scripts, printed } = start(`
new MessageBox(player(), 'Question')
    .body('Pick one')
    .button1('Yes', 'tip')
    .show()
    .then((result) => log(result));
new MessageBox(player(), 'Empty').show().then((result) => log(result));
`);
        scripts.flush();
        const [question, empty] = world.screens;
        expect(question?.screen.value).toEqual({
            title: 'Question',
            style_id: 'modalForm',
            body: 'Pick one',
            is_vertical: true,
            is_horizontal: false,
            button1: { label: 'Yes', onClick: 0, tooltip: 'tip', visible: true },
            button2: { label: '', onClick: 0, visible: true },
            button3: { label: '', onClick: 0, visible: false }
        });
        expect(question?.screen.screenId).toBe('minecraft:message_box');
        if (question === undefined || empty === undefined) return;
        world.answer({ player: world.player, property: question.screen.property, path: 'button2.onClick', value: 1 });
        world.answer({ player: world.player, property: question.screen.property, path: 'button1.onClick', value: 1 });
        world.answer({ player: world.player, formId: question.formId, reason: 'clientcanceled' });
        world.answer({ player: world.player, formId: empty.formId, reason: 'userbusy' });
        scripts.flush();
        expect(printed()).toEqual(['{"closeReason":"ClientClosed","selection":1}', '{"closeReason":"UserBusy"}']);
    });

    it('applies client writes to observables, tells their subscribers and updates the other paths', () => {
        const { world, scripts, printed } = start(`
const value = new ObservableNumber(1, { clientWritable: true });
value.subscribe((number) => log('value ' + number));
new CustomForm(player(), 'Write').slider('Number', value, 0, 10).dropdown('Pick', value, [{ label: 'a', value: 7 }])
    .show().then(() => log(value.getData()));
`);
        scripts.flush();
        const { player: shown, formId, screen } = world.shown;
        world.answer({ player: shown, property: screen.property, path: 'layout[0].value', value: 7 });
        scripts.flush();
        expect(printed()).toEqual(['value 7']);
        expect(world.updates).toEqual([
            { player: shown, property: screen.property, change: { path: 'layout[1].value', value: 7 } }
        ]);
        world.answer({ player: shown, formId, reason: 'clientcanceled' });
        scripts.flush();
        expect(printed()).toEqual(['value 7', '7']);
    });

    it('drops client writes to a read-only observable, a literal, another property or the wrong type', () => {
        const { world, scripts, printed } = start(`
const bound = new ObservableString('Bound');
const writable = new ObservableNumber(5, { clientWritable: true });
new CustomForm(player(), 'Title')
    .label(bound).label('123').slider('Number', writable, 0, 10)
    .show().then(() => log(bound.getData() + ' ' + writable.getData()));
`);
        scripts.flush();
        const { player: shown, formId, screen } = world.shown;
        const write = (path: string, value: string | number, property = screen.property): void =>
            world.answer({ player: shown, property, path, value });
        write('layout[0].text', 'changed');
        write('layout[1].text', 'changed');
        write('layout[2].value', 'wrong');
        write('layout[2].value', 9, 'custom_form_data_999');
        scripts.flush();
        world.answer({ player: shown, formId, reason: 'clientcanceled' });
        scripts.flush();
        expect(printed()).toEqual(['Bound 5']);
    });

    it("sends a bound observable's changes to each path it fills, and a raw message as JSON text", () => {
        const { world, scripts } = start(`
const visible = new ObservableBoolean(true);
const title = new ObservableUIRawMessage({ rawtext: [{ text: 'A' }] });
const max = new ObservableNumber(5);
const value = new ObservableNumber(2, { clientWritable: true });
new CustomForm(player(), title)
    .label('one', { visible }).button('two', () => {}, { visible })
    .slider('s', value, 0, max)
    .show();
system.run(() => {
    visible.setData(false);
    max.setData(9);
    title.setData({ rawtext: [{ text: 'B' }] });
});
`);
        scripts.flush();
        const { screen } = world.shown;
        expect(screen.value.title).toEqual({ rawtext: [{ text: 'A' }] });
        expect(screen.updates).toEqual([{ path: 'title', value: '{"rawtext":[{"text":"A"}]}\n' }]);
        scripts.flush();
        expect(world.updates.map((each) => each.change)).toEqual([
            { path: 'layout[0].visible', value: false },
            { path: 'layout[1].visible', value: false },
            { path: 'layout[2].maxValue', value: 9 },
            { path: 'title', value: '{"rawtext":[{"text":"B"}]}\n' }
        ]);
    });

    it('settles a closed screen only once the client reports it closed, and leaves it to closeAllForms', () => {
        const { world, scripts, printed } = start(`
const form = new CustomForm(player(), 'One');
form.show().then((reason) => log('one ' + reason + ' showing ' + form.isShowing()));
uiManager.closeAllForms(player());
form.close();
form.close();
log('showing ' + form.isShowing());
`);
        scripts.flush();
        const { player: shown, formId } = world.shown;
        expect(world.closed).toEqual([
            { player: shown, formId },
            { player: shown, formId }
        ]);
        expect(world.closedAll).toEqual([world.player]);
        expect(printed()).toEqual(['showing true']);
        world.answer({ player: shown, formId, reason: 'programmaticclose' });
        scripts.flush();
        expect(printed()).toEqual(['showing true', 'one ServerClosed showing false']);
    });

    it('rejects show() when the client reports the screen invalid', () => {
        const { world, scripts, printed } = start(`
new CustomForm(player(), 'Bad').show().catch((error) => log(String(error)));
`);
        scripts.flush();
        world.answer({ player: world.player, formId: world.shown.formId, reason: 'invalidform' });
        scripts.flush();
        expect(printed()).toEqual(["InvalidFormError: 'minecraft:custom_form' is not valid and could not be shown."]);
    });

    it("rejects a leaving player's screens newest first, and refuses a form for a player who left", () => {
        const { world, scripts, printed } = start(`
const leaving = player();
new CustomForm(leaving, 'First').show().catch((error) => log('first ' + error));
new MessageBox(leaving, 'Second').show().catch((error) => log('second ' + error));
system.run(() => {
    try { new CustomForm(leaving, 'Gone'); } catch (error) { log(String(error)); }
});
`);
        scripts.flush();
        world.leave(world.player);
        scripts.flush();
        expect(printed()).toEqual([
            "second PlayerLeftError: 'minecraft:message_box' was rejected because the player left.",
            "first PlayerLeftError: 'minecraft:custom_form' was rejected because the player left.",
            "InvalidEntityError: Failed to call function 'CustomFormConstructor' due to Entity being invalid (has the Entity been removed?)."
        ]);
    });

    it('settles show() as UserBusy when the client cannot show a data-driven screen', () => {
        const unable = new DataDrivenWorld();
        unable.canShow = false;
        const { world, scripts, printed } = start(
            `new MessageBox(player(), 'No screen').show().then((result) => log(result));`,
            unable
        );
        scripts.flush();
        expect(world.screens).toEqual([]);
        expect(printed()).toEqual(['{"closeReason":"UserBusy"}']);
    });

    it('refuses changes after show, a second show and a read-only input observable', () => {
        const { scripts, printed } = start(`
const form = new CustomForm(player(), 'Title').label('One');
form.show();
try { form.label('Two'); } catch (error) { log(describeError(error)); }
try { form.show(); } catch (error) { log(describeError(error)); }
try {
    const readOnly = new ObservableBoolean(true);
    new CustomForm(player(), 'Bad').toggle('No', readOnly);
} catch (error) { log(describeError(error)); }
`);
        scripts.flush();
        expect(printed()).toEqual([
            '{"name":"InvalidFormModificationError","reason":null}',
            '{"name":"FormVisibilityError","reason":"AlreadyShowing"}',
            '{"name":"InvalidObservableError","reason":null}'
        ]);
    });

    it('settles show() as UserBusy when the world cannot show a data-driven screen', () => {
        const { scripts, printed } = start(
            `new CustomForm(player(), 'No screen').show().then((reason) => log(reason));`,
            new LegacyWorld()
        );
        scripts.flush();
        expect(printed()).toEqual(['UserBusy']);
    });

    it('reports every member the add-on uses as implemented', () => {
        const { scripts, infos } = start(`
const value = new ObservableNumber(1, { clientWritable: true });
const message = new ObservableString('x');
const on = new ObservableBoolean(true, { clientWritable: true });
message.setData('y');
new CustomForm(player(), 'Title')
    .label(message).spacer().header('Header').toggle('Toggle', on)
    .dropdown('Drop', value, [{ label: 'a', value: 0 }])
    .slider('Slide', value, 0, 10).closeButton();
`);
        scripts.flush();
        expect(infos().filter((line) => line.includes('not implemented yet:'))).toEqual([]);
    });

    it('does report a member that is still unimplemented', () => {
        const { scripts, infos } = start(`
const message = new ObservableString('x');
message.getFilteredText(player());
`);
        scripts.flush();
        expect(infos().some((line) => line.includes('not implemented yet: getFilteredText'))).toBe(true);
    });
});
