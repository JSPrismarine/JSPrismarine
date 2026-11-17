import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptHostLibrary } from '../ScriptEngine';
import { loadLibrary, scriptHostAvailable } from '../testing/library.test.helper';
import { readScriptConfig, readScriptPack } from './pack';
import { WorldScripts } from './WorldScripts';
import { MemoryWorld } from '../testing/memoryWorld.test.helper';
import type { ScriptFormChannel, ScriptFormResponse } from './world';

/** A sent form, as the fake channel keeps it. */
interface SentForm {
    readonly player: string;
    readonly formId: number;
    readonly json: string;
}

/** A {@link MemoryWorld} with one player and a form channel that records what it sends and hands back queued answers. */
class FormWorld extends MemoryWorld implements ScriptFormChannel {
    public readonly sent: SentForm[] = [];
    public readonly closed: string[] = [];
    public readonly forms: ScriptFormChannel = this;
    /** The id of the player online from the start. */
    public readonly player = this.join('Alex');
    private readonly answers: ScriptFormResponse[] = [];

    /** A client answers a form; the next flush takes it, as the input step admits it. */
    public answer(formId: number, response: string | null, cancelReason: number | null = null, player = this.player) {
        this.answers.push({ player, formId, response, cancelReason });
    }
    public show(player: string, formId: number, json: string): void {
        this.sent.push({ player, formId, json });
    }
    public closeAll(player: string): void {
        this.closed.push(player);
    }
    public takeResponses(): readonly ScriptFormResponse[] {
        return this.answers.splice(0);
    }
}

const directories: string[] = [];
afterAll(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/** Writes a pack declaring `@minecraft/server` and `@minecraft/server-ui` at one major version. */
const writePack = (source: string, major: 1 | 2 = 2) => {
    const directory = mkdtempSync(join(tmpdir(), 'jsp-world-forms-'));
    directories.push(directory);
    mkdirSync(join(directory, 'scripts'));
    writeFileSync(
        join(directory, 'manifest.json'),
        JSON.stringify({
            header: { name: 'forms', uuid: 'aac52733-889b-4c87-abcb-f064ea7735a2', version: [1, 0, 0] },
            modules: [{ type: 'script', uuid: '13f251b3-41c9-4271-b2d1-d4abde28890b', entry: 'scripts/main.js' }],
            dependencies: [
                { module_name: '@minecraft/server', version: `${major}.0.0` },
                { module_name: '@minecraft/server-ui', version: `${major}.0.0` }
            ]
        })
    );
    writeFileSync(join(directory, 'scripts', 'main.js'), source);
    const pack = readScriptPack(directory);
    if (pack === undefined) throw new Error('the pack has a script module');
    return pack;
};

/** A script prelude: `log` writes a line the test reads back, and `player` is the first player. */
const PRELUDE = `
import { system, world } from '@minecraft/server';
import * as ui from '@minecraft/server-ui';
const log = (line) => console.warn(typeof line === 'string' ? line : JSON.stringify(line));
const describe = (response) => ({
    canceled: response.canceled,
    reason: response.cancelationReason ?? null,
    selection: 'selection' in response ? response.selection ?? null : null,
    values: 'formValues' in response ? (response.formValues ?? null) : null
});
const rejected = (error) => ({ error: String(error), reason: error.reason ?? null });
`;

describe.skipIf(!scriptHostAvailable())("WorldScripts's @minecraft/server-ui forms", () => {
    let library: ScriptHostLibrary;
    beforeAll(() => {
        library = loadLibrary();
    });
    const running: WorldScripts[] = [];
    afterEach(() => {
        for (const scripts of running.splice(0)) scripts.shutdown();
    });

    const start = (source: string, major: 1 | 2 = 2) => {
        const world = new FormWorld();
        const lines: string[] = [];
        const log = {
            info: () => {},
            warn: (line: string) => lines.push(line),
            error: (line: string) => lines.push(line)
        };
        const scripts = new WorldScripts({
            library,
            world,
            packs: [writePack(PRELUDE + source, major)],
            config: readScriptConfig(undefined),
            log,
            seed: 1n
        });
        running.push(scripts);
        scripts.startEarly();
        scripts.startWorld();
        const printed = () => lines.map((line) => line.replace(/^\[Scripting\] /, ''));
        return { world, scripts, printed };
    };

    it('sends an action form as BDS writes it and resolves show() with the selection in the next flush', () => {
        const { world, scripts, printed } = start(`
system.run(() => {
    new ui.ActionFormData().title('Pick').body('One').button('a').button('b', 'textures/x')
        .show(world.getAllPlayers()[0]).then((response) => log(describe(response)));
});`);
        scripts.flush();
        expect(world.sent).toEqual([
            {
                player: world.player,
                formId: 1,
                json:
                    '{"content":"One","elements":[{"image":null,"text":"a","type":"button"},' +
                    '{"image":{"data":"textures/x","type":"path"},"text":"b","type":"button"}],"title":"Pick","type":"form"}\n'
            }
        ]);
        expect(printed()).toEqual([]);

        world.answer(1, '1');
        scripts.flush();
        expect(printed()).toEqual(['{"canceled":false,"reason":null,"selection":1,"values":null}']);
    });

    it('resolves a modal form with its values and a canceled form with its reason', () => {
        const { world, scripts, printed } = start(`
system.run(() => {
    const player = world.getAllPlayers()[0];
    const modal = () => new ui.ModalFormData().label('l').textField('t', 'p').toggle('x');
    modal().show(player).then((response) => log(describe(response)));
    modal().show(player).then((response) => log(describe(response)));
});`);
        scripts.flush();
        world.answer(1, '[null,"typed",true]');
        world.answer(2, null, 1);
        scripts.flush();
        expect(printed()).toEqual([
            '{"canceled":false,"reason":null,"selection":null,"values":[null,"typed",true]}',
            '{"canceled":true,"reason":"UserBusy","selection":null,"values":null}'
        ]);
    });

    it('rejects a response that does not fit the form, and drops one for a form it never sent', () => {
        const { world, scripts, printed } = start(`
system.run(() => {
    new ui.ModalFormData().toggle('x').show(world.getAllPlayers()[0]).then(log, (error) => log(rejected(error)));
});`);
        scripts.flush();
        world.answer(99, '[true]');
        world.answer(1, '[true]', null, 'somebody else');
        world.answer(1, 'not json');
        world.answer(1, '[true]');
        scripts.flush();
        expect(printed()).toEqual([
            '{"error":"FormRejectError: Response from the client was malformed.","reason":"MalformedResponse"}'
        ]);
    });

    it('rejects every open form of a player who left with PlayerQuit, the newest first', () => {
        const { world, scripts, printed } = start(`
system.run(() => {
    const player = world.getAllPlayers()[0];
    for (const name of ['first', 'second']) {
        new ui.ActionFormData().title(name).show(player).catch((error) => log(name + ' ' + rejected(error).reason));
    }
    system.runTimeout(() => {
        try {
            new ui.ActionFormData().show(player);
        } catch (error) {
            log(String(error));
        }
        try {
            ui.uiManager.closeAllForms(player);
        } catch (error) {
            log(String(error));
        }
    }, 2);
});`);
        scripts.flush();
        world.leave(world.player);
        scripts.flush();
        scripts.flush();
        expect(printed()).toEqual([
            'second PlayerQuit',
            'first PlayerQuit',
            "InvalidEntityError: Failed to call function 'show' due to Entity being invalid (has the Entity been removed?).",
            'Error: Invalid Player handle.'
        ]);
    });

    it('closes every form of a player and leaves their promises open', () => {
        const { world, scripts, printed } = start(`
system.run(() => {
    const player = world.getAllPlayers()[0];
    new ui.MessageFormData().show(player).then(() => log('settled'));
    ui.uiManager.closeAllForms(player);
});`);
        scripts.flush();
        scripts.flush();
        expect(world.closed).toEqual([world.player]);
        expect(printed()).toEqual([]);
    });

    it('reads a version 1 message form the other way round, as its JSON swaps the buttons', () => {
        const { world, scripts, printed } = start(
            `
system.run(() => {
    new ui.MessageFormData().button1('Yes').button2('No').show(world.getAllPlayers()[0])
        .then((response) => log(describe(response)));
});`,
            1
        );
        scripts.flush();
        expect(world.sent[0]?.json).toBe('{"button1":"No","button2":"Yes","content":"","title":"","type":"modal"}\n');
        world.answer(1, 'false');
        scripts.flush();
        expect(printed()).toEqual(['{"canceled":false,"reason":null,"selection":0,"values":null}']);
    });

    it('keeps a form as its builder calls made it, whatever the script changes afterwards', () => {
        const { world, scripts } = start(`
system.run(() => {
    const title = { text: 'before' };
    const form = new ui.ActionFormData().title(title);
    title.text = 'after';
    form.show(world.getAllPlayers()[0]);
});`);
        scripts.flush();
        expect(world.sent[0]?.json).toContain('"title":{"rawtext":[{"text":"before"}]}');
    });

    it('throws RawMessageError from a builder call given a raw message that holds nothing', () => {
        const { scripts, printed } = start(`
system.run(() => {
    try {
        new ui.ActionFormData().button({});
    } catch (error) {
        log(error.name + ': ' + error.message);
    }
});`);
        scripts.flush();
        expect(printed()).toEqual([
            'RawMessageError: Failed to resolve raw message from json: \n{"rawtext":[null]}\n.'
        ]);
    });

    it("keeps a player's object theirs after they leave, so a form shown with it never reaches who joined next", () => {
        const { world, scripts, printed } = start(`
let first;
system.run(() => {
    first = world.getAllPlayers()[0];
});
system.runTimeout(() => {
    const [second] = world.getAllPlayers();
    log(['same player', first === second]);
    try {
        new ui.ActionFormData().title('old').show(first);
    } catch (error) {
        log(String(error) + ' ' + JSON.stringify([error.id === undefined, error.type]));
    }
    new ui.ActionFormData().title('new').show(second).then((response) => log(describe(response)));
}, 2);`);
        scripts.flush();
        world.leave(world.player);
        const next = world.join('Steve');
        scripts.flush();
        scripts.flush();
        expect(world.sent.map(({ player, json }) => [player, JSON.parse(json).title])).toEqual([[next, 'new']]);

        world.answer(1, '0', null, next);
        scripts.flush();
        expect(printed()).toEqual([
            '["same player",false]',
            'InvalidEntityError: Failed to call function \'show\' due to Entity being invalid (has the Entity been removed?). [false,"minecraft:player"]',
            '{"canceled":false,"reason":null,"selection":0,"values":null}'
        ]);
    });

    it('shows a form to the one object a pack has for a player, whichever member gave it', () => {
        const { world, scripts, printed } = start(`
world.afterEvents.playerSpawn.subscribe(({ player }) => {
    if (player.name !== 'Steve') return;
    const listed = world.getAllPlayers().find((each) => each.name === 'Steve');
    const [found] = world.getDimension('overworld').getEntities({ type: 'player', name: 'Steve' });
    log(['one object', player === listed, found === listed]);
    new ui.MessageFormData().body('hi').show(found).then((response) => log(describe(response)));
});`);
        scripts.flush();
        const steve = world.join('Steve');
        scripts.flush();
        expect(world.sent.map(({ player }) => player)).toEqual([steve]);

        world.answer(world.sent[0]?.formId ?? -1, '1', null, steve);
        scripts.flush();
        expect(printed()).toEqual([
            '["one object",true,true]',
            '{"canceled":false,"reason":null,"selection":1,"values":null}'
        ]);
    });

    it('settles nothing and keeps no form open once the runtime shuts down', () => {
        const { world, scripts } = start(`
system.run(() => {
    new ui.ActionFormData().show(world.getAllPlayers()[0]);
});`);
        scripts.flush();
        expect(world.sent).toHaveLength(1);
        scripts.shutdown();
        world.answer(1, '0');
        expect(() => scripts.flush()).not.toThrow();
    });
});
