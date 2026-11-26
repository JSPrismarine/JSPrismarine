import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptHostLibrary } from '../ScriptEngine';
import { loadLibrary, scriptHostAvailable, TEST_SERVER } from '../testing/library.test-utils';
import { MemoryWorld } from '../testing/memoryWorld.test-utils';
import { readScriptConfig, readScriptPack } from './pack';
import { WorldScripts } from './WorldScripts';
import type { DataDrivenResponse, DataDrivenScreen, ScriptFormChannel, ScriptFormResponse } from './world';

/** A {@link MemoryWorld} whose form channel records data-driven screens and takes scripted answers. */
class DataDrivenWorld extends MemoryWorld implements ScriptFormChannel {
    public readonly forms = this;
    /** The id of the player online from the start. */
    public readonly player = this.join('Alex');
    public readonly screens: { readonly player: string; readonly formId: number; readonly screen: DataDrivenScreen }[] =
        [];
    public readonly closed: (number | undefined)[] = [];
    public readonly closedAll: string[] = [];
    private readonly answers: DataDrivenResponse[] = [];

    public answer(response: DataDrivenResponse): void {
        this.answers.push(response);
    }
    public show(player: string, formId: number, _json: string): void {
        void player;
        void formId;
        void _json;
    }
    public closeAll(player: string): void {
        this.closedAll.push(player);
    }
    public takeResponses(): readonly ScriptFormResponse[] {
        return [];
    }
    public showDataDriven(player: string, formId: number, screen: DataDrivenScreen): void {
        this.screens.push({ player, formId, screen });
    }
    public closeDataDriven(formId: number): void {
        this.closed.push(formId);
    }
    public closeAllDataDriven(player: string): void {
        this.closedAll.push(player);
    }
    public takeDataDrivenResponses(): readonly DataDrivenResponse[] {
        return this.answers.splice(0);
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
import { CustomForm, MessageBox, ObservableBoolean, ObservableNumber, ObservableString, uiManager } from '@minecraft/server-ui';
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
    function start(
        source: string,
        world: LegacyWorld
    ): {
        world: LegacyWorld;
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

    it('sends a CustomForm as controls and settles show() when the client closes it', () => {
        const { world, scripts, printed } = start(`
const on = new ObservableBoolean(true, { clientWritable: true });
const level = new ObservableNumber(5, { clientWritable: true });
const title = new ObservableString('Status');
const form = new CustomForm(player(), title)
    .label('Hello')
    .spacer()
    .toggle('Lights', on)
    .slider('Range', level, 1, 15, { step: 1 })
    .button('Apply', () => log('clicked'))
    .closeButton();
form.show().then((reason) => log('closed ' + reason + ' showing ' + form.isShowing()));
`);
        scripts.flush();
        expect(world.screens).toHaveLength(1);
        const { player: shown, formId, screen } = world.screens[0]!;
        expect(shown).toBe(world.player);
        expect(screen.kind).toBe('custom');
        expect(screen.title).toBe('');
        expect(screen.titleObservable).toBe(3);
        expect(screen.controls.map((each) => each.type)).toEqual([
            'label',
            'spacer',
            'toggle',
            'slider',
            'button',
            'closeButton'
        ]);
        expect(screen.controls[0]?.text).toBe('Hello');
        expect(screen.controls[2]?.observable).toBe(1);
        expect(screen.controls[3]?.observable).toBe(2);

        world.answer({ player: shown, formId, button: 0 });
        scripts.flush();
        expect(printed()).toContain('clicked');

        world.answer({ player: shown, formId, reason: 'ClientClosed' });
        scripts.flush();
        expect(printed()).toContain('closed ClientClosed showing false');
    });

    it('runs button callbacks and closes a MessageBox with a selection', () => {
        const { world, scripts, printed } = start(`
new MessageBox(player(), 'Question')
    .body('Pick one')
    .button1('Yes')
    .button2('No')
    .show()
    .then((result) => log(result));
`);
        scripts.flush();
        const { player: shown, formId, screen } = world.screens[0]!;
        expect(screen.kind).toBe('message');
        expect(screen.controls.map((each) => each.type)).toEqual(['body', 'button1', 'button2']);
        world.answer({ player: shown, formId, button: 1, reason: 'ClientClosed' });
        scripts.flush();
        expect(printed()).toEqual(['{"selection":2,"closeReason":"ClientClosed"}']);
    });

    it('applies client writes to observables and tells their subscribers', () => {
        const { world, scripts, printed } = start(`
const value = new ObservableNumber(1, { clientWritable: true });
value.subscribe((number) => log('value ' + number));
new CustomForm(player(), 'Write').slider('Number', value, 0, 10).show().then(() => log(value.getData()));
`);
        scripts.flush();
        const { player: shown, formId, screen } = world.screens[0]!;
        const id = screen.controls[0]?.observable;
        expect(id).toBeDefined();
        world.answer({ player: shown, formId, values: { [String(id)]: 7 } });
        scripts.flush();
        expect(printed()).toContain('value 7');
        world.answer({ player: shown, formId, reason: 'ClientClosed' });
        scripts.flush();
        expect(printed()).toContain('7');
    });

    it('keeps bound text separate from literals and drops client writes that do not fit', () => {
        const { world, scripts, printed } = start(`
const bound = new ObservableString('Bound');
const readOnly = new ObservableNumber(5);
const writable = new ObservableNumber(5, { clientWritable: true });
new CustomForm(player(), 'Title')
    .label(bound).label('123').slider('Number', writable, 0, 10)
    .show().then(() => log('value ' + writable.getData()));
`);
        scripts.flush();
        const { player: shown, formId, screen } = world.screens[0]!;
        expect(screen.controls[0]?.text).toBeUndefined();
        expect(screen.controls[0]?.textObservable).toBe(1);
        expect(screen.controls[1]?.text).toBe('123');
        expect(screen.controls[1]?.textObservable).toBeUndefined();
        const id = screen.controls[2]?.observable;
        expect(id).toBeDefined();
        world.answer({
            player: shown,
            formId,
            // The first two ids are read-only observables; the third gets a value of the wrong type.
            values: { '1': 'changed', '2': 99, [String(id)]: 'wrong' }
        });
        scripts.flush();
        world.answer({ player: shown, formId, reason: 'ClientClosed' });
        scripts.flush();
        expect(printed()).toEqual(['value 5']);
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

    it('closes data-driven screens with close() and uiManager.closeAllForms', () => {
        const { world, scripts, printed } = start(`
const one = new CustomForm(player(), 'One').closeButton();
one.show().then((reason) => log('one ' + reason));
uiManager.closeAllForms(player());
const two = new CustomForm(player(), 'Two');
two.show().then((reason) => log('two ' + reason));
two.close();
log('showing ' + two.isShowing());
`);
        scripts.flush();
        expect(world.closed).toEqual([world.screens[1]!.formId]);
        expect(world.closedAll).toEqual([world.player, world.player]);
        expect(printed()).toEqual(['showing false', 'one ServerClosed', 'two ServerClosed']);
    });

    it('rejects a data-driven screen when its player leaves', () => {
        const { world, scripts, printed } = start(`
new CustomForm(player(), 'Bye').show().catch((error) => log(describeError(error)));
`);
        scripts.flush();
        world.leave(world.player);
        scripts.flush();
        expect(printed()).toEqual(['{"name":"PlayerLeftError","reason":null}']);
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
