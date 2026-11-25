import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Logger } from '@jsprismarine/logger';
import BossEventPacket, {
    BossBarColor,
    BossEventUpdateType
} from '@jsprismarine/protocol/bedrock/packet/BossEventPacket';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type ClientConnection from '../network/ClientConnection';
import type PlayerSession from '../player/PlayerSession';
import { PermissionManager } from '../permission/PermissionManager';
import type Server from '../Server';
import type SessionManager from '../SessionManager';
import { testKernel } from '../testing/kernel.test.helper';
import { identityNamed } from '../testing/sessionIdentity.test.helper';
import { stub } from '../testing/stub.test.helper';
import type { WorldData } from '../config/JsonConfigTypes';
import type { World } from '../world/World';
import type { Level } from '../world/Level';
import { DEFAULT_CREATED_PRESET } from '../world/LevelRegistry';
import type WorldManager from '../world/WorldManager';
import {
    ScriptBossBarScreens,
    scriptLevelMembers,
    scriptPermissionMembers,
    scriptServerMembers
} from './serverMembers';

/** A joined player's session that records the boss events it is sent and the sends it was handed. */
const viewer = (runtimeId: bigint, roundTripTime?: number) => {
    const sent: BossEventPacket[] = [];
    /** The actor of every boss event the player was sent. */
    const actors = new Set<bigint>();
    const pending: Promise<void>[] = [];
    /** The name each `setPlayerListName` asked for, the login name as undefined. */
    const listNames: (string | undefined)[] = [];
    /** The event type whose next sends fail, as a send to a congested connection can, and how many. */
    let failing: { eventType: BossEventUpdateType; times: number } | undefined;
    const session = stub<PlayerSession>({
        runtimeId,
        getRuntimeId: () => runtimeId,
        isConnected: () => true,
        setPlayerListName: async (name) => {
            listNames.push(name);
        },
        send: async (packet) => {
            if (!(packet instanceof BossEventPacket)) return;
            if (failing !== undefined && packet.eventType === failing.eventType) {
                if (--failing.times === 0) failing = undefined;
                throw new TypeError('the connection dropped the packet');
            }
            sent.push(packet);
            actors.add(packet.targetActorId);
        },
        released: (sends) => void pending.push(sends),
        getConnection: () => stub<ClientConnection>({ getRoundTripTime: () => roundTripTime })
    });
    /** The events sent once every send handed over has settled, as type, title, fill and color, which a test then forgets. */
    const take = async () => {
        // A failed send can hand the session another, which is waited for too.
        while (pending.length > 0) await Promise.allSettled(pending.splice(0));
        return sent.splice(0).map((event) => [event.eventType, event.name, event.healthPercent, event.color]);
    };
    const fail = (eventType: BossEventUpdateType, times = 1) => {
        failing = { eventType, times };
    };
    return { session, take, actors, fail, listNames };
};

describe('ScriptBossBarScreens', () => {
    it("binds a player's script bars to their own entity and shows the newest, then the one before it again", async () => {
        const steve = viewer(9n);
        const screens = new ScriptBossBarScreens((player) => (player === '9' ? steve.session : undefined));

        screens.show('9', 1, { text: 'TPS: 20', progress: 0.25, color: 'green' });
        expect(await steve.take()).toEqual([[BossEventUpdateType.Add, 'TPS: 20', 0.25, BossBarColor.Green]]);

        screens.show('9', 2, { text: 'Arena', progress: 1, color: 'green' });
        expect(await steve.take()).toEqual([
            [BossEventUpdateType.UpdateName, 'Arena', 0.25, BossBarColor.Green],
            [BossEventUpdateType.UpdatePercent, 'Arena', 1, BossBarColor.Green]
        ]);

        // The bar behind the one the player sees changes nothing on screen until it is in front.
        screens.update('9', 1, { text: 'TPS: 12', progress: 0.5, color: 'red' });
        expect(await steve.take()).toEqual([]);

        screens.hide('9', 2);
        expect(await steve.take()).toEqual([
            [BossEventUpdateType.UpdateName, 'TPS: 12', 1, BossBarColor.Green],
            [BossEventUpdateType.UpdatePercent, 'TPS: 12', 0.5, BossBarColor.Green],
            [BossEventUpdateType.Remove, 'TPS: 12', 0.5, BossBarColor.Green],
            [BossEventUpdateType.Add, 'TPS: 12', 0.5, BossBarColor.Red]
        ]);

        screens.hide('9', 1);
        expect(await steve.take()).toEqual([[BossEventUpdateType.Remove, 'TPS: 12', 0.5, BossBarColor.Red]]);
        // Every event is bound to the player's own entity, which the client always tracks.
        expect([...steve.actors]).toEqual([9n]);
    });

    it('sends the whole bar again after a send failed, though the next update asks for nothing new', async () => {
        const steve = viewer(9n);
        const screens = new ScriptBossBarScreens((player) => (player === '9' ? steve.session : undefined));
        screens.show('9', 1, { text: 'TPS: 20', progress: 0.25, color: 'green' });
        await steve.take();

        steve.fail(BossEventUpdateType.Add);
        screens.update('9', 1, { text: 'TPS: 20', progress: 0.25, color: 'red' });
        expect(await steve.take()).toEqual([[BossEventUpdateType.Remove, 'TPS: 20', 0.25, BossBarColor.Green]]);

        screens.update('9', 1, { text: 'TPS: 20', progress: 0.25, color: 'red' });
        expect(await steve.take()).toEqual([
            [BossEventUpdateType.Remove, 'TPS: 20', 0.25, BossBarColor.Red],
            [BossEventUpdateType.Add, 'TPS: 20', 0.25, BossBarColor.Red]
        ]);
    });

    it('sends the last Remove again when it failed, so the bar leaves the screen', async () => {
        const steve = viewer(9n);
        const screens = new ScriptBossBarScreens((player) => (player === '9' ? steve.session : undefined));
        screens.show('9', 1, { text: 'TPS: 20', progress: 0.25, color: 'green' });
        await steve.take();

        steve.fail(BossEventUpdateType.Remove);
        screens.hide('9', 1);

        expect(await steve.take()).toEqual([
            [BossEventUpdateType.Add, 'TPS: 20', 0.25, BossBarColor.Green],
            [BossEventUpdateType.Remove, 'TPS: 20', 0.25, BossBarColor.Green]
        ]);
        await steve.take();
        screens.hide('9', 1);
        expect(await steve.take()).toEqual([]);
    });

    it('sends the last Remove again on the next hide once every attempt failed', async () => {
        const steve = viewer(9n);
        const screens = new ScriptBossBarScreens((player) => (player === '9' ? steve.session : undefined));
        screens.show('9', 1, { text: 'TPS: 20', progress: 0.25, color: 'green' });
        await steve.take();

        steve.fail(BossEventUpdateType.Remove, 3);
        screens.hide('9', 1);
        await steve.take();
        screens.hide('9', 1);

        expect((await steve.take()).at(-1)?.[0]).toBe(BossEventUpdateType.Remove);
    });

    it('does not let a failed Remove take away a bar shown since', async () => {
        const steve = viewer(9n);
        const screens = new ScriptBossBarScreens((player) => (player === '9' ? steve.session : undefined));
        screens.show('9', 1, { text: 'TPS: 20', progress: 0.25, color: 'green' });
        await steve.take();

        steve.fail(BossEventUpdateType.Remove);
        screens.hide('9', 1);
        screens.show('9', 2, { text: 'Arena', progress: 1, color: 'red' });

        expect(await steve.take()).toEqual([[BossEventUpdateType.Add, 'Arena', 1, BossBarColor.Red]]);
    });

    it('leaves alone a player without a session and a bar it does not have', async () => {
        const steve = viewer(9n);
        const screens = new ScriptBossBarScreens((player) => (player === '9' ? steve.session : undefined));

        screens.show('10', 1, { text: 'nobody', progress: 1, color: 'pink' });
        screens.update('9', 1, { text: 'nobody', progress: 1, color: 'pink' });
        screens.hide('9', 1);

        expect(await steve.take()).toEqual([]);
    });
});

describe('scriptServerMembers', () => {
    const server = (sessions: readonly PlayerSession[]) =>
        stub<Server>({
            getTPS: () => 18.75,
            getTPSAverages: () => [19.9, 19.5, 19],
            getLastTickMs: () => 61,
            getTickMs: () => 44.5,
            getSessionManager: () => stub<SessionManager>({ getSessions: () => [...sessions] }),
            getPermissionManager: () => stub<PermissionManager>()
        });

    it("reads the ticker's figures each time", () => {
        expect(scriptServerMembers(server([]), stub<Level>()).performance()).toEqual({
            tps: 18.75,
            tpsAverages: [19.9, 19.5, 19],
            lastTickMs: 61,
            averageTickMs: 44.5
        });
    });

    it("gives a player's round trip time from their connection, and undefined without one", () => {
        const members = scriptServerMembers(server([viewer(9n, 23.5).session, viewer(10n).session]), stub<Level>());

        expect([members.ping('9'), members.ping('10'), members.ping('11')]).toEqual([23.5, undefined, undefined]);
    });

    it('renames the player list entry of the player it names, and gives it back, through their session', () => {
        const steve = viewer(9n);
        const members = scriptServerMembers(server([steve.session]), stub<Level>());

        members.setPlayerListName('9', '§aSteve');
        members.resetPlayerListName('9');
        members.setPlayerListName('10', 'nobody');
        members.resetPlayerListName('10');

        expect(steve.listNames).toEqual(['§aSteve', undefined]);
    });

    it("puts a script's bar on the screen of the player it names", async () => {
        const steve = viewer(9n);
        const members = scriptServerMembers(server([steve.session]), stub<Level>());

        members.showBossBar('9', 1, { text: 'TPS: 20', progress: 1, color: 'yellow' });
        members.updateBossBar('9', 1, { text: 'TPS: 20', progress: 0.5, color: 'yellow' });
        members.hideBossBar('9', 1);

        expect((await steve.take()).map(([type]) => type)).toEqual([
            BossEventUpdateType.Add,
            BossEventUpdateType.UpdatePercent,
            BossEventUpdateType.Remove
        ]);
    });
});

describe('scriptPermissionMembers', () => {
    let directory: string;
    let permissions: PermissionManager;
    const steve = identityNamed('Steve', '00000000-0000-0000-0000-000000000007');
    const steveSession = stub<PlayerSession>({ identity: steve, getRuntimeId: () => 7n });
    const sessionOf = (player: string) => (player === '7' ? steveSession : undefined);

    beforeEach(async () => {
        directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-script-permissions-'));
        vi.stubEnv('JSP_DIR', directory);
        const logger = new Logger('error');
        permissions = new PermissionManager(
            {
                getLogger: () => logger,
                getSessionManager: () => stub<SessionManager>({ getSessions: () => [steveSession] }),
                getKernel: () => testKernel()
            },
            { watch: false }
        );
        await permissions.enable();
    });

    afterEach(async () => {
        await permissions.disable();
        vi.unstubAllEnvs();
        rmSync(directory, { recursive: true, force: true });
    });

    const members = () => scriptPermissionMembers(permissions, sessionOf, () => [steveSession]);

    it('reads a player through the manager and writes on its queue', async () => {
        const scripts = members();
        await permissions.createGroup('vip');
        await permissions.setGroupMeta('vip', 'prefix', '[VIP] ');
        await permissions.setGroupWeight('vip', 10);

        expect(scripts.has('7', 'minecraft.command.ban')).toBe(false);
        scripts.addToGroup('7', 'vip', '2030-01-01T00:00:00Z');
        scripts.grant('7', 'minecraft.command.kick');
        scripts.grantToGroup('vip', 'minecraft.command.ban');
        // A reload drains the queued writes and reads the file again, so what follows survived persistence.
        await permissions.reload();

        expect(scripts.has('7', 'minecraft.command.ban')).toBe(true);
        expect(scripts.has('7', 'minecraft.command.kick')).toBe(true);
        expect(scripts.groupsOf('7')).toEqual(['vip', 'default']);
        expect(scripts.primaryGroupOf('7')).toBe('vip');
        expect(scripts.metaOf('7', 'prefix')).toBe('[VIP] ');
        expect(scripts.weightOf('7')).toBe(10);
        expect(permissions.userOf(steve.subject)?.groups).toEqual([
            { group: 'vip', expires: '2030-01-01T00:00:00.000Z' }
        ]);

        scripts.revokeFromGroup('vip', 'minecraft.command.ban');
        scripts.revoke('7', 'minecraft.command.kick');
        scripts.removeFromGroup('7', 'vip');
        // A reload drains the queued writes and reads the file again, so what follows survived persistence.
        await permissions.reload();
        expect(scripts.has('7', 'minecraft.command.ban')).toBe(false);
        expect(scripts.groupsOf('7')).toEqual(['default']);
        expect(scripts.weightOf('7')).toBe(0);
    });

    it('throws at the call for a bad node, a bad expiry, a missing group or a player who left', () => {
        const scripts = members();

        expect(() => scripts.grant('7', 'bad node')).toThrow('not spelled');
        expect(() => scripts.grant('7', 'a.b', 'yesterday')).toThrow('ISO 8601');
        expect(() => scripts.grantToGroup('nobody', 'a.b')).toThrow('No permission group named "nobody"');
        expect(() => scripts.addToGroup('7', 'nobody')).toThrow('No permission group named "nobody"');
        expect(() => scripts.has('8', 'a.b')).toThrow('not found');
        expect(() => scripts.grant('8', 'a.b')).toThrow('not found');
        expect(permissions.userOf(steve.subject)).toBeUndefined();
    });

    it('names the user a change touched with their player while online, or the group, and nothing after a reload', async () => {
        const scripts = members();
        const changes: unknown[] = [];
        const stop = scripts.onChange((change) => void changes.push(change));

        await permissions.grantUser(steve, 'a.b');
        await permissions.grantUser(identityNamed('Alex', '00000000-0000-0000-0000-000000000008'), 'a.b');
        await permissions.createGroup('vip');
        await permissions.reload();
        stop();
        await permissions.createGroup('other');

        expect(changes).toEqual([
            { target: { name: 'Steve', player: '7' } },
            { target: { name: 'Alex' } },
            { target: { group: 'vip' } },
            {}
        ]);
    });
});

describe('scriptLevelMembers', () => {
    const lobby = stub<Level>({ id: '11111111-1111-4111-8111-111111111111', name: 'lobby' });
    const arena = stub<Level>({ id: '22222222-2222-4222-8222-222222222222', name: 'arena' });
    const archive = {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'archive',
        folder: 'archive',
        state: 'detached' as const,
        world: { seed: 1 }
    };
    const steve = stub<PlayerSession>({
        identity: identityNamed('Steve', '00000000-0000-0000-0000-000000000007'),
        getWorld: () => stub<World>({ getLevel: () => arena })
    });

    const members = (created: Array<{ name: string; world: WorldData }> = []) =>
        scriptLevelMembers(
            stub<Server>({
                getSessionManager: () => stub<SessionManager>({ getSessions: () => [steve] }),
                getWorldManager: () =>
                    stub<WorldManager>({
                        getEntryLevel: () => lobby,
                        getLevels: () => [lobby, arena],
                        getLevel: (name: string) => [lobby, arena].find((level) => level.name === name),
                        getLevelById: (id: string) => [lobby, arena].find((level) => level.id === id),
                        getRegisteredLevels: () => [
                            { ...arena, folder: 'arena', state: 'attached', world: { seed: 1 } },
                            archive
                        ],
                        createLevel: async (name: string, world: WorldData) => {
                            created.push({ name, world });
                            return stub<Level>({ id: '44444444-4444-4444-8444-444444444444', name });
                        }
                    })
            }),
            arena,
            (player) => (player === '7' ? steve : undefined)
        );

    it('lists the attached levels with their players, then the detached ones the registry keeps, once each', () => {
        expect(members().list()).toEqual([
            { id: lobby.id, name: 'lobby', attached: true, entry: true, players: [] },
            { id: arena.id, name: 'arena', attached: true, entry: false, players: ['Steve'] },
            { id: archive.id, name: 'archive', attached: false, entry: false, players: [] }
        ]);
    });

    it("answers the runtime's level and the level a player is in", () => {
        expect(members().current().name).toBe('arena');
        expect(members().levelOf('7')?.name).toBe('arena');
        expect(members().levelOf('8')).toBeUndefined();
    });

    it('refuses to move a player to a level that is not attached, by name or UUID', async () => {
        await expect(members().transfer('7', 'archive', false)).rejects.toThrow('archive');
        await expect(members().transfer('7', archive.id, false)).rejects.toThrow(archive.id);
    });

    it('creates a level with the default preset and a seed of its own when the pack names neither', async () => {
        const created: Array<{ name: string; world: WorldData }> = [];
        const made = await members(created).create('skyblock', undefined, undefined);

        expect(made).toMatchObject({ name: 'skyblock', attached: true, entry: false });
        expect(created[0]?.world.preset).toBe(DEFAULT_CREATED_PRESET);
        expect(String(created[0]?.world.seed)).toMatch(/^-?\d+$/);
    });
});
