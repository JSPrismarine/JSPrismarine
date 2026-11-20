/**
 * JSPrismarine's own addons under `addons/`, run as a server runs them: each pack's real files in a
 * runtime over a memory world, with a server whose figures the test sets tick by tick.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptHostLibrary } from '../ScriptEngine';
import { loadLibrary, scriptHostAvailable, TEST_SERVER } from '../testing/library.test-utils';
import { MemoryWorld } from '../testing/memoryWorld.test-utils';
import type { JsprismarineServerMembers, ScriptBossBarState, ScriptPerformance } from './jsprismarineMembers';
import type { ScriptPack } from './pack';
import { readScriptConfig, readScriptPack } from './pack';
import type { ScriptCommandOutcome } from './world';
import { WorldScripts } from './WorldScripts';

const TPS_BAR = fileURLToPath(new URL('../../../../addons/tps-bar', import.meta.url));

const directories: string[] = [];
afterAll(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/** Reads an addon's pack from its folder. */
const readPack = (directory: string): ScriptPack => {
    const pack = readScriptPack(directory);
    if (pack === undefined) throw new Error(`${directory} has no script module`);
    return pack;
};

/**
 * The TPS bar as Bedrock Dedicated Server runs it: the same files, with the import of
 * `@jsprismarine/server` naming a module the runtime refuses with the message BDS gives.
 */
const tpsBarOnBds = (): ScriptPack => {
    const directory = mkdtempSync(join(tmpdir(), 'jsp-tps-bar-bds-'));
    directories.push(directory);
    cpSync(TPS_BAR, directory, { recursive: true });
    const main = join(directory, 'scripts', 'main.js');
    const source = readFileSync(main, 'utf8');
    expect(source.split("import('@jsprismarine/server')")).toHaveLength(2);
    writeFileSync(main, source.replace("import('@jsprismarine/server')", "import('@jsprismarine/not-on-bds')"));
    return readPack(directory);
};

/** A server whose figures the test sets before each tick, and which keeps the bar each player sees. */
class ManualServer implements JsprismarineServerMembers {
    public current: ScriptPerformance = { tps: 20, tpsAverages: [20, 20, 20], lastTickMs: 0, averageTickMs: 0 };
    public readonly pings = new Map<string, number>();
    /** Every bar call, as `show`, `update` or `hide` and the player. */
    public readonly calls: string[] = [];
    /** What each player's bar shows, while they have one. */
    public readonly screens = new Map<string, ScriptBossBarState>();
    public performance(): ScriptPerformance {
        return this.current;
    }
    public ping(player: string): number | undefined {
        return this.pings.get(player);
    }
    public showBossBar(player: string, _bar: number, state: ScriptBossBarState): void {
        this.calls.push(`show ${player}`);
        this.screens.set(player, state);
    }
    public updateBossBar(player: string, _bar: number, state: ScriptBossBarState): void {
        this.calls.push(`update ${player}`);
        this.screens.set(player, state);
    }
    public hideBossBar(player: string): void {
        this.calls.push(`hide ${player}`);
        this.screens.delete(player);
    }
}

describe.skipIf(!scriptHostAvailable())('the TPS bar addon', () => {
    let library: ScriptHostLibrary;
    beforeAll(() => {
        library = loadLibrary();
    });
    const runtimes: WorldScripts[] = [];
    afterEach(() => {
        for (const runtime of runtimes.splice(0)) runtime.shutdown();
    });

    /** Starts the pack over `world`, on a server that gives the live members when `server` is set. */
    const start = (world: MemoryWorld, server?: ManualServer, pack = readPack(TPS_BAR)) => {
        const errors: string[] = [];
        const scripts = new WorldScripts({
            server: TEST_SERVER,
            library,
            world,
            packs: [pack],
            config: readScriptConfig(undefined),
            log: { info: () => {}, warn: () => {}, error: (line) => errors.push(line) },
            seed: 1n,
            ...(server === undefined ? {} : { members: server })
        });
        runtimes.push(scripts);
        scripts.startEarly();
        scripts.startWorld();
        scripts.flush();
        /** Runs the server for `count` ticks. */
        const tick = (count: number) => {
            for (let index = 0; index < count; index++) scripts.flush();
        };
        return { scripts, errors, tick };
    };

    /** A player runs `/tpsbar`. */
    const tpsbar = (world: MemoryWorld, player: string): ScriptCommandOutcome | undefined =>
        world.commandSet?.run(
            'jsp:tpsbar',
            { sourceType: 'Entity', sourceEntity: { id: player, typeId: 'minecraft:player' } },
            []
        );

    /** A world with Steve in it and his bar on, on a server at full speed. */
    const withBar = () => {
        const world = new MemoryWorld();
        const server = new ManualServer();
        const steve = world.join('Steve');
        const running = start(world, server);
        tpsbar(world, steve);
        running.tick(1);
        return { world, server, steve, ...running };
    };

    it('registers /tpsbar for operators', () => {
        const world = new MemoryWorld();
        start(world, new ManualServer());

        expect(world.commandSet?.commands.map(({ name, permissionLevel }) => ({ name, permissionLevel }))).toEqual([
            // CommandPermissionLevel.GameDirectors, which an operator has.
            { name: 'jsp:tpsbar', permissionLevel: 1 }
        ]);
    });

    it.each([
        {
            load: 'idle',
            tps: 20,
            mspt: 2.62,
            text: '§7TPS: §a20.00 §7MSPT: §a2.62 §7Ping: §a0§7ms',
            progress: 0.0524,
            color: 'green'
        },
        {
            load: 'busy',
            tps: 20,
            mspt: 29.28,
            text: '§7TPS: §a20.00 §7MSPT: §629.28 §7Ping: §a0§7ms',
            progress: 0.5856,
            color: 'yellow'
        },
        {
            load: 'overloaded',
            tps: 17.42,
            mspt: 57.8,
            text: '§7TPS: §617.42 §7MSPT: §c57.80 §7Ping: §a0§7ms',
            progress: 1,
            color: 'red'
        },
        {
            load: 'at the green thresholds',
            tps: 19.5,
            mspt: 24.99,
            text: '§7TPS: §a19.50 §7MSPT: §a24.99 §7Ping: §a0§7ms',
            progress: 0.4998,
            color: 'green'
        },
        {
            load: 'just under 19.5 TPS',
            tps: 19.49,
            mspt: 20,
            text: '§7TPS: §619.49 §7MSPT: §a20.00 §7Ping: §a0§7ms',
            progress: 0.4,
            color: 'yellow'
        },
        {
            load: 'at the gold thresholds',
            tps: 15,
            mspt: 25,
            text: '§7TPS: §615.00 §7MSPT: §625.00 §7Ping: §a0§7ms',
            progress: 0.5,
            color: 'yellow'
        },
        {
            load: 'past the gold thresholds',
            tps: 14.99,
            mspt: 50,
            text: '§7TPS: §c14.99 §7MSPT: §c50.00 §7Ping: §a0§7ms',
            progress: 1,
            color: 'red'
        },
        {
            load: 'slow on TPS alone',
            tps: 12,
            mspt: 10,
            text: '§7TPS: §c12.00 §7MSPT: §a10.00 §7Ping: §a0§7ms',
            progress: 0.2,
            color: 'red'
        }
    ])('shows the $load server in the colors of its thresholds', ({ tps, mspt, text, progress, color }) => {
        const { server, steve, tick } = withBar();
        server.pings.set(steve, 0);
        // The last tick took far longer than the average; the bar shows the average.
        server.current = { tps, tpsAverages: [tps, tps, tps], lastTickMs: mspt * 4, averageTickMs: mspt };
        tick(20);

        const shown = server.screens.get(steve);
        expect(shown?.text).toBe(text);
        expect(shown?.progress).toBeCloseTo(progress, 10);
        expect(shown?.color).toBe(color);
    });

    it('shows the ping rounded, and a question mark while the player has none', () => {
        const { server, steve, tick } = withBar();
        tick(20);
        expect(server.screens.get(steve)?.text).toBe('§7TPS: §a20.00 §7MSPT: §a0.00 §7Ping: §7?§7ms');

        server.pings.set(steve, 41.6);
        tick(20);
        expect(server.screens.get(steve)?.text).toBe('§7TPS: §a20.00 §7MSPT: §a0.00 §7Ping: §a42§7ms');
    });

    it('redraws the bar once every 20 ticks', () => {
        const { server, steve, tick } = withBar();
        server.calls.length = 0;
        tick(60);

        expect(server.calls).toEqual([`update ${steve}`, `update ${steve}`, `update ${steve}`]);
    });

    it('turns the bar on and off for the player who runs /tpsbar, and no one else', () => {
        const world = new MemoryWorld();
        const server = new ManualServer();
        const steve = world.join('Steve');
        const alex = world.join('Alex');
        const { tick } = start(world, server);

        expect(tpsbar(world, steve)).toEqual({ status: 'success', message: 'TPS bar on.' });
        tick(20);
        expect(server.calls).toEqual([`show ${steve}`, `update ${steve}`]);
        expect(server.screens.has(alex)).toBe(false);

        expect(tpsbar(world, steve)).toEqual({ status: 'success', message: 'TPS bar off.' });
        tick(20);
        expect(server.calls).toEqual([`show ${steve}`, `update ${steve}`, `hide ${steve}`]);
        expect(server.screens.size).toBe(0);
    });

    it('counts two /tpsbar in one tick as two toggles, leaving the bar as it was', () => {
        const world = new MemoryWorld();
        const server = new ManualServer();
        const steve = world.join('Steve');
        const { tick } = start(world, server);

        expect(tpsbar(world, steve)).toEqual({ status: 'success', message: 'TPS bar on.' });
        expect(tpsbar(world, steve)).toEqual({ status: 'success', message: 'TPS bar off.' });
        tick(20);

        expect(server.screens.has(steve)).toBe(false);
        expect(tpsbar(world, steve)).toEqual({ status: 'success', message: 'TPS bar on.' });
    });

    it('keeps the bar on across a restart, until the player turns it off', () => {
        const { world, server, steve, scripts } = withBar();
        scripts.shutdown();
        expect(server.screens.has(steve)).toBe(false);

        const restarted = new ManualServer();
        const { tick } = start(world, restarted);
        tick(20);
        expect(restarted.calls).toEqual([`show ${steve}`]);

        expect(tpsbar(world, steve)).toEqual({ status: 'success', message: 'TPS bar off.' });
        tick(1);
        const again = new ManualServer();
        start(world, again).tick(20);
        expect(again.calls).toEqual([]);
    });

    it('takes down the bar of a player who leaves, and draws none for them after', () => {
        const { world, server, steve, tick } = withBar();
        world.leave(steve);
        tick(40);

        expect(server.calls).toEqual([`show ${steve}`, `hide ${steve}`]);
    });

    it('tells the player /tpsbar needs JSPrismarine on Bedrock Dedicated Server, and on a server without the members', () => {
        const needsJsprismarine = {
            status: 'failure',
            message: 'The TPS bar needs JSPrismarine 0.23.0 or newer, and this server is not one.'
        };
        const bds = new MemoryWorld();
        const onBds = start(bds, undefined, tpsBarOnBds());
        expect(tpsbar(bds, bds.join('Steve'))).toEqual(needsJsprismarine);

        const older = new MemoryWorld();
        const onOlder = start(older);
        expect(tpsbar(older, older.join('Steve'))).toEqual(needsJsprismarine);

        onBds.tick(20);
        onOlder.tick(20);
        expect([...bds.properties.keys(), ...older.properties.keys()]).toEqual([]);
        expect([...onBds.errors, ...onOlder.errors]).toEqual([]);
    });

    it('refuses /tpsbar from the console, which has no screen', () => {
        const world = new MemoryWorld();
        start(world, new ManualServer());

        expect(world.commandSet?.run('jsp:tpsbar', { sourceType: 'Server' }, [])).toEqual({
            status: 'failure',
            message: 'Only a player can turn on the TPS bar.'
        });
    });
});
