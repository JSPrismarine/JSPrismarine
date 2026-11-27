/**
 * The MOTD addon, run as a server runs it: the pack's real files in a runtime over a memory world,
 * with a server double that keeps what the server list shows. The addon's own decisions, in
 * `motd.js`, are tested first, loaded straight from the pack.
 */
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptHostLibrary } from '../ScriptEngine';
import { addonDirectory, addonPackOnBds, readAddonPack } from '../testing/addonPack.test-utils';
import { writeInlinePack } from '../testing/inlinePack.test-utils';
import { loadLibrary, scriptHostAvailable, TEST_SERVER } from '../testing/library.test-utils';
import { ManualServer, ManualServerList } from '../testing/manualServer.test-utils';
import { MemoryConfigStore } from '../testing/memoryConfigStore.test-utils';
import { MemoryWorld } from '../testing/memoryWorld.test-utils';
import type { ScriptPack } from './pack';
import { readScriptConfig } from './pack';
import type { ScriptCommandArgument, ScriptCommandOutcome } from './world';
import { WorldScripts } from './WorldScripts';

const MOTD = await addonDirectory('motd');

/** A template tree, as the tests build them. */
interface Tree {
    readonly rawtext: readonly unknown[];
}

/** The functions `motd.js` exports, typed as the tests call them. */
interface MotdModule {
    readonly DEFAULT_INTERVAL: number;
    readonly DEFAULT_FRAME_INTERVAL: number;
    readonly ACTIONS: readonly string[];
    readConfig(value: unknown): Record<string, unknown> & { problems: string[] };
    withMotd(raw: unknown, motd: unknown): unknown;
    lineTemplate(line: unknown, frameInterval: number, parse: (shorthand: string) => Tree): unknown;
    countOf(text: string): number | undefined;
    lineOf(text: string): string;
}

// The pack's module is plain JavaScript, so the import is the one untyped boundary of these tests.
const motd: MotdModule = await import(pathToFileURL(join(MOTD, 'scripts', 'motd.js')).href);

describe('the MOTD module', () => {
    const { readConfig, withMotd, lineTemplate, countOf, lineOf, DEFAULT_INTERVAL, DEFAULT_FRAME_INTERVAL } = motd;

    it('reads an absent or empty file as the defaults, changing nothing', () => {
        for (const value of [undefined, {}]) {
            expect(readConfig(value)).toEqual({
                interval: DEFAULT_INTERVAL,
                frameInterval: DEFAULT_FRAME_INTERVAL,
                motd: undefined,
                levelName: undefined,
                onlinePlayers: undefined,
                maxPlayers: undefined,
                problems: []
            });
        }
    });

    it('reads every field: lines as a template or frames, counts as a number or a template', () => {
        const tree = { rawtext: [{ gradient: { colors: ['#ff0000', '#0000ff'], rawtext: ['Lobby'] } }] };
        expect(
            readConfig({
                interval: 10,
                frameInterval: 40,
                motd: ['&aOne', tree],
                levelName: 'Hub',
                onlinePlayers: '{server:online}',
                maxPlayers: 100
            })
        ).toMatchObject({
            interval: 10,
            frameInterval: 40,
            motd: ['&aOne', tree],
            levelName: 'Hub',
            onlinePlayers: '{server:online}',
            maxPlayers: 100,
            problems: []
        });
    });

    it('leaves out each field of the wrong shape and names it, keeping the rest', () => {
        const config = readConfig({ interval: 0, motd: [], levelName: 7, onlinePlayers: -1, maxPlayers: 1.5 });

        expect(config).toMatchObject({ interval: DEFAULT_INTERVAL, motd: undefined, maxPlayers: undefined });
        expect(config.problems).toEqual([
            '`interval` is not a whole number of ticks, 1 or more',
            '`motd` is not a template or a list of templates',
            '`levelName` is not a template or a list of templates',
            '`onlinePlayers` is not a whole number from 0 to 2147483647 or a template',
            '`maxPlayers` is not a whole number from 0 to 2147483647 or a template'
        ]);
        expect(readConfig([]).problems).toEqual(['the file is not a JSON object']);
    });

    it('makes a list of frames one animation, parsing the shorthand ones, and leaves a template as it is', () => {
        const parse = (shorthand: string): Tree => ({ rawtext: [{ text: shorthand.toUpperCase() }] });
        const tree = { rawtext: [{ text: 'two' }] };

        expect(lineTemplate(['one', tree], 30, parse)).toEqual({
            rawtext: [{ animate: { interval: 30, frames: [[{ text: 'ONE' }], [{ text: 'two' }]] } }]
        });
        expect(lineTemplate('one', 30, parse)).toBe('one');
        expect(lineTemplate(tree, 30, parse)).toBe(tree);
    });

    it('reads a rendered count, refusing what is not a whole number in range', () => {
        expect([countOf('12'), countOf(' 7 '), countOf('0')]).toEqual([12, 7, 0]);
        expect([countOf('{server:online}'), countOf('-1'), countOf('1.5'), countOf(''), countOf('2147483648')]).toEqual(
            [undefined, undefined, undefined, undefined, undefined]
        );
    });

    it('writes the MOTD into the file, keeping what else the owner put in it, and takes it out', () => {
        expect(withMotd({ interval: 5, motd: 'old', note: 'mine' }, '&anew')).toEqual({
            interval: 5,
            note: 'mine',
            motd: '&anew'
        });
        expect(withMotd({ motd: 'old', note: 'mine' }, undefined)).toEqual({ note: 'mine' });
        expect(withMotd(undefined, 'x')).toEqual({ motd: 'x' });
    });

    it('swaps a semicolon the Bedrock ping cannot carry for a colon', () => {
        expect(lineOf('Lobby; 3 online')).toBe('Lobby: 3 online');
    });
});

const directories: string[] = [];
afterAll(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/** The addon as Bedrock Dedicated Server runs it. */
const motdOnBds = (): ScriptPack => {
    const { pack, directory } = addonPackOnBds(MOTD);
    directories.push(directory);
    return pack;
};

/** A pack that provides what the placeholders addon would: `server` with `online` and `max`. */
const providerPack = (): ScriptPack => {
    const { pack, directory } = writeInlinePack(
        `import('@jsprismarine/placeholders').then((placeholders) => {
            placeholders.register('server', {
                keys: ['online', 'max', 'word'],
                resolve: (key) => (key === 'online' ? 3 : key === 'max' ? 50 : 'many')
            });
        });`,
        { name: 'provider', moduleUuid: '5f3b0f3e-6f1e-4c1c-9d4a-0b7c0a1a0002' }
    );
    directories.push(directory);
    return pack;
};

describe.skipIf(!scriptHostAvailable())('the MOTD addon', () => {
    let library: ScriptHostLibrary;
    beforeAll(() => {
        library = loadLibrary();
    });
    const runtimes: WorldScripts[] = [];
    afterEach(() => {
        for (const runtime of runtimes.splice(0)) runtime.shutdown();
    });

    /** Starts the addon beside the provider, with the config file holding `configured` when given. */
    const start = (configured?: unknown, pack = readAddonPack(MOTD)) => {
        const world = new MemoryWorld();
        const server = new ManualServer();
        const list = new ManualServerList();
        server.serverList = list;
        const store = new MemoryConfigStore();
        if (configured !== undefined) store.values.set(pack.directory, configured);
        const warnings: string[] = [];
        const scripts = new WorldScripts({
            server: TEST_SERVER,
            library,
            world,
            packs: [providerPack(), pack],
            config: readScriptConfig(undefined),
            log: { info: () => {}, warn: (line) => warnings.push(line), error: () => {} },
            seed: 1n,
            members: server,
            addonConfig: store
        });
        runtimes.push(scripts);
        scripts.startEarly();
        scripts.startWorld();
        scripts.flush();
        const tick = (count: number) => {
            for (let index = 0; index < count; index++) scripts.flush();
        };
        /** What the scripts printed with `console.warn`, without the prefix. */
        const printed = () =>
            warnings.filter((line) => line.startsWith('[Scripting] ')).map((line) => line.slice('[Scripting] '.length));
        /** Someone at the console runs `/motd`. */
        const command = (args: readonly ScriptCommandArgument[]): ScriptCommandOutcome | undefined =>
            world.commandSet?.run('jsp:motd', { sourceType: 'Server' }, args);
        return { scripts, world, list, store, pack, tick, printed, command };
    };

    it('registers /motd for operators, with its actions as an enum', () => {
        const { world } = start();

        expect(world.commandSet?.commands).toEqual([
            {
                name: 'jsp:motd',
                description: 'Shows or sets the template the server list renders its MOTD from.',
                // CommandPermissionLevel.GameDirectors, which an operator has.
                permissionLevel: 1,
                cheatsRequired: false,
                mandatoryParameters: [{ name: 'jsp:motd_action', type: 'Enum' }],
                optionalParameters: [{ name: 'template', type: 'String' }]
            }
        ]);
        expect(world.commandSet?.enums).toEqual([{ name: 'jsp:motd_action', values: [...motd.ACTIONS] }]);
    });

    it('leaves the server list alone until the config sets something', () => {
        const { list, tick } = start();
        tick(40);

        expect(list.calls).toEqual([]);
    });

    it('renders the lines with placeholders and colors and the counts, sending only what changed', () => {
        const { list, tick } = start({
            motd: '&aWelcome! &7{server:online} online',
            levelName: 'Lobby',
            onlinePlayers: '{server:online}',
            maxPlayers: 100
        });
        tick(60);

        expect(list.calls).toEqual([
            'update {"motd":"§aWelcome! §73 online","levelName":"Lobby","onlinePlayers":3,"maxPlayers":100}'
        ]);
        expect(list.current()).toEqual({
            motd: '§aWelcome! §73 online',
            levelName: 'Lobby',
            onlinePlayers: 3,
            maxPlayers: 100
        });
    });

    it('shows each frame of a list in turn, rendering again when the frame changes', () => {
        const { list, tick } = start({ interval: 1000, frameInterval: 10, motd: ['&aOne', '&bTwo'] });
        tick(25);

        expect(list.calls).toEqual(['update {"motd":"§aOne"}', 'update {"motd":"§bTwo"}', 'update {"motd":"§aOne"}']);
    });

    it('sets and clears the MOTD with /motd, giving the server its own back', () => {
        const { list, store, pack, tick, command } = start({ maxPlayers: 10 });
        tick(2);

        expect(command(['set', '&e{server:max} slots'])).toEqual({ status: 'success', message: 'MOTD template set.' });
        tick(2);
        expect(store.values.get(pack.directory)).toEqual({ maxPlayers: 10, motd: '&e{server:max} slots' });
        expect(list.current().motd).toBe('§e50 slots');
        expect(command(['show'])).toEqual({
            status: 'success',
            message:
                'The server list shows: §e50 slots (JSPrismarine), 2/10 players.\nThe MOTD template is &e{server:max} slots'
        });

        expect(command(['reset'])).toEqual({
            status: 'success',
            message: "MOTD template cleared, so the list shows the server's own MOTD."
        });
        tick(2);
        expect(list.calls.slice(-2)).toEqual(['reset', 'update {"maxPlayers":10}']);
        expect(list.current()).toEqual({ ...ManualServerList.OWN, maxPlayers: 10 });
        expect(command(['set'])).toEqual({ status: 'failure', message: 'Usage: /motd set <template>' });
    });

    it('keeps the real count and says so once when a count template renders no number', () => {
        const { list, tick, printed } = start({ onlinePlayers: '{server:word}' });
        tick(60);

        expect(list.calls).toEqual([]);
        expect(printed()).toEqual([
            '[MOTD] `onlinePlayers` rendered to "many", which is not a count, so the list keeps its own.'
        ]);
    });

    it('names a field of the wrong shape on the console, and applies the rest', () => {
        const { list, tick, printed } = start({ motd: 7, maxPlayers: 30 });
        tick(2);

        expect(printed()).toEqual(['[MOTD] addons/motd.config.json: `motd` is not a template or a list of templates.']);
        expect(list.calls).toEqual(['update {"maxPlayers":30}']);
    });

    it('takes its changes back when the scripts stop', () => {
        const { scripts, list, tick } = start({ motd: 'Hi' });
        tick(2);
        scripts.shutdown();

        expect(list.calls).toEqual(['update {"motd":"Hi"}', 'reset']);
    });

    it('says it needs JSPrismarine on Bedrock Dedicated Server, and changes nothing', () => {
        const { list, tick, command } = start({ motd: 'Hi' }, motdOnBds());
        tick(20);

        expect(command(['show'])).toEqual({
            status: 'failure',
            message: 'The MOTD addon needs JSPrismarine 0.27.0 or newer, and this server is not one.'
        });
        expect(list.calls).toEqual([]);
    });
});
