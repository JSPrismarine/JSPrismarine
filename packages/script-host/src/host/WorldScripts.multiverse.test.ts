/**
 * The Multiverse addon, run as a server runs it: the pack's compiled scripts in the runtime of one
 * level, over a memory world, with the server's levels in a double and the addon's config file in
 * a memory store.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptHostLibrary } from '../ScriptEngine';
import { addonDirectory, addonPackOnBds, readAddonPack } from '../testing/addonPack.test-utils';
import { loadLibrary, scriptHostAvailable, TEST_SERVER } from '../testing/library.test-utils';
import { ManualLevels } from '../testing/manualLevels.test-utils';
import { ManualServer } from '../testing/manualServer.test-utils';
import { MemoryConfigStore } from '../testing/memoryConfigStore.test-utils';
import { MemoryWorld } from '../testing/memoryWorld.test-utils';
import { rmSync } from 'node:fs';
import type { ScriptPack } from './pack';
import { readScriptConfig } from './pack';
import type { ScriptCommandArgument, ScriptCommandOrigin, ScriptCommandOutcome } from './world';
import { WorldScripts } from './WorldScripts';

const MULTIVERSE = await addonDirectory('multiverse');

const LOBBY = '11111111-1111-4111-8111-111111111111';
const ARENA = '22222222-2222-4222-8222-222222222222';
const SECRET = '33333333-3333-4333-8333-333333333333';
const ARCHIVE = '44444444-4444-4444-8444-444444444444';

const directories: string[] = [];
afterAll(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

describe.skipIf(!scriptHostAvailable())('the Multiverse addon', () => {
    let library: ScriptHostLibrary;
    beforeAll(() => {
        library = loadLibrary();
    });
    const runtimes: WorldScripts[] = [];
    afterEach(() => {
        for (const runtime of runtimes.splice(0)) runtime.shutdown();
    });

    /**
     * Starts the pack in the lobby, the entry level, over a world with Steve in it, the config file
     * holding `configured`, on JSPrismarine unless `bds`.
     */
    const start = (configured?: unknown, { bds = false }: { bds?: boolean } = {}) => {
        const world = new MemoryWorld();
        const levels = new ManualLevels([
            { id: LOBBY, name: 'lobby', attached: true, entry: true, players: ['Steve'] },
            { id: ARENA, name: 'arena', attached: true, entry: false, players: [] },
            { id: SECRET, name: 'secret', attached: true, entry: false, players: [] },
            { id: ARCHIVE, name: 'archive', attached: false, entry: false, players: [] }
        ]);
        const members = new ManualServer();
        members.levels = levels;
        const store = new MemoryConfigStore();
        let pack: ScriptPack = readAddonPack(MULTIVERSE);
        if (bds) {
            const copy = addonPackOnBds(MULTIVERSE);
            directories.push(copy.directory);
            pack = copy.pack;
        }
        if (configured !== undefined) store.values.set(pack.directory, configured);
        const steve = world.join('Steve');
        const warnings: string[] = [];
        const scripts = new WorldScripts({
            server: TEST_SERVER,
            library,
            world,
            packs: [pack],
            config: readScriptConfig(undefined),
            log: { info: () => {}, warn: (line) => warnings.push(line), error: (line) => warnings.push(line) },
            seed: 1n,
            ...(bds ? {} : { members, addonConfig: store })
        });
        runtimes.push(scripts);
        scripts.startEarly();
        scripts.startWorld();
        scripts.flush();
        /** Runs the server for `count` ticks. */
        const tick = (count: number) => {
            for (let index = 0; index < count; index++) scripts.flush();
        };
        /** Runs `/mv`, from the console unless a player's entity id is given. */
        const mv = (args: readonly ScriptCommandArgument[], player?: string): ScriptCommandOutcome | undefined => {
            const origin: ScriptCommandOrigin =
                player === undefined
                    ? { sourceType: 'Server' }
                    : { sourceType: 'Entity', sourceEntity: { id: player, typeId: 'minecraft:player' } };
            return world.commandSet?.run('jsp:mv', origin, args);
        };
        /** The file as the addon last wrote it. */
        const file = () => store.values.get(pack.directory);
        return { world, levels, store, pack, steve, warnings, scripts, tick, mv, file };
    };

    it('lists the worlds with their players, and for operators the hidden and unloaded ones', () => {
        const { mv, steve } = start({ worlds: { [SECRET]: { hidden: true }, [ARENA]: { alias: 'Arena' } } });

        expect(mv(['list'])?.message?.split('\n')).toEqual([
            'lobby: 1 online §7[entry]§r',
            'arena (Arena): 0 online',
            'secret: 0 online §7[hidden]§r',
            '§7Unloaded: archive'
        ]);
        expect(mv(['list'], steve)?.message?.split('\n')).toEqual([
            'lobby: 1 online §7[entry]§r',
            'arena (Arena): 0 online'
        ]);
        expect(mv(['info', 'secret'], steve)?.status).toBe('failure');
        expect(mv(['info', 'arena'])?.message?.split('\n')[0]).toBe(`arena (Arena): ${ARENA}`);
    });

    it("sends a player to a world's spawn, and keeps hidden and full worlds for operators", () => {
        const { levels, mv, steve, tick } = start({
            worlds: { [SECRET]: { hidden: true }, [ARENA]: { playerLimit: 0 } }
        });

        expect(mv(['tp', 'arena'], steve)).toEqual({
            status: 'failure',
            message: 'Arena is full: 0 players.'.replace('Arena', 'arena')
        });
        expect(mv(['tp', 'secret'], steve)?.message).toBe('There is no world secret. /mv list shows the worlds.');
        expect(mv(['tp', 'arena', 'Alex'], steve)?.message).toBe('Only an operator can send another player.');
        expect(mv(['tp', 'secret', 'Steve'])).toEqual({ status: 'success', message: 'Sending Steve to secret.' });
        expect(mv(['spawn'], steve)?.status).toBe('success');
        tick(1);

        expect(levels.calls).toEqual([`transfer ${steve} ${SECRET} true`, `transfer ${steve} ${LOBBY} true`]);
    });

    it('creates, unloads and loads worlds through the server, and tells the console how each went', async () => {
        const { levels, mv, warnings, tick } = start();

        expect(mv(['create', 'skyblock', 'minecraft:flat'])).toEqual({
            status: 'success',
            message: 'Creating skyblock.'
        });
        expect(mv(['unload', 'lobby'])?.message).toBe('Unloading lobby.');
        expect(mv(['load', 'archive'])?.message).toBe('Loading archive.');
        // The server's operations finish between ticks, as the double's do between these flushes.
        await new Promise((resolve) => setImmediate(resolve));
        tick(1);

        expect(levels.calls).toEqual(['create skyblock minecraft:flat undefined', 'detach lobby', 'attach archive']);
        expect(warnings).toEqual([
            '[Scripting] [Multiverse] Created skyblock. /mv tp skyblock goes there.',
            '[Scripting] [Multiverse] §cLevel lobby is the level players join first',
            '[Scripting] [Multiverse] Loaded archive.'
        ]);
        expect(mv(['list'])?.message).toContain('skyblock: 0 online');
    });

    it("puts a player who is not an operator in the world's game mode when they arrive", () => {
        const { world, tick } = start({ worlds: { [LOBBY]: { gamemode: 'creative' } } });
        const alex = world.join('Alex');
        tick(2);

        expect(world.entity(alex)?.gameMode).toBe('Creative');
    });

    it('keys a rule by the level UUID, and keeps what else the file holds', () => {
        const { mv, file, tick } = start({ note: 'mine' });

        expect(mv(['modify', 'arena', 'alias', 'Skylands'])?.message).toBe('Set alias of arena to Skylands.');
        tick(1);
        expect(mv(['modify', 'arena', 'respawnworld', 'lobby'])?.status).toBe('success');
        expect(mv(['modify', 'arena', 'gamemode', 'hardcore'])?.message).toBe(
            'gamemode takes survival, creative, adventure, spectator or none.'
        );
        tick(1);

        expect(file()).toEqual({ note: 'mine', worlds: { [ARENA]: { alias: 'Skylands', respawnWorld: LOBBY } } });
        expect(mv(['who'])?.message?.split('\n')).toEqual([
            'lobby: Steve',
            'arena (Skylands): nobody',
            'secret: nobody'
        ]);
    });

    it('loads on Bedrock Dedicated Server, where /mv says it needs JSPrismarine', () => {
        const { mv } = start(undefined, { bds: true });

        expect(mv(['list'])?.message).toMatch(/JSPrismarine server, 0\.25\.0 or newer/);
    });
});
