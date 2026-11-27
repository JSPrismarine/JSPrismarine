/**
 * What a joined player sees of JSPrismarine's own addons: the client e2e scenarios `multiverse`,
 * `tab-list` and `tps-bar`, played over a loopback pipe against a server stepped by hand, and what
 * a Java Edition server list ping shows of `motd`, on a server of its own with Java Edition on.
 *
 * The server loads each addon from `addons/` as a world pack, as an installed addon is, with its
 * scripts compiled from the addon's TypeScript sources into a folder of the test's own. Where
 * cinnabar reads its log of the boss bars and player list entries it applied, these read the
 * `BossEvent` and `PlayerList` packets the client was sent.
 *
 * A machine without the script host library runs no scripts, so each test skips there unless
 * `JSP_SCRIPT_HOST_REQUIRE=1` asks for a failure instead, as CI does on Linux x64.
 */
import { BossEventPacket, BossEventUpdateType } from '@jsprismarine/protocol';
import PlayerListPacket, { PlayerListAction } from '@jsprismarine/protocol/bedrock/packet/PlayerListPacket';
import { execFile } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { TestContext } from 'vitest';
import type Client from '../Client';
import type { DecodedPacket, PacketConstructor } from '../net/ClientPacketRegistry';
import type { LoopbackPlayer, LoopbackServer } from '../testing/loopbackServer.test-utils';
import { startLoopbackServer } from '../testing/loopbackServer.test-utils';
import { shownCount, shownText, wasShown } from './scenarioSupport.test-utils';

/** The addons the cinnabar scenarios install, the tab list's placeholders first. */
const ADDONS = ['standard-placeholders', 'tab-list', 'tps-bar', 'multiverse'] as const;

/** The repository's `addons/` folder. */
const ADDONS_ROOT = fileURLToPath(new URL('../../../../addons/', import.meta.url));

/** What a copy of an addon leaves out: the project that builds its scripts, and any scripts a build left there. */
const SKIPPED = ['package.json', 'tsconfig.json', 'turbo.json', 'src', 'node_modules', 'scripts'];

/**
 * Copies an addon into `into` and compiles its scripts there with the `tsc-ts` it builds with, as
 * `@jsprismarine/addon-tools`' `compileAddon` does, so a stale or missing `scripts/` in the
 * checkout cannot stand in for the sources.
 * @returns The copy's folder.
 */
const compiledAddon = async (name: string, into: string): Promise<string> => {
    const source = path.join(ADDONS_ROOT, name);
    const target = path.join(into, name);
    cpSync(source, target, {
        recursive: true,
        filter: (file) => !SKIPPED.some((entry) => file === path.join(source, entry))
    });
    const tscTs = path.join(
        path.dirname(createRequire(path.join(source, 'package.json')).resolve('tsc-ts/package.json')),
        'bin',
        'tsc-ts.js'
    );
    await promisify(execFile)(
        process.execPath,
        [
            tscTs,
            '-p',
            path.join(source, 'tsconfig.json'),
            '--pretty',
            'false',
            '--outDir',
            path.join(target, 'scripts')
        ],
        { cwd: source, env: { ...process.env, TSC_TS_CACHE: '0' } }
    );
    return target;
};

let jsp: LoopbackServer;
let packs: string;

// Booting the server builds its content, the slow part, so it happens once for the file.
beforeAll(async () => {
    packs = mkdtempSync(path.join(tmpdir(), 'jsprismarine-loopback-addons-'));
    const folders = await Promise.all(ADDONS.map((name) => compiledAddon(name, packs)));
    jsp = await startLoopbackServer({
        name: 'addon-scenarios',
        config: {
            'content-world-packs': folders
        }
    });
}, 1_200_000);

afterAll(async () => {
    await jsp?.close();
    if (packs !== undefined) rmSync(packs, { recursive: true, force: true });
}, 60_000);

/** Skips the test on a machine whose server runs no scripts, unless CI asks for a failure. */
const requireScripts = (context: TestContext, server: LoopbackServer = jsp): void => {
    const scripted = server.server.getScripts() !== undefined;
    if (!scripted && process.env.JSP_SCRIPT_HOST_REQUIRE !== '1') context.skip();
    expect(scripted, 'the server runs no scripts').toBe(true);
};

/** Has the client decode a packet `ClientWorld` does not read. */
const decode = (client: Client, packet: PacketConstructor): void => {
    if (!client.getRegistry().has(new packet().getId())) client.getRegistry().register(packet);
};

/** Joins a player and makes it an operator, as every addon command is for operators. */
const joinOperator = async (name: string): Promise<LoopbackPlayer> => {
    const player = await jsp.join(name);
    await jsp.command(`op ${name}`);
    await jsp.tick(10);
    return player;
};

/** Runs a player's command and ticks until the player is shown a line matching `expected`. */
const answers = async (player: LoopbackPlayer, line: string, expected: string | RegExp): Promise<void> => {
    const from = shownCount(player);
    await player.runCommand(line);
    try {
        await jsp.until(() => wasShown(player, expected, from), `${line} never answered ${String(expected)}`);
    } catch (error) {
        // The lines it did answer with say more than the timeout does.
        expect(JSON.stringify(shownText(player, from)), `${line} never answered ${String(expected)}`).toMatch(expected);
        throw error;
    }
};

describe('multiverse', () => {
    /** The world the scenario creates. */
    const WORLD = 'e2e_sky';
    /** The alias `/mv modify` gives it. */
    const ALIAS = 'Skylands';
    /** The entry level, which the loopback server's `worlds` key names. */
    const ENTRY = 'world';

    it('creates a world with /mv create, moves a player there and back with /mv tp, and unloads it', async (context) => {
        requireScripts(context);
        const player = await jsp.join('Multiverser');
        let changes = 0;
        player.client.on('dimensionChange', () => changes++);

        // A console caller's `Created` and `Unloaded` lines go to the server log as script warnings,
        // so the waits read the level list those lines report.
        const attached = (): boolean => jsp.server.getWorldManager().getLevel(WORLD) !== undefined;
        await jsp.command(`mv create ${WORLD} minecraft:flat 1`);
        await jsp.until(attached, `/mv create never created ${WORLD}`, 400);
        await jsp.command(`mv modify ${WORLD} alias ${ALIAS}`);
        await jsp.tick(5);

        /** Sends the player to a world with `/mv tp`, and waits until the client closed the loading screen. */
        const visit = async (world: string): Promise<void> => {
            const before = changes;
            await player.runCommand(`mv tp ${world}`);
            await jsp.until(
                () =>
                    player.session()?.getWorld().getLevel().name === world &&
                    changes > before &&
                    player.client.getDimensionChange().getPending() === null,
                `the player never arrived in ${world}`,
                400
            );
            await jsp.tick(20);
        };

        await visit(WORLD);
        await answers(player, 'mv coords', `${WORLD} (${ALIAS}), minecraft:overworld`);

        await visit(ENTRY);
        await answers(player, 'mv coords', `${ENTRY}, minecraft:overworld`);

        await jsp.command(`mv unload ${WORLD}`);
        await jsp.until(() => !attached(), `/mv unload never closed ${WORLD}`, 400);
        player.leave();
        await jsp.tick();
    });
});

describe('tab-list', () => {
    /** One `PlayerList` packet: whether it adds or removes, and the entries' UUIDs and names. */
    interface ListUpdate {
        readonly action: PlayerListAction;
        readonly uuids: readonly string[];
        readonly names: readonly (string | null)[];
    }

    it('renames the entry with a Remove and an Add when an operator sets a template, and back on reset', async (context) => {
        requireScripts(context);
        const player = await joinOperator('Listed');
        decode(player.client, PlayerListPacket);
        const updates: ListUpdate[] = [];
        // A field packet keeps its payload in its fields, so the decoded packet itself is read.
        player.client.on('packet', ({ packet }: DecodedPacket) => {
            if (!(packet instanceof PlayerListPacket)) return;
            updates.push({
                action: packet.type,
                uuids: packet.entries.map((entry) => entry.getUUID().toString()),
                names: packet.entries.map((entry) => entry.getName())
            });
        });

        /** Ticks until two more updates came, and checks they are a Remove and an Add of the player's one entry. */
        const removedAndAdded = async (from: number): Promise<readonly [ListUpdate, ListUpdate]> => {
            await jsp.until(() => updates.length >= from + 2, 'the client was never sent the Remove and the Add');
            const [removed, added] = updates.slice(from);
            const seen = JSON.stringify(updates.slice(from));
            expect(removed?.action, `the first update is not a Remove: ${seen}`).toBe(PlayerListAction.TYPE_REMOVE);
            expect(added?.action, `the second update is not an Add: ${seen}`).toBe(PlayerListAction.TYPE_ADD);
            // With the player the only one online, the list empties and fills again.
            expect(removed?.uuids).toHaveLength(1);
            expect(added?.uuids).toEqual(removed?.uuids);
            return [removed!, added!];
        };

        // Until a template is set, the list is untouched: no update arrives.
        await jsp.tick(45);
        expect(updates, 'the client was sent a list update before any template was set').toEqual([]);

        await answers(player, 'tablist format "&a{player:name} &7{player:ping}ms"', 'Global template set.');
        await removedAndAdded(0);

        // `{player:ping}` stays as written until the connection has a latency sample, which comes from
        // the client's answers to `NetworkStackLatency`. `Client` answers none, where cinnabar's
        // answers give it a number.
        await answers(player, `tablist show ${player.name}`, `renders to: §a${player.name} §7{player:ping}ms`);

        const beforeReset = updates.length;
        await answers(player, 'tablist reset', 'Global template cleared.');
        const [, restored] = await removedAndAdded(beforeReset);
        expect(restored.names, 'the reset did not give the entry its login name back').toEqual([player.name]);
        player.leave();
        await jsp.tick();
    });
});

describe('tps-bar', () => {
    it('shows the boss bar on /tpsbar, keeps it through its redraws, and takes it down on a second /tpsbar', async (context) => {
        requireScripts(context);
        const player = await joinOperator('Barred');
        decode(player.client, BossEventPacket);
        /** Each boss bar the client was told to show or take down, in order. */
        const lifecycle: BossEventUpdateType[] = [];
        player.client.on('packet', ({ packet }: DecodedPacket) => {
            if (!(packet instanceof BossEventPacket)) return;
            if (packet.eventType === BossEventUpdateType.Add || packet.eventType === BossEventUpdateType.Remove)
                lifecycle.push(packet.eventType);
        });

        await answers(player, 'tpsbar', 'TPS bar on.');
        await jsp.until(() => lifecycle.includes(BossEventUpdateType.Add), 'the client was never shown a boss bar');

        // Two redraws, so the bar has been updated in place. A redraw that changes the bar's color
        // takes it down and shows it again, so the bar is kept when the last event shows it.
        await jsp.tick(45);
        expect(lifecycle.at(-1), 'the client was told to drop the bar after showing it').toBe(BossEventUpdateType.Add);

        const shown = lifecycle.length;
        await answers(player, 'tpsbar', 'TPS bar off.');
        await jsp.until(
            () => lifecycle.slice(shown).includes(BossEventUpdateType.Remove),
            'the client was never told to take the boss bar down'
        );
        player.leave();
        await jsp.tick();
    });
});

describe('motd', () => {
    let listed: LoopbackServer;
    let folder: string;

    // A server of its own: the server list ping is Java Edition's, which the other scenarios'
    // server leaves off.
    beforeAll(async () => {
        folder = mkdtempSync(path.join(tmpdir(), 'jsprismarine-loopback-motd-'));
        const folders = await Promise.all(
            (['standard-placeholders', 'motd'] as const).map((name) => compiledAddon(name, folder))
        );
        listed = await startLoopbackServer({
            name: 'motd-scenario',
            config: { 'content-world-packs': folders, 'java-enabled': true, 'java-port': 0 }
        });
    }, 1_200_000);

    afterAll(async () => {
        await listed?.close();
        if (folder !== undefined) rmSync(folder, { recursive: true, force: true });
    }, 60_000);

    it("shows the MOTD the console sets in the server list, rendered, and the server's own again on reset", async (context) => {
        requireScripts(context, listed);
        const status = listed.server.getServerStatus();
        const own = status.getMotd();
        const slots = listed.server.getConfig().getMaxPlayers();

        await listed.command('motd set "&aWelcome &7{server:max} slots"');
        await listed.until(() => status.getMotd() !== own, 'the addon never changed the server list');
        expect(await listed.javaStatus()).toMatchObject({ description: { text: `§aWelcome §7${slots} slots` } });

        await listed.command('motd reset');
        await listed.until(() => status.getMotd() === own, 'the reset never gave the MOTD back');
        expect(await listed.javaStatus()).toMatchObject({ description: { text: own } });
    });
});
