import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { CommandSource, EntityRef } from '@jsprismarine/commands';
import { CommandRegistry, createCommandSource, testCommandHost } from '@jsprismarine/commands';
import { Logger } from '@jsprismarine/logger';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type Server from '../Server';
import type SessionManager from '../SessionManager';
import { parseConfigDocument } from '../config/ConfigDocument';
import type { Subject } from '../identity/Subject';
import type PlayerSession from '../player/PlayerSession';
import { PermissionManager } from '../permission/PermissionManager';
import { identityNamed } from '../testing/sessionIdentity.test.helper';
import { testKernel } from '../testing/kernel.test.helper';
import { stub } from '../testing/stub.test.helper';
import type { Level } from '../world/Level';
import type { StoreActor } from '../entity/data/storeActors';
import type { World } from '../world/World';
import type WorldManager from '../world/WorldManager';
import { collectAsyncCommands } from './deferred';
import { PERMS_SUBCOMMANDS, permsSubcommandNode, registerPermsCommand } from './permsCommand';

const NOON = Date.parse('2026-11-21T12:00:00Z');

describe('/perms', () => {
    let directory: string;
    let registry: CommandRegistry<CommandSource>;
    let permissions: PermissionManager;
    let feedback: string[];
    let errors: string[];
    /** Steve is online as an offline-mode player with entity id 7, Alex with entity id 8. */
    const steve = identityNamed('Steve', '00000000-0000-0000-0000-000000000007');
    const alex = identityNamed('Alex', '00000000-0000-0000-0000-000000000008');
    const steveRef: EntityRef = {
        id: '7',
        type: 'minecraft:player',
        name: 'Steve',
        isPlayer: true,
        position: { x: 0, y: 0, z: 0 },
        rotation: { yaw: 0, pitch: 0 },
        dimension: 'minecraft:overworld'
    };
    const alexRef: EntityRef = { ...steveRef, id: '8', name: 'Alex' };
    const xboxSteve: Subject = { kind: 'xbox', xuid: '2535400000000001' };

    beforeEach(async () => {
        directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-perms-command-'));
        vi.stubEnv('JSP_DIR', directory);
        vi.useFakeTimers({ now: NOON, toFake: ['Date'] });
        // Quiet: the first start warns that the files are missing and says what it wrote.
        const logger = new Logger('error');
        feedback = [];
        errors = [];
        const online = (identity: typeof steve, runtimeId: bigint) =>
            stub<PlayerSession>({
                identity,
                getRuntimeId: () => runtimeId,
                isOp: () => false,
                hasPermission: (node) => permissions.has(identity, node)
            });
        const sessions = new Map([
            [7n, online(steve, 7n)],
            [8n, online(alex, 8n)]
        ]);
        const sessionManager = stub<SessionManager>({ getSessions: () => [...sessions.values()] });
        const world: World = stub<World>({
            getActor: (runtimeId: bigint): StoreActor | null =>
                sessions.has(runtimeId)
                    ? stub<StoreActor>({ getWorld: () => world, getRuntimeId: () => runtimeId })
                    : null,
            viewerOf: (runtimeId: bigint) => sessions.get(runtimeId)
        });
        const server = stub<Server>({
            getLogger: () => logger,
            getSessionManager: () => sessionManager,
            getKernel: () => testKernel(),
            getPermissionManager: () => permissions,
            getWorldManager: () =>
                stub<WorldManager>({
                    getLevels: () => [
                        stub<Level>({
                            worlds: function* () {
                                yield world;
                            }
                        })
                    ]
                })
        });
        permissions = new PermissionManager(server, { watch: false });
        await permissions.enable();
        registry = new CommandRegistry<CommandSource>();
        registerPermsCommand(registry, server);
    });

    afterEach(async () => {
        await permissions.disable();
        vi.useRealTimers();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        rmSync(directory, { recursive: true, force: true });
    });

    /** Runs one line as the console, or as typed by Steve, the player entity 7, when `asPlayer` is set. */
    const run = async (line: string, asPlayer = false): Promise<void> => {
        const source = createCommandSource({
            host: testCommandHost({ entities: { select: () => [steveRef] } }),
            ...(asPlayer ? { entity: steveRef, caller: steveRef } : {}),
            permissionLevel: asPlayer ? CommandPermissionLevel.ANY : CommandPermissionLevel.INTERNAL,
            onFeedback: (message) => void feedback.push(message),
            onError: (message) => void errors.push(message)
        });
        try {
            await Promise.all(collectAsyncCommands(() => registry.getDispatcher().execute(line, source)));
        } catch (error: unknown) {
            errors.push(String(error));
        }
    };

    const file = () => parseConfigDocument(readFileSync(path.join(directory, 'permissions.json'), 'utf8')).get([]);

    it('shows a user, with their groups, nodes, meta and command level', async () => {
        await run('perms user Steve info');

        expect(feedback).toEqual([
            '§eSteve§r (offline Steve)',
            'Groups, heaviest first: default',
            'Primary group: default',
            'Own groups:',
            '  (none)',
            'Own nodes:',
            '  (none)',
            'Own meta:',
            '  (none)',
            'Command level: 0'
        ]);
    });

    it('sets and unsets a user permission, with an expiry as an instant or a duration', async () => {
        await run('perms user Steve permission set minecraft.command.kick');
        await run('perms user Steve permission set minecraft.command.stop 2d');
        await run('perms user Steve permission set minecraft.command.op 2026-12-01T00:00:00Z');
        await run('perms user Steve permission unset minecraft.command.kick');
        await run('perms user Steve permission unset minecraft.command.kick');

        expect(feedback).toEqual([
            'Set minecraft.command.kick for Steve',
            'Set minecraft.command.stop for Steve until 2026-11-23T12:00:00.000Z',
            'Set minecraft.command.op for Steve until 2026-12-01T00:00:00.000Z',
            'Unset minecraft.command.kick for Steve',
            'Steve does not have minecraft.command.kick'
        ]);
        expect(permissions.userOf(steve.subject)?.nodes).toEqual([
            { node: 'minecraft.command.stop', expires: '2026-11-23T12:00:00.000Z' },
            { node: 'minecraft.command.op', expires: '2026-12-01T00:00:00.000Z' }
        ]);
    });

    it('adds a user to a group and removes them, and refuses a group that does not exist', async () => {
        await run('perms group create vip');
        await run('perms user Steve group add vip 1w');
        await run('perms user Steve group add nobody');
        await run('perms user Steve group remove vip');
        await run('perms user Steve group remove vip');

        expect(feedback).toEqual([
            'Created group vip',
            'Added Steve to vip until 2026-11-28T12:00:00.000Z',
            'Removed Steve from vip',
            'Steve is not in vip'
        ]);
        expect(errors).toEqual([expect.stringContaining('No permission group named "nobody"')]);
    });

    it('sets and unsets user meta, a value with spaces included', async () => {
        await run('perms user Steve meta set prefix §6[Owner] §r');
        await run('perms user Steve meta set level 2');
        expect(permissions.metaOf(steve, 'prefix')).toBe('§6[Owner] §r');
        expect(permissions.commandLevelOf(steve)).toBe(2);

        await run('perms user Steve meta unset prefix');
        expect(permissions.metaOf(steve, 'prefix')).toBeUndefined();
        expect(feedback).toEqual(['Set prefix for Steve', 'Set level for Steve', 'Unset prefix for Steve']);
    });

    it('manages groups: list, create, delete, info, permissions, parents, weight and meta', async () => {
        await run('perms group create staff');
        await run('perms group create mod');
        await run('perms group staff permission set minecraft.command.kick');
        await run('perms group staff permission set minecraft.command.ban 12h');
        await run('perms group staff parent add mod');
        await run('perms group staff weight 50');
        await run('perms group staff meta set prefix [Staff] ');
        await run('perms group staff info');
        await run('perms group list');
        await run('perms group staff permission unset minecraft.command.kick');
        await run('perms group staff parent remove mod');
        await run('perms group staff meta unset prefix');
        await run('perms group delete mod');
        await run('perms group delete default');

        expect(feedback).toEqual([
            'Created group staff',
            'Created group mod',
            'Set minecraft.command.kick for group staff',
            'Set minecraft.command.ban for group staff until 2026-11-22T00:00:00.000Z',
            'Added mod as a parent of staff',
            'Set the weight of staff to 50',
            'Set prefix for group staff',
            '§estaff§r, weight 50',
            'Parents: mod',
            'Nodes:',
            '  minecraft.command.kick',
            '  minecraft.command.ban (expires 2026-11-22T00:00:00.000Z)',
            'Meta:',
            '  prefix = [Staff] ',
            'default (weight 0)',
            'operator (weight 100)',
            'staff (weight 50)',
            'mod (weight 0)',
            'Unset minecraft.command.kick for group staff',
            'Removed mod as a parent of staff',
            'Unset prefix for group staff',
            'Deleted group mod'
        ]);
        expect(errors).toEqual([expect.stringContaining('built in')]);
        expect(file()).toMatchObject({
            groups: { staff: { weight: 50, parents: [], nodes: [expect.anything()], meta: {} } }
        });
    });

    it('refuses a parent that would make a group its own ancestor', async () => {
        await run('perms group create a');
        await run('perms group create b');
        await run('perms group a parent add b');
        await run('perms group b parent add a');
        await run('perms group a parent add a');

        expect(feedback).toEqual(['Created group a', 'Created group b', 'Added b as a parent of a']);
        expect(errors).toEqual([
            expect.stringContaining('Making a a parent of b would make b its own ancestor'),
            expect.stringContaining('Making a a parent of a would make a its own ancestor')
        ]);
        expect(permissions.groupOf('b')?.parents).toEqual([]);
    });

    it('reads both files again on reload, so an edit made on disk applies', async () => {
        const document = parseConfigDocument(readFileSync(path.join(directory, 'permissions.json'), 'utf8'));
        document.set(['groups', 'default', 'meta'], { prefix: 'edited' });
        writeFileSync(path.join(directory, 'permissions.json'), document.toString());
        expect(permissions.metaOf(steve, 'prefix')).toBeUndefined();

        await run('perms reload');

        expect(permissions.metaOf(steve, 'prefix')).toBe('edited');
        expect(feedback).toEqual(['Reloaded permissions.json and ops.json']);
    });

    describe('targets', () => {
        it('refuses a selector the parser did not read to its end', async () => {
            await run('perms user @a[name=Steve][name=Bob] permission set a.b');

            expect(errors).toEqual([expect.stringContaining('@a[name=Steve][name=Bob] is not a selector')]);
            expect(permissions.has(steve, 'a.b')).toBe(false);
        });

        it('takes a selector that names one online player', async () => {
            await run('perms user @p permission set minecraft.command.me');

            expect(feedback).toEqual(['Set minecraft.command.me for Steve']);
            expect(permissions.has(steve, 'minecraft.command.me')).toBe(true);
        });

        it('takes a name the file knows while the player is offline', async () => {
            // Casey is in the file and not online, unlike Steve and Alex.
            await permissions.grantUser({ subject: { kind: 'offline', name: 'Casey' }, name: 'Casey' }, 'a.b');

            await run('perms user Casey info');
            await run('perms user Nobody info');

            expect(feedback[0]).toBe('§eCasey§r (offline Casey)');
            expect(errors).toEqual([
                expect.stringContaining('No player named Nobody is online or in permissions.json')
            ]);
        });

        it('refuses a name on more than one platform, and takes the qualified form', async () => {
            await permissions.grantUser({ subject: xboxSteve, name: 'Steve' }, 'a.b');

            await run('perms user Steve info');
            await run('perms user xbox:Steve info');
            await run('perms user offline:Steve info');
            await run('perms user java:Steve info');

            expect(errors).toEqual([
                expect.stringContaining(
                    'Steve names more than one player; name one of offline:Steve, xbox:2535400000000001'
                ),
                expect.stringContaining('No java player named Steve is online or in permissions.json')
            ]);
            expect(feedback.filter((line) => line.startsWith('§e'))).toEqual([
                '§eSteve§r (xbox 2535400000000001)',
                '§eSteve§r (offline Steve)'
            ]);
        });

        it('takes the key in the qualified form, and lists each candidate by key when two stored users of one kind share a name', async () => {
            await permissions.grantUser({ subject: { kind: 'xbox', xuid: '111' }, name: 'Casey' }, 'a.b');
            await permissions.grantUser({ subject: { kind: 'xbox', xuid: '222' }, name: 'Casey' }, 'c.d');

            await run('perms user Casey info');
            await run('perms user xbox:Casey info');
            await run('perms user xbox:222 info');

            expect(errors).toEqual([
                expect.stringContaining('Casey names more than one player; name one of xbox:111, xbox:222'),
                expect.stringContaining('Casey names more than one player; name one of xbox:111, xbox:222')
            ]);
            expect(feedback.filter((line) => line.startsWith('§e'))).toEqual(['§eCasey§r (xbox 222)']);
            expect(feedback).toContain('  c.d');
        });

        it("reads a qualified value as a key first, an online player's included, and as a name only when it is nobody's key", async () => {
            // A stored user whose name is another player's key: the key wins.
            await permissions.grantUser({ subject: { kind: 'offline', name: '7' }, name: 'Seven' }, 'a.b');
            await permissions.grantUser({ subject: { kind: 'offline', name: 'Steve' }, name: 'Steve' }, 'c.d');

            await run('perms user offline:Steve info');
            await run('perms user offline:7 info');
            await run('perms user offline:Seven info');

            expect(errors).toEqual([]);
            expect(feedback.filter((line) => line.startsWith('§e'))).toEqual([
                '§eSteve§r (offline Steve)',
                '§eSeven§r (offline 7)',
                '§eSeven§r (offline 7)'
            ]);
        });
    });

    describe('gates', () => {
        it('gates each subcommand by its own node for a player, and lets the console run every one', async () => {
            await run('perms group list', true);
            expect(errors).toEqual([expect.stringContaining(permsSubcommandNode('group.list'))]);
            expect(feedback).toEqual([]);

            await permissions.grantUser(steve, permsSubcommandNode('group.list'));
            await run('perms group list', true);
            expect(feedback).toHaveLength(2);

            await run('perms group create vip', true);
            expect(errors).toHaveLength(2);
            expect(permissions.groupOf('vip')).toBeUndefined();
        });

        it('covers every subcommand with the bare command node, less the ones negated', async () => {
            await permissions.grantUser(steve, 'jsprismarine.command.perms');
            await permissions.grantUser(steve, `-${permsSubcommandNode('group.delete')}`);

            await run('perms group create vip', true);
            await run('perms group delete vip', true);

            expect(feedback).toEqual(['Created group vip']);
            expect(errors).toEqual([expect.stringContaining('group.delete')]);
        });

        it("gates on the player who typed the command, so `execute as` lends nobody another player's authority", async () => {
            await permissions.grantUser(alex, 'jsprismarine.command.perms');
            // Steve types the command and runs it as Alex, who is online and may run every subcommand.
            const typed = createCommandSource({
                host: testCommandHost({ entities: { select: () => [steveRef] } }),
                entity: steveRef,
                caller: steveRef,
                permissionLevel: CommandPermissionLevel.ANY,
                onFeedback: (message) => void feedback.push(message),
                onError: (message) => void errors.push(message)
            });
            const asAlex = typed.withEntity(alexRef);

            await Promise.all(
                collectAsyncCommands(() => registry.getDispatcher().execute('perms group create vip', asAlex))
            );
            expect(permissions.groupOf('vip')).toBeUndefined();
            expect(errors).toEqual([expect.stringContaining('group.create')]);

            // Typed by Alex, the same line runs.
            const alexTyped = createCommandSource({
                host: testCommandHost({ entities: { select: () => [alexRef] } }),
                entity: alexRef,
                caller: alexRef,
                permissionLevel: CommandPermissionLevel.ANY,
                onFeedback: (message) => void feedback.push(message),
                onError: (message) => void errors.push(message)
            });
            await Promise.all(
                collectAsyncCommands(() => registry.getDispatcher().execute('perms group create vip', alexTyped))
            );
            expect(permissions.groupOf('vip')).toBeDefined();
            expect(errors).toHaveLength(1);
        });

        it('names a node for every subcommand the plan lists', () => {
            expect([...PERMS_SUBCOMMANDS].sort()).toEqual(
                [
                    'user.info',
                    'user.permission.set',
                    'user.permission.unset',
                    'user.group.add',
                    'user.group.remove',
                    'user.meta.set',
                    'user.meta.unset',
                    'group.list',
                    'group.create',
                    'group.delete',
                    'group.info',
                    'group.permission.set',
                    'group.permission.unset',
                    'group.parent.add',
                    'group.parent.remove',
                    'group.weight',
                    'group.meta.set',
                    'group.meta.unset',
                    'reload'
                ].sort()
            );
            expect(registry.getMetadata('perms')?.permissionLevel).toBe(CommandPermissionLevel.ANY);
        });
    });

    it('takes an expiry as an instant with a time zone, and stores it as the file spells one', async () => {
        await run('perms user Steve permission set a.b 2030-01-01T00:00:00Z');
        await run('perms user Steve permission set c.d 2030-01-01T02:00:00+02:00');
        await run('perms user Steve permission set e.f 2030-01-01T00:00:00');
        await run('perms user Steve permission set g.h soon');

        expect(permissions.userOf(steve.subject)?.nodes).toEqual([
            { node: 'a.b', expires: '2030-01-01T00:00:00.000Z' },
            { node: 'c.d', expires: '2030-01-01T00:00:00.000Z' }
        ]);
        expect(errors).toEqual([expect.stringContaining('ISO 8601'), expect.stringContaining('ISO 8601')]);
    });
});
