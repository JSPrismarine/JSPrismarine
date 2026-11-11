import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '@jsprismarine/logger';
import pkg from '../../package.json' with { type: 'json' };
import Console from '../Console';
import { parseConfigDocument } from '../config/ConfigDocument';
import type Player from '../Player';
import type SessionManager from '../SessionManager';
import type PlayerToggleOperatorEvent from '../events/player/PlayerToggleOperatorEvent';
import type PlayerSession from '../network/PlayerSession';
import { fakePlayer } from '../testing/fakePlayer.test.helper';
import { stub } from '../testing/stub.test.helper';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { canExecute, PermissionManager } from './PermissionManager';
import type { PermissionManagerServer } from './PermissionManager';
import { identityNamed } from '../testing/sessionIdentity.test.helper';

const FILFAT_UUID = 'fbf8646c-652c-38c4-96ff-a29d86cb5943';

/** Reads JSONC without treating the `//` inside a URL as a comment. */
const plain = (text: string): unknown => parseConfigDocument(text).get([]);

describe('permission', () => {
    describe('PermissionManager', () => {
        it('can().execute() should work', () => {
            expect(
                canExecute({
                    isOp: () => false,
                    getPermissions: () => ['namespace.scope.action']
                }).execute('namespace.scope.action')
            ).toBe(true);

            expect(
                canExecute({
                    isOp: () => false,
                    getPermissions: () => ['namespace.scope.action']
                }).execute('namespace.scope.action.subaction')
            ).toBe(true);

            expect(
                canExecute({
                    isOp: () => false,
                    getPermissions: () => ['namespace.scope.action.subaction.whoop']
                }).execute('namespace.scope.action.subaction')
            ).toBe(false);

            expect(
                canExecute({
                    isOp: () => false,
                    getPermissions: () => ['namespace.scope.*']
                }).execute('namespace.scope.action.subaction')
            ).toBe(true);

            expect(
                canExecute({
                    isOp: () => false,
                    getPermissions: () => ['*']
                }).execute('namespace.scope.action.subaction')
            ).toBe(true);

            expect(
                canExecute({
                    isOp: () => false,
                    getPermissions: () => ['othernamespace.scope.action']
                }).execute('namespace.scope.action.subaction')
            ).toBe(false);

            expect(
                canExecute({
                    isOp: () => false,
                    getPermissions: () => []
                }).execute('namespace.scope.action.subaction')
            ).toBe(false);
        });

        it('can().execute() should handle op', () => {
            expect(
                canExecute({
                    isOp: () => true,
                    getPermissions: () => []
                }).execute('namespace.scope.action.subaction')
            ).toBe(true);

            expect(
                canExecute({
                    isOp: () => true,
                    getPermissions: () => []
                })
                    .not()
                    .execute('namespace.scope.action.subaction')
            ).toBe(false);
        });

        it('can().execute() should allow the console', () => {
            const console: Console = Object.create(Console.prototype);

            expect(canExecute(console).execute('namespace.scope.action')).toBe(true);
        });

        it('can().execute() should handle no permission', () => {
            expect(canExecute({ isOp: () => false, getPermissions: () => [] }).execute()).toBe(true);
        });
    });

    describe('PermissionManager files', () => {
        let directory: string;
        let logger: Logger;
        let manager: PermissionManager;

        beforeEach(() => {
            directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-permission-test-'));
            vi.stubEnv('JSP_DIR', directory);
            logger = new Logger();
            vi.spyOn(logger, 'warn').mockImplementation(() => {});
            vi.spyOn(logger, 'error').mockImplementation(() => {});
            const server: PermissionManagerServer = {
                getLogger: () => logger,
                getSessionManager: () => {
                    throw new Error('not needed here');
                },
                post: () => {
                    throw new Error('not needed here');
                }
            };
            manager = new PermissionManager(server);
        });

        afterEach(() => {
            vi.unstubAllEnvs();
            vi.restoreAllMocks();
            rmSync(directory, { recursive: true, force: true });
        });

        it('creates both files on first start, with the permissions explained', async () => {
            await manager.enable();

            const permissions = readFileSync(path.join(directory, 'permissions.json'), 'utf8');
            expect(permissions).toContain('// Permissions every player has.');
            expect(permissions).toContain('// Permissions every operator has on top of the defaults.');
            expect(plain(permissions)).toStrictEqual({
                $schema: `https://unpkg.com/@jsprismarine/prismarine@${pkg.version}/schemas/permissions.schema.json`,
                defaultPermissions: [
                    'minecraft.command.help',
                    'minecraft.command.list',
                    'minecraft.command.me',
                    'jsprismarine.command.plugins',
                    'jsprismarine.command.version',
                    'jsprismarine.command.tps'
                ],
                defaultOperatorPermissions: ['*'],
                players: [{ name: 'filfat', uuid: FILFAT_UUID, permissions: ['*'] }]
            });
            expect(readFileSync(path.join(directory, 'ops.json'), 'utf8')).toContain('// JSPrismarine schema:');
            expect(manager.getDefaultPermissions()).toHaveLength(6);
        });

        it('grants the default owner permission to run /op by UUID', async () => {
            await manager.enable();

            let grants: string[] = [];
            const owner = stub<Player>({
                getName: () => 'Filfat',
                getUUID: () => UUID.fromString(FILFAT_UUID),
                isOp: () => false,
                getPermissions: () => grants
            });
            grants = await manager.getPermissions(owner);

            expect(manager.can(owner).execute('minecraft.command.op')).toBe(true);

            let otherGrants: string[] = [];
            const sameNameWithAnotherUuid = stub<Player>({
                getName: () => 'filfat',
                getUUID: () => UUID.fromString('00000000-0000-0000-0000-000000000001'),
                isOp: () => false,
                getPermissions: () => otherGrants
            });
            otherGrants = await manager.getPermissions(sameNameWithAnotherUuid);

            expect(manager.can(sameNameWithAnotherUuid).execute('minecraft.command.op')).toBe(false);
        });

        it('reads and sets permissions by the UUID of a login identity', async () => {
            await manager.enable();
            const identity = identityNamed('Filfat', FILFAT_UUID);

            expect(await manager.getPermissions(identity)).toContain('*');

            const other = identityNamed('Other', '00000000-0000-0000-0000-000000000004');
            manager.setPermissions(other, ['namespace.scope.action']);
            const player = stub<Player>({ getUUID: () => UUID.fromString(other.uuid) });
            expect(await manager.getPermissions(player)).toContain('namespace.scope.action');
        });

        it('loads commented permission and operator entries by UUID', async () => {
            const permissionUuid = '00000000-0000-0000-0000-000000000002';
            const operatorUuid = '00000000-0000-0000-0000-000000000003';
            writeFileSync(
                path.join(directory, 'permissions.json'),
                `{
  // trimmed down
  "players": [
    { "name": "alice", "uuid": "${permissionUuid}", "permissions": ["minecraft.command.kick"] },
    { "name": "legacy", "permissions": ["*"] },
    { "name": 7 }
  ]
}
`
            );
            writeFileSync(
                path.join(directory, 'ops.json'),
                `[
  { "name": "bob", "uuid": "${operatorUuid}", "level": 4 }, // the owner
  { "name": "legacy-op", "level": 4 },
  "junk"
]
`
            );

            await manager.enable();

            const playerWithPermission = async (name: string, uuid: string) => {
                let grants: string[] = [];
                const player = stub<Player>({
                    getName: () => name,
                    getUUID: () => UUID.fromString(uuid),
                    isOp: () => manager.isOp(uuid),
                    getPermissions: () => grants
                });
                grants = await manager.getPermissions(player);
                return player;
            };
            const renamedPlayer = await playerWithPermission('renamed-alice', permissionUuid);
            const nameCollision = await playerWithPermission('alice', '00000000-0000-0000-0000-000000000004');
            const operator = await playerWithPermission('renamed-bob', operatorUuid);

            expect(manager.can(renamedPlayer).execute('minecraft.command.kick')).toBe(true);
            expect(manager.can(nameCollision).execute('minecraft.command.kick')).toBe(false);
            expect(operator.isOp()).toBe(true);
            expect(manager.isOp('legacy-op')).toBe(false);
            expect(manager.can(operator).execute('minecraft.command.stop')).toBe(true);
        });

        it('refuses a permissions file that does not parse', async () => {
            writeFileSync(path.join(directory, 'permissions.json'), '{ "defaultPermissions": [');

            await expect(manager.enable()).rejects.toThrow('Invalid permissions.json file.');
        });

        it('makes an online player an operator through its session', async () => {
            const uuid = '00000000-0000-0000-0000-000000000007';
            const sent: string[] = [];
            const session = stub<PlayerSession>({
                identity: identityNamed('carol', uuid),
                sendAvailableCommands: async () => void sent.push('commands'),
                announceSettings: async () => void sent.push('settings')
            });
            const posted: PlayerToggleOperatorEvent[] = [];
            const opManager = new PermissionManager({
                getLogger: () => logger,
                getSessionManager: () =>
                    stub<SessionManager>({
                        findSession: ({ name }) => (name === 'carol' ? session : null)
                    }),
                post: (entry) => (entry[0] === 'playerToggleOperator' ? posted.push(entry[1]) : posted.length)
            });
            await opManager.enable();

            expect(await opManager.setOp('carol', true)).toBe(true);

            expect(posted.map((event) => [event.getSession(), event.getOperator()])).toEqual([[session, true]]);
            expect(sent).toEqual(['commands', 'settings']);
            expect(opManager.isOp(uuid)).toBe(true);
            expect(plain(readFileSync(path.join(directory, 'ops.json'), 'utf8'))).toContainEqual({
                name: 'carol',
                uuid,
                level: 4
            });
            await expect(opManager.setOp('nobody', true)).rejects.toThrow();
        });

        it('adds and removes one operator line and keeps the comments', async () => {
            const file = path.join(directory, 'ops.json');
            const aliceUuid = '00000000-0000-0000-0000-000000000005';
            const bobUuid = '00000000-0000-0000-0000-000000000006';
            writeFileSync(
                file,
                `[
    // The owner.
    { "name": "alice", "uuid": "${aliceUuid}", "level": 4 }
]
`
            );

            await manager['writeOp'](bobUuid, 'bob', true);
            let text = readFileSync(file, 'utf8');
            expect(text).toContain('// The owner.');
            expect(plain(text)).toStrictEqual([
                { name: 'alice', uuid: aliceUuid, level: 4 },
                { name: 'bob', uuid: bobUuid, level: 4 }
            ]);

            await manager['writeOp'](bobUuid, 'bob', true);
            expect(plain(readFileSync(file, 'utf8'))).toHaveLength(2);

            await manager['writeOp'](aliceUuid, 'alice', false);
            text = readFileSync(file, 'utf8');
            expect(plain(text)).toStrictEqual([{ name: 'bob', uuid: bobUuid, level: 4 }]);
            expect(text).toContain('// The owner.');
        });

        /**
         * A real player, connected to a real permission manager over this test's directory. The
         * network session is a double that reports whether the player could run `/stop` each time
         * it is asked to send the command list.
         */
        const operatorCandidate = async (sendAvailableCommands?: () => Promise<void>) => {
            const { player, server } = fakePlayer();
            const permissionsWhenCommandsSent: boolean[] = [];
            const real = new PermissionManager({
                getLogger: () => logger,
                getSessionManager: () => stub<SessionManager>({ getPlayerByExactName: () => player }),
                post: () => 0
            });
            Object.assign(server, { getPermissionManager: () => real });
            vi.spyOn(player, 'getNetworkSession').mockReturnValue(
                stub<PlayerSession>({
                    sendAvailableCommands:
                        sendAvailableCommands ??
                        (async () =>
                            void permissionsWhenCommandsSent.push(real.can(player).execute('minecraft.command.stop')))
                })
            );
            vi.spyOn(player, 'sendSettings').mockResolvedValue();
            await real.enable();
            return { player, manager: real, permissionsWhenCommandsSent };
        };

        it("drops a deopped player's operator permissions before their next command", async () => {
            const { player, manager: real, permissionsWhenCommandsSent } = await operatorCandidate();

            await real.setOp(player.getName(), true);
            expect(player.getPermissions()).toContain('*');
            expect(real.can(player).execute('minecraft.command.stop')).toBe(true);

            await real.setOp(player.getName(), false);
            expect(player.getPermissions()).not.toContain('*');
            expect(real.can(player).execute('minecraft.command.stop')).toBe(false);
            // The command list each change sends reflects the status it set.
            expect(permissionsWhenCommandsSent).toStrictEqual([true, false]);
        });

        it("applies a player's replaced grants without a reconnect", async () => {
            const { player, manager: real } = await operatorCandidate();

            real.setPermissions(player, ['minecraft.command.kick']);
            expect(real.can(player).execute('minecraft.command.kick')).toBe(true);

            real.setPermissions(player, []);
            expect(real.can(player).execute('minecraft.command.kick')).toBe(false);
        });

        it('saves a deop even when the command list cannot be sent', async () => {
            const { player, manager: real } = await operatorCandidate(async () => {
                throw new Error('the client went away');
            });
            await real['writeOp'](player.getUUID().toString(), player.getName(), true);

            expect(await real.setOp(player.getName(), false)).toBe(false);

            expect(plain(readFileSync(path.join(directory, 'ops.json'), 'utf8'))).toStrictEqual([]);
            expect(player.isOp()).toBe(false);
        });
    });
});
