/**
 * The tab list addon, run as a server runs it: the pack's real files in a runtime over a memory
 * world, with a server double that keeps the name each player's entry shows. The addon's own
 * decisions, in `templates.js`, are tested first, loaded straight from the pack.
 */
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptHostLibrary } from '../ScriptEngine';
import { addonDirectory, addonPackOnBds, readAddonPack } from '../testing/addonPack.test-utils';
import { writeInlinePack } from '../testing/inlinePack.test-utils';
import { loadLibrary, scriptHostAvailable, TEST_SERVER } from '../testing/library.test-utils';
import { ManualServer } from '../testing/manualServer.test-utils';
import { MemoryConfigStore } from '../testing/memoryConfigStore.test-utils';
import { MemoryWorld } from '../testing/memoryWorld.test-utils';
import type { ScriptPack } from './pack';
import { readScriptConfig } from './pack';
import type { ScriptCommandArgument, ScriptCommandOrigin, ScriptCommandOutcome } from './world';
import { WorldScripts } from './WorldScripts';

const TAB_LIST = addonDirectory('tab-list');

/** The functions `templates.js` exports, typed as the tests call them. */
interface Templates {
    readonly DEFAULT_INTERVAL: number;
    readonly EVENTS: Readonly<Record<string, string>>;
    readonly ACTIONS: readonly string[];
    readConfig(value: unknown): {
        interval: number;
        global: unknown;
        groups: Map<string, unknown>;
        problems: string[];
    };
    configFile(raw: unknown, config: { interval: number; global: unknown; groups: Map<string, unknown> }): unknown;
    pickTemplate(levels: {
        session?: unknown;
        persisted?: unknown;
        group?: string;
        groups: Map<string, unknown>;
        global?: unknown;
    }): unknown;
    parseMessage(
        id: string,
        message: string
    ): { ok: true; request: Record<string, unknown> } | { ok: false; reason: string };
}

// The pack's module is plain JavaScript, so the import is the one untyped boundary of these tests.
const templates: Templates = await import(pathToFileURL(join(TAB_LIST, 'scripts', 'templates.js')).href);

describe('the tab list templates module', () => {
    const { readConfig, configFile, pickTemplate, parseMessage, EVENTS, DEFAULT_INTERVAL } = templates;

    it('reads an absent or empty file as the defaults', () => {
        for (const value of [undefined, {}]) {
            const config = readConfig(value);
            expect([config.interval, config.global, [...config.groups], config.problems]).toEqual([
                DEFAULT_INTERVAL,
                undefined,
                [],
                []
            ]);
        }
    });

    it('reads the interval and the templates, a shorthand string or a tree each', () => {
        const tree = { rawtext: [{ text: '§c[Admin] ' }, { placeholder: 'player:name' }] };
        const config = readConfig({
            interval: 5,
            templates: { global: '{player:name} &7{player:ping}ms', groups: { admin: tree, vip: '&6{player:name}' } }
        });

        expect(config.interval).toBe(5);
        expect(config.global).toBe('{player:name} &7{player:ping}ms');
        expect([...config.groups]).toEqual([
            ['admin', tree],
            ['vip', '&6{player:name}']
        ]);
        expect(config.problems).toEqual([]);
    });

    it('leaves out each field of the wrong shape and names it, keeping the rest', () => {
        const config = readConfig({
            interval: 0.5,
            templates: { global: 7, groups: { admin: ['no'], vip: '&6{player:name}' } }
        });

        expect(config.interval).toBe(DEFAULT_INTERVAL);
        expect(config.global).toBeUndefined();
        expect([...config.groups.keys()]).toEqual(['vip']);
        expect(config.problems).toEqual([
            '`interval` is not a whole number of ticks, 1 or more',
            '`templates.global` is not a template',
            '`templates.groups.admin` is not a template'
        ]);
    });

    it('refuses a file that is not an object, and templates that are not', () => {
        expect(readConfig([]).problems).toEqual(['the file is not a JSON object']);
        expect(readConfig({ templates: 'x' }).problems).toEqual(['`templates` is not an object']);
        expect(readConfig({ templates: { groups: 'x' } }).problems).toEqual(['`templates.groups` is not an object']);
    });

    it('writes the file back with the templates, keeping what else the owner put in it', () => {
        const raw = { comment: 'mine', interval: 20, templates: { global: 'old', groups: {}, note: 'keep' } };
        const file = configFile(raw, { interval: 20, global: undefined, groups: new Map([['vip', '&6']]) });

        expect(file).toEqual({ comment: 'mine', interval: 20, templates: { groups: { vip: '&6' }, note: 'keep' } });
        expect(configFile(undefined, { interval: DEFAULT_INTERVAL, global: 'g', groups: new Map() })).toEqual({
            templates: { global: 'g', groups: {} }
        });
        expect(configFile({}, { interval: 10, global: undefined, groups: new Map() })).toEqual({
            interval: 10,
            templates: { groups: {} }
        });
    });

    it('picks the session template first, then the kept one, the group one and the global one', () => {
        const groups = new Map([['vip', 'group']]);
        expect(pickTemplate({ session: 's', persisted: 'p', group: 'vip', groups, global: 'g' })).toBe('s');
        expect(pickTemplate({ persisted: 'p', group: 'vip', groups, global: 'g' })).toBe('p');
        expect(pickTemplate({ group: 'vip', groups, global: 'g' })).toBe('group');
        expect(pickTemplate({ group: 'default', groups, global: 'g' })).toBe('g');
        expect(pickTemplate({ groups, global: 'g' })).toBe('g');
        expect(pickTemplate({ groups })).toBeUndefined();
        // A group named like an object property is not a template.
        expect(pickTemplate({ group: 'constructor', groups })).toBeUndefined();
    });

    it('reads each event message, with persist false unless given', () => {
        const tree = { rawtext: [{ text: 'x' }] };
        expect(parseMessage(EVENTS.setGlobal!, JSON.stringify({ template: 'g' }))).toEqual({
            ok: true,
            request: { kind: 'setGlobal', template: 'g' }
        });
        expect(parseMessage(EVENTS.setGroup!, JSON.stringify({ group: 'vip', template: tree }))).toEqual({
            ok: true,
            request: { kind: 'setGroup', group: 'vip', template: tree }
        });
        expect(parseMessage(EVENTS.clearGroup!, JSON.stringify({ group: 'vip' }))).toEqual({
            ok: true,
            request: { kind: 'clearGroup', group: 'vip' }
        });
        expect(parseMessage(EVENTS.setPlayer!, JSON.stringify({ player: 'Steve', template: 'p' }))).toEqual({
            ok: true,
            request: { kind: 'setPlayer', player: 'Steve', template: 'p', persist: false }
        });
        expect(
            parseMessage(EVENTS.setPlayer!, JSON.stringify({ player: 'Steve', template: 'p', persist: true }))
        ).toEqual({ ok: true, request: { kind: 'setPlayer', player: 'Steve', template: 'p', persist: true } });
        expect(parseMessage(EVENTS.clearPlayer!, JSON.stringify({ player: 'Steve' }))).toEqual({
            ok: true,
            request: { kind: 'clearPlayer', player: 'Steve' }
        });
    });

    it('refuses a message that is not JSON, not an object, or missing a field, saying why', () => {
        const refused = (id: string, message: string) => {
            const parsed = parseMessage(id, message);
            return parsed.ok ? 'accepted' : parsed.reason;
        };
        expect(refused(EVENTS.setGlobal!, 'not json')).toBe('the message is not JSON');
        expect(refused(EVENTS.setGlobal!, '[]')).toBe('the message is not a JSON object');
        expect(refused(EVENTS.setGlobal!, '{}')).toBe('`template` is not a template');
        expect(refused(EVENTS.setGroup!, '{"template":"t"}')).toBe('`group` is not a name');
        expect(refused(EVENTS.setGroup!, '{"group":"vip","template":7}')).toBe('`template` is not a template');
        expect(refused(EVENTS.clearGroup!, '{"group":""}')).toBe('`group` is not a name');
        expect(refused(EVENTS.setPlayer!, '{"template":"t"}')).toBe('`player` is not a name');
        expect(refused(EVENTS.setPlayer!, '{"player":"Steve","template":"t","persist":"yes"}')).toBe(
            '`persist` is not a boolean'
        );
        expect(refused(EVENTS.clearPlayer!, '{}')).toBe('`player` is not a name');
        expect(refused('jsp_tablist:other', '{}')).toBe('no such event');
    });
});

const directories: string[] = [];
afterAll(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/** The tab list as Bedrock Dedicated Server runs it. */
const tabListOnBds = (): ScriptPack => {
    const { pack, directory } = addonPackOnBds(TAB_LIST);
    directories.push(directory);
    return pack;
};

/**
 * A pack that provides what the placeholders addon and the permissions work would: `player` with
 * `name` and `ping`, and `perms` with `primary_group` when asked, which names Steve an admin.
 */
const providerPack = (perms: boolean): ScriptPack => {
    const { pack, directory } = writeInlinePack(
        `const GROUPS = { Steve: 'admin' };
        Promise.all([import('@jsprismarine/server'), import('@jsprismarine/placeholders')]).then(([jsp, placeholders]) => {
            placeholders.register('player', {
                keys: ['name', 'ping'],
                resolve: (key, player) => {
                    if (player === undefined) return undefined;
                    return key === 'name' ? player.name : (jsp.getPing(player) ?? '?');
                }
            });
            ${
                perms
                    ? `placeholders.register('perms', {
                keys: ['primary_group'],
                resolve: (key, player) => (player === undefined ? undefined : (GROUPS[player.name] ?? 'default'))
            });`
                    : ''
            }
        });`,
        { name: 'provider', moduleUuid: '5f3b0f3e-6f1e-4c1c-9d4a-0b7c0a1a0001' }
    );
    directories.push(directory);
    return pack;
};

describe.skipIf(!scriptHostAvailable())('the tab list addon', () => {
    let library: ScriptHostLibrary;
    beforeAll(() => {
        library = loadLibrary();
    });
    const runtimes: WorldScripts[] = [];
    afterEach(() => {
        for (const runtime of runtimes.splice(0)) runtime.shutdown();
    });

    /**
     * Starts the pack over `world`, on a server that gives the live members when `server` is set,
     * with the config store and the provider pack when given.
     */
    const start = (
        world: MemoryWorld,
        server?: ManualServer,
        pack = readAddonPack(TAB_LIST),
        extras: { store?: MemoryConfigStore; provider?: ScriptPack } = {}
    ) => {
        const errors: string[] = [];
        const warnings: string[] = [];
        const scripts = new WorldScripts({
            server: TEST_SERVER,
            library,
            world,
            packs: extras.provider === undefined ? [pack] : [extras.provider, pack],
            config: readScriptConfig(undefined),
            log: { info: () => {}, warn: (line) => warnings.push(line), error: (line) => errors.push(line) },
            seed: 1n,
            ...(server === undefined ? {} : { members: server }),
            ...(extras.store === undefined ? {} : { addonConfig: extras.store })
        });
        runtimes.push(scripts);
        scripts.startEarly();
        scripts.startWorld();
        scripts.flush();
        /** Runs the server for `count` ticks. */
        const tick = (count: number) => {
            for (let index = 0; index < count; index++) scripts.flush();
        };
        /** What the scripts printed with `console.warn`, without the prefix. */
        const printed = () =>
            warnings.filter((line) => line.startsWith('[Scripting] ')).map((line) => line.slice('[Scripting] '.length));
        return { scripts, errors, warnings, printed, tick };
    };

    /** A world with Steve and Alex, the provider, an empty config store and a server, running. */
    const withPlayers = (perms = true, configured?: unknown) => {
        const world = new MemoryWorld();
        const server = new ManualServer();
        const store = new MemoryConfigStore();
        const pack = readAddonPack(TAB_LIST);
        if (configured !== undefined) store.values.set(pack.directory, configured);
        const steve = world.join('Steve');
        const alex = world.join('Alex');
        const running = start(world, server, pack, { store, provider: providerPack(perms) });
        return { world, server, store, pack, steve, alex, ...running };
    };

    /** Sends a `jsp_tablist:*` script event from the server, as another pack's `system.sendScriptEvent` does. */
    const sendEvent = (world: MemoryWorld, id: string, message: unknown) =>
        world.runCommand(`scriptevent ${id} ${JSON.stringify(message)}`, { dimension: 'minecraft:overworld' });

    /** Someone runs `/tablist`, the console unless a player is named. */
    const tablist = (
        world: MemoryWorld,
        args: readonly ScriptCommandArgument[],
        player?: string
    ): ScriptCommandOutcome | undefined => {
        const origin: ScriptCommandOrigin =
            player === undefined
                ? { sourceType: 'Server' }
                : { sourceType: 'Entity', sourceEntity: { id: player, typeId: 'minecraft:player' } };
        return world.commandSet?.run('jsp:tablist', origin, args);
    };

    it('registers /tablist for operators, with its actions as an enum', () => {
        const world = new MemoryWorld();
        start(world, new ManualServer());

        expect(world.commandSet?.commands).toEqual([
            {
                name: 'jsp:tablist',
                description: 'Sets the templates the player list renders names from.',
                // CommandPermissionLevel.GameDirectors, which an operator has.
                permissionLevel: 1,
                cheatsRequired: false,
                mandatoryParameters: [{ name: 'jsp:tablist_action', type: 'Enum' }],
                optionalParameters: [
                    { name: 'name', type: 'String' },
                    { name: 'template', type: 'String' }
                ]
            }
        ]);
        expect(world.commandSet?.enums).toEqual([{ name: 'jsp:tablist_action', values: [...templates.ACTIONS] }]);
    });

    it('renders the global template for every player once it is set, and sends a name only when it changes', () => {
        const { world, server, store, pack, steve, alex, tick } = withPlayers();
        tick(40);
        expect(server.listCalls).toEqual([]);

        expect(tablist(world, ['format', '&a{player:name} &7{player:ping}ms'])).toEqual({
            status: 'success',
            message: 'Global template set.'
        });
        tick(2);
        expect(store.values.get(pack.directory)).toEqual({
            templates: { global: '&a{player:name} &7{player:ping}ms', groups: {} }
        });
        expect(server.listNames.get(steve)).toBe('§aSteve §7?ms');
        expect(server.listNames.get(alex)).toBe('§aAlex §7?ms');

        tick(40);
        expect(server.listCalls).toHaveLength(2);
        server.pings.set(steve, 42);
        tick(20);
        expect(server.listCalls).toHaveLength(3);
        expect(server.listNames.get(steve)).toBe('§aSteve §742ms');
    });

    it('shows the global template, and gives every name back on /tablist reset', () => {
        const { world, server, steve, tick } = withPlayers(true, { templates: { global: 'G {player:name}' } });
        tick(1);
        expect(server.listNames.get(steve)).toBe('G Steve');
        expect(tablist(world, ['format'])).toEqual({
            status: 'success',
            message: 'The global template is G {player:name}'
        });

        expect(tablist(world, ['reset'])).toEqual({ status: 'success', message: 'Global template cleared.' });
        tick(2);
        expect(server.listNames.size).toBe(0);
        expect(tablist(world, ['format'])).toEqual({ status: 'success', message: 'No global template is set.' });
        expect(server.listCalls.filter((call) => call.startsWith('unname'))).toHaveLength(2);
    });

    it('picks the player template over the group one over the global one', () => {
        const configured = { templates: { global: 'G {player:name}', groups: { admin: 'A {player:name}' } } };
        const { world, server, steve, alex, tick } = withPlayers(true, configured);
        tick(1);
        expect([server.listNames.get(steve), server.listNames.get(alex)]).toEqual(['A Steve', 'G Alex']);

        expect(tablist(world, ['player', 'Steve', 'P {player:name}'])).toEqual({
            status: 'success',
            message: 'Template of Steve set.'
        });
        tick(1);
        expect(server.listNames.get(steve)).toBe('P Steve');
        expect(tablist(world, ['show', 'Steve'])).toEqual({ status: 'success', message: 'Steve renders to: P Steve' });

        expect(tablist(world, ['player', 'Steve', 'reset'])).toEqual({
            status: 'success',
            message: 'Template of Steve reset.'
        });
        tick(1);
        expect(server.listNames.get(steve)).toBe('A Steve');

        expect(tablist(world, ['group', 'admin', 'remove'])).toEqual({
            status: 'success',
            message: 'Template of group admin removed.'
        });
        tick(2);
        expect(server.listNames.get(steve)).toBe('G Steve');
        expect(tablist(world, ['player', 'Nobody', 'x'])).toEqual({
            status: 'failure',
            message: 'No player named Nobody is online.'
        });
    });

    it('skips the group tier and says so once when nothing provides the primary group', () => {
        const configured = { templates: { global: 'G {player:name}', groups: { admin: 'A {player:name}' } } };
        const { server, steve, printed, tick } = withPlayers(false, configured);
        tick(40);

        expect(server.listNames.get(steve)).toBe('G Steve');
        expect(printed()).toEqual([
            '[Tab List] Group templates are set, but nothing provides {perms:primary_group}, so they are skipped.'
        ]);
    });

    it('says once that nothing provides the player placeholders, and leaves their tokens as written', () => {
        const world = new MemoryWorld();
        const server = new ManualServer();
        const store = new MemoryConfigStore();
        const pack = readAddonPack(TAB_LIST);
        store.values.set(pack.directory, { templates: { global: '{player:name}' } });
        const steve = world.join('Steve');
        const { printed, tick } = start(world, server, pack, { store });
        tick(40);

        expect(server.listNames.get(steve)).toBe('{player:name}');
        expect(printed()).toEqual([
            '[Tab List] Nothing provides {player:...} placeholders, so they stay as written. Run `addon install standard-placeholders`.'
        ]);
    });

    it('keeps a player template and the config across a restart, and gives the names back while stopped', () => {
        const { world, server, store, pack, steve, alex, scripts, tick } = withPlayers();
        tablist(world, ['format', 'G {player:name}']);
        tablist(world, ['player', 'Steve', 'P {player:name}']);
        tick(2);
        expect([server.listNames.get(steve), server.listNames.get(alex)]).toEqual(['P Steve', 'G Alex']);

        scripts.shutdown();
        expect(server.listNames.size).toBe(0);

        const restarted = new ManualServer();
        start(world, restarted, pack, { store, provider: providerPack(true) }).tick(1);
        expect([restarted.listNames.get(steve), restarted.listNames.get(alex)]).toEqual(['P Steve', 'G Alex']);
    });

    it('takes templates from other packs over script events, for the session unless persisted', () => {
        const { world, server, store, pack, steve, alex, scripts, printed, tick } = withPlayers();
        sendEvent(world, templates.EVENTS.setGlobal!, { template: 'G {player:name}' });
        sendEvent(world, templates.EVENTS.setGroup!, { group: 'admin', template: 'A {player:name}' });
        sendEvent(world, templates.EVENTS.setPlayer!, { player: 'Alex', template: 'S {player:name}' });
        tick(2);
        expect([server.listNames.get(steve), server.listNames.get(alex)]).toEqual(['A Steve', 'S Alex']);
        expect(store.values.get(pack.directory)).toEqual({
            templates: { global: 'G {player:name}', groups: { admin: 'A {player:name}' } }
        });

        // A session template wins over a kept one, and goes when cleared.
        sendEvent(world, templates.EVENTS.setPlayer!, { player: 'Alex', template: 'K {player:name}', persist: true });
        tick(2);
        expect(server.listNames.get(alex)).toBe('K Alex');
        sendEvent(world, templates.EVENTS.setPlayer!, { player: 'Alex', template: 'S {player:name}' });
        tick(2);
        expect(server.listNames.get(alex)).toBe('S Alex');
        sendEvent(world, templates.EVENTS.clearGroup!, { group: 'admin' });
        tick(2);
        expect(server.listNames.get(steve)).toBe('G Steve');

        // A restart keeps the persisted template and forgets the session one.
        scripts.shutdown();
        const restarted = new ManualServer();
        const again = start(world, restarted, pack, { store, provider: providerPack(true) });
        again.tick(1);
        expect(restarted.listNames.get(alex)).toBe('K Alex');
        sendEvent(world, templates.EVENTS.clearPlayer!, { player: 'Alex' });
        sendEvent(world, templates.EVENTS.setPlayer!, { player: 'Nobody', template: 'x' });
        sendEvent(world, templates.EVENTS.setPlayer!, { template: 'x' });
        sendEvent(world, templates.EVENTS.setGlobal!, 'not json');
        again.tick(2);
        expect(restarted.listNames.get(alex)).toBe('G Alex');
        expect([...printed(), ...again.printed()]).toEqual([
            '[Tab List] No player named Nobody is online, so setPlayer changes nothing.',
            '[Tab List] jsp_tablist:set_player: `player` is not a name.',
            '[Tab List] jsp_tablist:set_global: the message is not a JSON object.'
        ]);
    });

    it('forgets a session template and the name sent when the player leaves', () => {
        const { world, server, alex, tick } = withPlayers(true, { templates: { global: 'G {player:name}' } });
        sendEvent(world, templates.EVENTS.setPlayer!, { player: 'Alex', template: 'S {player:name}' });
        tick(2);
        expect(server.listNames.get(alex)).toBe('S Alex');

        const before = server.listCalls.length;
        world.leave(alex);
        tick(40);
        // The entry went with the player, so nothing is sent for them after.
        expect(server.listCalls.slice(before)).toEqual([]);
    });

    it('applies a change of the config file without a reload, and names each field it cannot read', () => {
        const { world, server, store, pack, steve, printed, tick } = withPlayers(true, {
            templates: { global: 'G {player:name}' }
        });
        tick(1);
        expect(server.listNames.get(steve)).toBe('G Steve');

        store.changedOnDisk(pack, { interval: 0.5, templates: { global: 'N {player:name}', groups: 'bad' } });
        tick(2);
        expect(server.listNames.get(steve)).toBe('N Steve');
        expect(printed()).toEqual([
            '[Tab List] addons/tab-list.config.json: `interval` is not a whole number of ticks, 1 or more.',
            '[Tab List] addons/tab-list.config.json: `templates.groups` is not an object.'
        ]);

        // A shorter interval renders more often: the ping changes every tick, and the name follows at each render.
        store.changedOnDisk(pack, { interval: 5, templates: { global: '{player:ping}' } });
        tick(2);
        const before = server.listCalls.length;
        for (let ping = 1; ping <= 20; ping++) {
            server.pings.set(steve, ping);
            tick(1);
        }
        expect(server.listCalls.length - before).toBe(4);
        void world;
    });

    it('renders again at the tick an animation next changes, between the intervals', () => {
        const frames = { rawtext: [{ animate: { interval: 3, frames: [['a'], ['b']] } }] };
        const { server, steve, tick } = withPlayers(true, { templates: { global: frames } });
        tick(1);
        const first = server.listNames.get(steve);
        expect(['a', 'b']).toContain(first);
        const before = server.listCalls.length;

        tick(12);
        const changes = server.listCalls
            .slice(before)
            .filter((call) => call.startsWith(`name ${steve} `))
            .map((call) => call.split(' ').at(-1));
        // A frame lasts three ticks, so twelve ticks change the name about four times, each to the other frame.
        expect(changes.length).toBeGreaterThanOrEqual(3);
        expect(changes.every((name, index) => name !== (index === 0 ? first : changes[index - 1]))).toBe(true);
    });

    it('tells the sender /tablist needs JSPrismarine on Bedrock Dedicated Server, and on a server without the members', () => {
        const needsJsprismarine = {
            status: 'failure',
            message: 'The tab list needs JSPrismarine 0.23.0 or newer, and this server is not one.'
        };
        const bds = new MemoryWorld();
        const onBds = start(bds, undefined, tabListOnBds());
        expect(tablist(bds, ['format', 'x'])).toEqual(needsJsprismarine);

        const older = new MemoryWorld();
        const onOlder = start(older);
        expect(tablist(older, ['reset'])).toEqual(needsJsprismarine);

        onBds.tick(20);
        onOlder.tick(20);
        expect([...bds.properties.keys(), ...older.properties.keys()]).toEqual([]);
        expect([...onBds.errors, ...onOlder.errors]).toEqual([]);
    });
});
