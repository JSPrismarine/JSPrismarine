import { testKernel } from '../testing/kernel.test.helper';
import { KernelEventBus } from '@jsprismarine/kernel';
import type { ServerEvents } from '../events/ServerEvents';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '@jsprismarine/logger';
import pkg from '../../package.json' with { type: 'json' };
import Console from '../Console';
import { parseConfigDocument } from '../config/ConfigDocument';
import type SessionManager from '../SessionManager';
import type PlayerToggleOperatorEvent from '../events/player/PlayerToggleOperatorEvent';
import type PlayerSession from '../network/PlayerSession';
import { fakePlayer } from '../testing/fakePlayer.test.helper';
import { stub } from '../testing/stub.test.helper';
import { canExecute, PermissionManager } from './PermissionManager';
import type { PermissionManagerServer } from './PermissionManager';
import { identityNamed } from '../testing/sessionIdentity.test.helper';

/** A kernel whose bus has one `playerToggleOperator` listener. */
const kernelPosting = (listener: (event: PlayerToggleOperatorEvent) => void) => {
    const events = new KernelEventBus<ServerEvents>();
    events.on('playerToggleOperator', listener);
    return testKernel(events);
};

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
                getKernel: () => {
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
            const owner = stub<PlayerSession>({
                getName: () => 'Filfat',
                isOp: () => false,
                getPermissions: () => grants
            });
            grants = await manager.getPermissions({ uuid: FILFAT_UUID });

            expect(manager.can(owner).execute('minecraft.command.op')).toBe(true);

            let otherGrants: string[] = [];
            const sameNameWithAnotherUuid = stub<PlayerSession>({
                getName: () => 'filfat',
                isOp: () => false,
                getPermissions: () => otherGrants
            });
            otherGrants = await manager.getPermissions({ uuid: '00000000-0000-0000-0000-000000000001' });

            expect(manager.can(sameNameWithAnotherUuid).execute('minecraft.command.op')).toBe(false);
        });

        it('reads and sets permissions by the UUID of a login identity', async () => {
            await manager.enable();
            const identity = identityNamed('Filfat', FILFAT_UUID);

            expect(await manager.getPermissions(identity)).toContain('*');

            const other = identityNamed('Other', '00000000-0000-0000-0000-000000000004');
            manager.setPermissions(other, ['namespace.scope.action']);
            expect(await manager.getPermissions({ uuid: other.uuid })).toContain('namespace.scope.action');
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
                const player = stub<PlayerSession>({
                    getName: () => name,
                    isOp: () => manager.isOp(uuid),
                    getPermissions: () => grants
                });
                grants = await manager.getPermissions({ uuid });
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
                getKernel: () => kernelPosting((event) => void posted.push(event))
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

        it('sends the command list once the operator change is made, so it lists what the player may now run', async () => {
            const uuid = '00000000-0000-0000-0000-000000000008';
            const opWhenListed: boolean[] = [];
            const opManager: PermissionManager = new PermissionManager({
                getLogger: () => logger,
                getSessionManager: () => stub<SessionManager>({ findSession: () => session }),
                getKernel: () => kernelPosting(() => {})
            });
            const session = stub<PlayerSession>({
                identity: identityNamed('dave', uuid),
                sendAvailableCommands: async () => void opWhenListed.push(opManager.isOp(uuid)),
                announceSettings: async () => {}
            });
            await opManager.enable();

            await opManager.setOp('dave', true);
            await opManager.setOp('dave', false);

            expect(opWhenListed).toEqual([true, false]);
        });

        describe('setOpNow', () => {
            /** A manager that keeps the events it posts, and cancels each when `cancel` is set. */
            const managerOf = (cancel = false) => {
                const posted: PlayerToggleOperatorEvent[] = [];
                const opManager = new PermissionManager({
                    getLogger: () => logger,
                    getSessionManager: () => stub<SessionManager>(),
                    getKernel: () =>
                        kernelPosting((event) => {
                            if (cancel) event.preventDefault();
                            posted.push(event);
                        })
                });
                return { opManager, posted };
            };
            const online = (name: string, uuid: string, sent: string[] = []) =>
                stub<PlayerSession>({
                    identity: identityNamed(name, uuid),
                    sendAvailableCommands: async () => void sent.push(`${name} commands`),
                    announceSettings: async () => void sent.push(`${name} settings`)
                });
            const opsFile = () => plain(readFileSync(path.join(directory, 'ops.json'), 'utf8'));

            it('changes the list before it returns and writes the file afterwards', async () => {
                const uuid = '00000000-0000-0000-0000-000000000009';
                const sent: string[] = [];
                const erin = online('erin', uuid, sent);
                const { opManager, posted } = managerOf();
                await opManager.enable();

                const told = opManager.setOpNow(erin, true);

                expect(opManager.isOp(uuid)).toBe(true);
                expect(posted.map((event) => [event.getSession(), event.getOperator()])).toEqual([[erin, true]]);
                expect(opsFile()).toEqual([]);

                await told;
                await opManager.disable();
                expect(sent).toEqual(['erin commands', 'erin settings']);
                expect(opsFile()).toEqual([{ name: 'erin', uuid, level: 4 }]);
            });

            it('writes every change made in a row, in order, without losing one', async () => {
                const frankUuid = '00000000-0000-0000-0000-00000000000a';
                const gwenUuid = '00000000-0000-0000-0000-00000000000b';
                const frank = online('frank', frankUuid);
                const gwen = online('gwen', gwenUuid);
                const { opManager } = managerOf();
                await opManager.enable();

                const told = [
                    opManager.setOpNow(frank, true),
                    opManager.setOpNow(gwen, true),
                    opManager.setOpNow(frank, false)
                ];
                await Promise.all(told);
                await opManager.disable();

                expect(opsFile()).toEqual([{ name: 'gwen', uuid: gwenUuid, level: 4 }]);
            });

            it('changes nothing and tells nobody when a listener cancels', async () => {
                const uuid = '00000000-0000-0000-0000-00000000000c';
                const sent: string[] = [];
                const hal = online('hal', uuid, sent);
                const { opManager, posted } = managerOf(true);
                await opManager.enable();

                expect(opManager.setOpNow(hal, true)).toBeUndefined();

                await opManager.disable();
                expect(posted).toHaveLength(1);
                expect(sent).toEqual([]);
                expect(opManager.isOp(uuid)).toBe(false);
                expect(opsFile()).toEqual([]);
            });
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
         * A real session, connected to a real permission manager over this test's directory. Its
         * sends are doubles: the command list reports whether the player could run `/stop` each
         * time it is asked for.
         */
        const operatorCandidate = async (sendAvailableCommands?: () => Promise<void>) => {
            const { session, server } = fakePlayer({ name: 'erin' });
            const permissionsWhenCommandsSent: boolean[] = [];
            const real = new PermissionManager({
                getLogger: () => logger,
                getSessionManager: () => stub<SessionManager>({ findSession: () => session }),
                getKernel: () => kernelPosting(() => {})
            });
            Object.assign(server, { getPermissionManager: () => real });
            vi.spyOn(session, 'sendAvailableCommands').mockImplementation(
                sendAvailableCommands ??
                    (async () =>
                        void permissionsWhenCommandsSent.push(real.can(session).execute('minecraft.command.stop')))
            );
            vi.spyOn(session, 'announceSettings').mockResolvedValue();
            await real.enable();
            return { session, manager: real, permissionsWhenCommandsSent };
        };

        it("drops a deopped player's operator permissions before their next command", async () => {
            const { session, manager: real, permissionsWhenCommandsSent } = await operatorCandidate();

            await real.setOp(session.identity.name, true);
            expect(session.getPermissions()).toContain('*');
            expect(real.can(session).execute('minecraft.command.stop')).toBe(true);

            await real.setOp(session.identity.name, false);
            expect(session.getPermissions()).not.toContain('*');
            expect(real.can(session).execute('minecraft.command.stop')).toBe(false);
            // The command list each change sends reflects the status it set.
            expect(permissionsWhenCommandsSent).toStrictEqual([true, false]);
        });

        it("applies a player's replaced grants without a reconnect", async () => {
            const { session, manager: real } = await operatorCandidate();

            real.setPermissions(session.identity, ['minecraft.command.kick']);
            expect(real.can(session).execute('minecraft.command.kick')).toBe(true);

            real.setPermissions(session.identity, []);
            expect(real.can(session).execute('minecraft.command.kick')).toBe(false);
        });

        it('saves a deop even when the command list cannot be sent', async () => {
            const { session, manager: real } = await operatorCandidate(async () => {
                throw new Error('the client went away');
            });
            await real['writeOp'](session.identity.uuid, session.identity.name, true);

            expect(await real.setOp(session.identity.name, false)).toBe(false);

            expect(plain(readFileSync(path.join(directory, 'ops.json'), 'utf8'))).toStrictEqual([]);
            expect(session.isOp()).toBe(false);
        });
    });
});
