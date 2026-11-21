import { testKernel } from '../testing/kernel.test.helper';
import { KernelEventBus } from '@jsprismarine/kernel';
import type { ServerEvents } from '../events/ServerEvents';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '@jsprismarine/logger';
import pkg from '../../package.json' with { type: 'json' };
import Console from '../Console';
import { parseConfigDocument } from '../config/ConfigDocument';
import type { ConfigPath } from '../config/ConfigDocument';
import type SessionManager from '../SessionManager';
import type PlayerToggleOperatorEvent from '../events/player/PlayerToggleOperatorEvent';
import type PlayerSession from '../network/PlayerSession';
import type { PlayerIdentity } from '../playerIdentity';
import { fakePlayer } from '../testing/fakePlayer.test.helper';
import { stub } from '../testing/stub.test.helper';
import { canExecute, PermissionManager } from './PermissionManager';
import type { PermissionManagerServer } from './PermissionManager';
import { DEFAULT_GROUP, OPERATOR_GROUP } from './model';
import { identityNamed } from '../testing/sessionIdentity.test.helper';
import type { Subject } from '../identity/Subject';

/** The subject of an offline player of this name. */
const offline = (name: string): Subject => ({ kind: 'offline', name });

/** A kernel whose bus has one `playerToggleOperator` listener. */
const kernelPosting = (listener: (event: PlayerToggleOperatorEvent) => void) => {
    const events = new KernelEventBus<ServerEvents>();
    events.on('playerToggleOperator', listener);
    return testKernel(events);
};

/** Reads JSONC without treating the `//` inside a URL as a comment. */
const plain = (text: string): unknown => parseConfigDocument(text).get([]);

describe('permission', () => {
    describe('canExecute', () => {
        /** A player who holds these nodes after resolution. */
        const holder = (...nodes: string[]) => ({ hasPermission: (node: string) => nodes.includes(node) });

        it('passes the console and a holder of the node, and nobody else', () => {
            expect(canExecute(holder('namespace.scope.action')).execute('namespace.scope.action')).toBe(true);
            expect(canExecute(holder('namespace.scope.action')).execute('namespace.scope.other')).toBe(false);
            expect(canExecute(holder()).execute('namespace.scope.action')).toBe(false);
            const console: Console = Object.create(Console.prototype);
            expect(canExecute(console).execute('namespace.scope.action')).toBe(true);
        });

        it('negates with not(), and passes a check with no permission', () => {
            expect(canExecute(holder('x.y')).not().execute('x.y')).toBe(false);
            expect(canExecute(holder()).execute()).toBe(true);
        });
    });

    describe('PermissionManager files', () => {
        let directory: string;
        let logger: Logger;
        let manager: PermissionManager;
        /** The clock the managers under test read, movable by a test. */
        let now: number;
        const NOON = Date.parse('2026-11-21T12:00:00Z');
        const LATER = '2026-11-22T12:00:00.000Z';
        const permissionsFile = () => path.join(directory, 'permissions.json');
        const permissionsText = () => readFileSync(permissionsFile(), 'utf8');
        const permissions = () => plain(permissionsText());
        /** The file's text with one value changed, as an owner's editor would write it. */
        const edited = (at: ConfigPath, value: unknown): string => {
            const document = parseConfigDocument(permissionsText());
            document.set(at, value);
            return document.toString();
        };
        /** The sessions online, which a write or a reload sends their commands and abilities again. */
        let online: PlayerSession[] = [];
        const server = (): PermissionManagerServer => ({
            getLogger: () => logger,
            getSessionManager: () => stub<SessionManager>({ getSessions: () => online }),
            getKernel: () => {
                throw new Error('not needed here');
            }
        });
        const steve = identityNamed('Steve', '00000000-0000-0000-0000-000000000005');
        /** Writes `ops.json` with these offline operators, before the manager reads it. */
        const opsFile = (...names: string[]) =>
            writeFileSync(
                path.join(directory, 'ops.json'),
                JSON.stringify(names.map((name) => ({ name, kind: 'offline', id: name, level: 4 })))
            );

        beforeEach(() => {
            directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-permission-test-'));
            vi.stubEnv('JSP_DIR', directory);
            logger = new Logger();
            vi.spyOn(logger, 'warn').mockImplementation(() => {});
            vi.spyOn(logger, 'error').mockImplementation(() => {});
            vi.spyOn(logger, 'info');
            now = NOON;
            online = [];
            manager = new PermissionManager(server(), { now: () => now, watch: false });
        });

        afterEach(async () => {
            await manager.disable();
            vi.unstubAllEnvs();
            vi.restoreAllMocks();
            rmSync(directory, { recursive: true, force: true });
        });

        it('creates both files on first start, with the layout explained', async () => {
            await manager.enable();

            const text = permissionsText();
            expect(text).toContain('// Every group by name.');
            expect(text).toContain('// Users by platform:');
            expect(permissions()).toStrictEqual({
                $schema: `https://unpkg.com/@jsprismarine/prismarine@${pkg.version}/schemas/permissions.schema.json`,
                schemaVersion: 2,
                groups: {
                    default: {
                        weight: 0,
                        parents: [],
                        nodes: [
                            'minecraft.command.help',
                            'minecraft.command.list',
                            'minecraft.command.me',
                            'jsprismarine.command.plugins',
                            'jsprismarine.command.version',
                            'jsprismarine.command.tps'
                        ].map((node) => ({ node })),
                        meta: {}
                    },
                    operator: { weight: 100, parents: [], nodes: [{ node: '*' }], meta: {} }
                },
                users: { xbox: {}, java: {}, offline: {} }
            });
            expect(readFileSync(path.join(directory, 'ops.json'), 'utf8')).toContain('// JSPrismarine schema:');
            expect(manager.groupNames()).toEqual([DEFAULT_GROUP, OPERATOR_GROUP]);
            expect(manager.has(steve, 'minecraft.command.help')).toBe(true);
            expect(manager.has(steve, 'minecraft.command.stop')).toBe(false);
        });

        describe('migration', () => {
            const LEGACY = `{
  // trimmed down
  "defaultPermissions": ["minecraft.command.help"],
  "defaultOperatorPermissions": ["minecraft.command.*"],
  "players": [
    { "name": "alice", "uuid": "00000000-0000-0000-0000-000000000002", "permissions": ["minecraft.command.kick"] },
    { "name": "legacy", "permissions": ["*"] },
    { "name": 7 }
  ]
}
`;

            it('turns a file without a schemaVersion into groups and pending users, keeping the old file as .bak', async () => {
                writeFileSync(permissionsFile(), LEGACY);
                opsFile('Op');

                await manager.enable();

                expect(readFileSync(`${permissionsFile()}.bak`, 'utf8')).toBe(LEGACY);
                expect(permissions()).toMatchObject({
                    schemaVersion: 2,
                    groups: {
                        default: { weight: 0, parents: [], nodes: [{ node: 'minecraft.command.help' }], meta: {} },
                        operator: { weight: 100, parents: [], nodes: [{ node: 'minecraft.command.*' }], meta: {} }
                    },
                    users: { xbox: {}, java: {}, offline: {} },
                    pending: [
                        {
                            name: 'alice',
                            legacyUuid: '00000000-0000-0000-0000-000000000002',
                            groups: [],
                            nodes: [{ node: 'minecraft.command.kick' }],
                            meta: {}
                        }
                    ]
                });
                expect(logger.info).toHaveBeenCalledWith(
                    expect.stringContaining('00000000-0000-0000-0000-000000000002')
                );
                // The same effective permissions as before, for everyone and for an operator.
                expect(manager.has(steve, 'minecraft.command.help')).toBe(true);
                expect(manager.has(steve, 'minecraft.command.list')).toBe(false);
                const op = identityNamed('Op');
                expect(manager.has(op, 'minecraft.command.stop')).toBe(true);
                expect(manager.has(op, 'jsprismarine.command.debug')).toBe(false);
            });

            it('files a pending user under the account of the login that claims it, and keeps the one never claimed', async () => {
                writeFileSync(permissionsFile(), LEGACY);
                await manager.enable();
                const alice = identityNamed('Alice', '00000000-0000-0000-0000-000000000002');
                const impostor = identityNamed('alice', '00000000-0000-0000-0000-000000000009');

                expect(manager.has(alice, 'minecraft.command.kick')).toBe(false);
                expect(manager.claimLegacy(impostor)).toBe(false);
                expect(manager.claimLegacy(alice)).toBe(true);
                expect(manager.claimLegacy(alice)).toBe(false);

                expect(manager.has(alice, 'minecraft.command.kick')).toBe(true);
                expect(manager.has(impostor, 'minecraft.command.kick')).toBe(false);
                await manager.disable();
                expect(permissions()).toMatchObject({
                    users: {
                        offline: {
                            Alice: { name: 'Alice', groups: [], nodes: [{ node: 'minecraft.command.kick' }], meta: {} }
                        }
                    },
                    pending: []
                });
            });

            it('refuses a file a newer server wrote, or whose version is not a number, without rewriting it', async () => {
                for (const version of ['3', '"2"', '1.5']) {
                    const text = `{ "schemaVersion": ${version}, "groups": {}, "users": {} }`;
                    writeFileSync(permissionsFile(), text);

                    await expect(manager.enable()).rejects.toThrow('Invalid permissions.json file.');
                    expect(logger.error).toHaveBeenCalledWith(
                        expect.objectContaining({ code: 'PRISMARINE_PERMISSIONS_SCHEMA_UNSUPPORTED' })
                    );
                    expect(permissionsText()).toBe(text);
                    expect(existsSync(`${permissionsFile()}.bak`)).toBe(false);
                }
            });

            it('gives `*` to operators when the old file names no valid operator defaults', async () => {
                writeFileSync(
                    permissionsFile(),
                    '{ "defaultPermissions": ["a.b"], "defaultOperatorPermissions": "all" }'
                );
                opsFile('Op');

                await manager.enable();

                expect(manager.groupOf(OPERATOR_GROUP)?.nodes).toEqual([{ node: '*' }]);
                expect(manager.has(identityNamed('Op'), 'minecraft.command.stop')).toBe(true);
            });

            it('files every pending entry of one UUID under the account that claims it', async () => {
                writeFileSync(
                    permissionsFile(),
                    JSON.stringify({
                        schemaVersion: 2,
                        groups: {},
                        users: {},
                        pending: [
                            { name: 'old', legacyUuid: 'u-1', groups: [], nodes: [{ node: 'a.b' }], meta: {} },
                            { name: 'older', legacyUuid: 'u-1', groups: [], nodes: [{ node: 'c.d' }], meta: {} }
                        ]
                    })
                );
                await manager.enable();

                expect(manager.claimLegacy(identityNamed('Bob', 'u-1'))).toBe(true);
                await manager['writes'];

                expect(permissions()).toMatchObject({ pending: [] });
                expect(manager.claimLegacy(identityNamed('Bob', 'u-1'))).toBe(false);
            });
        });

        it('reads a file without the built-in groups as if it had them, drops a parent that closes a cycle, and skips an entry whose expiry is not a string', async () => {
            writeFileSync(
                permissionsFile(),
                JSON.stringify({
                    schemaVersion: 2,
                    groups: {
                        a: {
                            weight: 1,
                            parents: ['b'],
                            nodes: [{ node: 'x.y', expires: 7 }, { node: 'x.z' }],
                            meta: {}
                        },
                        b: { weight: 1, parents: ['a'], nodes: [], meta: {} }
                    },
                    users: {
                        offline: {
                            Steve: {
                                name: 'Steve',
                                groups: [{ group: 'a', expires: null }, { group: 'b' }],
                                nodes: [],
                                meta: {}
                            }
                        }
                    }
                })
            );
            opsFile('Op');

            await manager.enable();

            expect(manager.groupNames()).toEqual(['a', 'b', DEFAULT_GROUP, OPERATOR_GROUP]);
            expect(manager.has(identityNamed('Op'), 'anything.at.all')).toBe(true);
            // `a` lists `b` as a parent and `b` lists `a`: the link read first would close the cycle, so it is dropped.
            expect(manager.groupOf('a')?.parents).toEqual([]);
            expect(manager.groupOf('b')?.parents).toEqual(['a']);
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('would make a its own ancestor'));
            // A numeric expiry is not permanent: the node is skipped, as is the membership with `null`.
            expect(manager.groupOf('a')?.nodes).toEqual([{ node: 'x.z' }]);
            expect(manager.groupsOf(steve)).toEqual(['b', DEFAULT_GROUP]);
            expect(manager.has(steve, 'x.z')).toBe(true);
            expect(manager.has(steve, 'x.y')).toBe(false);
        });

        it('refuses a permissions file that does not parse', async () => {
            writeFileSync(permissionsFile(), '{ "schemaVersion": 2, "groups": [');

            await expect(manager.enable()).rejects.toThrow('Invalid permissions.json file.');
        });

        describe('writes', () => {
            it('writes a user under their platform, and keeps the comments around the record', async () => {
                await manager.enable();
                const xbox = { ...steve, subject: { kind: 'xbox', xuid: '2535400000000001' } as const };

                await manager.grantUser(xbox, 'minecraft.command.kick');
                await manager.grantUser(steve, '-minecraft.command.help');

                expect(permissionsText()).toContain('// Users by platform:');
                expect(permissions()).toMatchObject({
                    users: {
                        xbox: {
                            '2535400000000001': {
                                name: 'Steve',
                                groups: [],
                                nodes: [{ node: 'minecraft.command.kick' }],
                                meta: {}
                            }
                        },
                        offline: { Steve: { name: 'Steve', nodes: [{ node: '-minecraft.command.help' }] } }
                    }
                });
                expect(manager.has(xbox, 'minecraft.command.kick')).toBe(true);
                expect(manager.has(steve, 'minecraft.command.kick')).toBe(false);
                expect(manager.has(steve, 'minecraft.command.help')).toBe(false);
                expect(manager.subjectsNamed('Steve')).toEqual([xbox.subject, steve.subject]);
            });

            it('manages groups: create, grant, parents, weight, meta, membership and delete', async () => {
                await manager.enable();

                await manager.createGroup('vip');
                await manager.createGroup('staff');
                await manager.grantGroup('vip', 'minecraft.command.me');
                await manager.grantGroup('staff', 'minecraft.command.kick');
                await manager.addParent('staff', 'vip');
                await manager.setGroupWeight('staff', 50);
                await manager.setGroupMeta('staff', 'prefix', 'Staff ');
                await manager.addToGroup(steve, 'staff');

                expect(manager.groupOf('staff')).toEqual({
                    weight: 50,
                    parents: ['vip'],
                    nodes: [{ node: 'minecraft.command.kick' }],
                    meta: { prefix: 'Staff ' }
                });
                expect(manager.has(steve, 'minecraft.command.kick')).toBe(true);
                expect(manager.has(steve, 'minecraft.command.me')).toBe(true);
                expect(manager.groupsOf(steve)).toEqual(['staff', 'default']);
                expect(manager.primaryGroupOf(steve)).toBe('staff');
                expect(manager.metaOf(steve, 'prefix')).toBe('Staff ');

                expect(await manager.revokeGroup('staff', 'minecraft.command.kick')).toBe(true);
                expect(await manager.revokeGroup('staff', 'minecraft.command.kick')).toBe(false);
                expect(await manager.removeParent('staff', 'vip')).toBe(true);
                await manager.setGroupMeta('staff', 'prefix', undefined);
                expect(await manager.removeFromGroup(steve, 'staff')).toBe(true);
                await manager.deleteGroup('vip');

                expect(manager.groupOf('staff')).toEqual({ weight: 50, parents: [], nodes: [], meta: {} });
                expect(manager.groupNames()).toEqual([DEFAULT_GROUP, OPERATOR_GROUP, 'staff']);
                expect(manager.has(steve, 'minecraft.command.kick')).toBe(false);
                expect(permissions()).toMatchObject({
                    groups: { staff: { weight: 50, parents: [], nodes: [], meta: {} } },
                    users: { offline: { Steve: { groups: [], nodes: [], meta: {} } } }
                });
            });

            it('refuses what the model does not allow', async () => {
                await manager.enable();

                await expect(manager.createGroup('default')).rejects.toThrow('already exists');
                await expect(manager.createGroup('bad name')).rejects.toThrow('whitespace');
                await expect(manager.deleteGroup('operator')).rejects.toThrow('built in');
                await expect(manager.deleteGroup('nobody')).rejects.toThrow('No permission group');
                await expect(manager.addToGroup(steve, 'nobody')).rejects.toThrow('No permission group');
                await expect(manager.addParent('default', 'default')).rejects.toThrow('its own ancestor');
                await expect(manager.grantUser(steve, 'bad node')).rejects.toThrow('not spelled');
                await expect(manager.grantUser(steve, 'a.*.b')).rejects.toThrow('not spelled');
                await expect(manager.grantUser(steve, 'a.b', 'yesterday')).rejects.toThrow('ISO 8601');
                await expect(manager.grantUser(steve, 'a.b', '2026-11-21T11:00:00Z')).rejects.toThrow('ISO 8601');
                // A local time without a zone is not an instant, and February 30 is not a day.
                await expect(manager.grantUser(steve, 'a.b', '2030-01-01T00:00:00')).rejects.toThrow('ISO 8601');
                await expect(manager.grantUser(steve, 'a.b', '2030-02-30T00:00:00Z')).rejects.toThrow('ISO 8601');
                await manager.createGroup('a');
                await manager.createGroup('b');
                await manager.addParent('a', 'b');
                await expect(manager.addParent('b', 'a')).rejects.toThrow('would make b its own ancestor');
                await expect(manager.setGroupWeight('a', Number.POSITIVE_INFINITY)).rejects.toThrow('finite');
                await expect(manager.setGroupWeight('a', Number.NaN)).rejects.toThrow('finite');
                expect(manager.groupOf('a')?.weight).toBe(0);
            });

            it('changes memory only once the file is written, so a failed write leaves the edit to make again', async () => {
                await manager.enable();
                await manager.grantUser(steve, 'a.b');
                const granted = manager.grantUser(steve, 'c.d');
                expect(manager.has(steve, 'c.d')).toBe(false);
                await granted;
                expect(manager.has(steve, 'c.d')).toBe(true);

                // The file goes read-only for the next write.
                chmodSync(permissionsFile(), 0o400);
                try {
                    await expect(manager.revokeUser(steve, 'a.b')).rejects.toThrow();
                } finally {
                    chmodSync(permissionsFile(), 0o600);
                }
                expect(manager.has(steve, 'a.b')).toBe(true);
                expect(await manager.revokeUser(steve, 'a.b')).toBe(true);
                expect(manager.has(steve, 'a.b')).toBe(false);
            });

            it('writes a complete file again when the one on disk is gone or not a version 2 file', async () => {
                await manager.enable();
                await manager.createGroup('vip');
                rmSync(permissionsFile());

                await manager.grantUser(steve, 'a.b');

                expect(permissions()).toMatchObject({
                    schemaVersion: 2,
                    groups: { default: expect.anything(), operator: expect.anything(), vip: expect.anything() },
                    users: { offline: { Steve: { nodes: [{ node: 'a.b' }] } } }
                });
                expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('writing it again from memory'));
            });

            it('sends the players a change reaches their command list and abilities again', async () => {
                const sent: string[] = [];
                const session = (identity: PlayerIdentity) =>
                    stub<PlayerSession>({
                        identity,
                        sendAvailableCommands: async () => void sent.push(`${identity.name} commands`),
                        announceSettings: async () => void sent.push(`${identity.name} settings`)
                    });
                online = [session(steve), session(identityNamed('Alex'))];
                await manager.enable();

                await manager.grantUser(steve, 'a.b');
                expect(sent).toEqual(['Steve commands', 'Steve settings']);

                sent.length = 0;
                await manager.createGroup('vip');
                expect(sent.sort()).toEqual(['Alex commands', 'Alex settings', 'Steve commands', 'Steve settings']);

                sent.length = 0;
                await manager.reload();
                expect(sent).toHaveLength(4);
            });

            it('writes an expiry, skips the node once it passes, and prunes it on the next write', async () => {
                await manager.enable();

                await manager.grantUser(steve, 'minecraft.command.kick', LATER);
                await manager.addToGroup(steve, 'operator', LATER);
                expect(manager.userOf(steve.subject)?.nodes).toEqual([
                    { node: 'minecraft.command.kick', expires: LATER }
                ]);
                expect(manager.has(steve, 'minecraft.command.stop')).toBe(true);

                now = Date.parse(LATER) + 1;
                expect(manager.has(steve, 'minecraft.command.kick')).toBe(false);
                expect(manager.has(steve, 'minecraft.command.stop')).toBe(false);
                expect(manager.groupsOf(steve)).toEqual([DEFAULT_GROUP]);

                await manager.setUserMeta(steve, 'prefix', 'S');
                expect(permissions()).toMatchObject({
                    users: { offline: { Steve: { groups: [], nodes: [], meta: { prefix: 'S' } } } }
                });
            });

            it('tells its listeners what each write touched, and names nothing on a reload', async () => {
                await manager.enable();
                const changes: unknown[] = [];
                const stop = manager.onChange((change) => void changes.push(change));

                await manager.grantUser(steve, 'a.b');
                await manager.createGroup('vip');
                await manager.reload();
                stop();
                await manager.setGroupWeight('vip', 3);

                expect(changes).toEqual([{ subject: steve.subject, name: 'Steve' }, { group: 'vip' }, {}]);
            });
        });

        describe('reload', () => {
            it('reads what somebody else wrote to the file, and keeps memory when the new text does not parse', async () => {
                await manager.enable();
                await manager.createGroup('vip');
                writeFileSync(permissionsFile(), edited(['groups', 'vip', 'meta'], { prefix: 'V' }));

                await manager.reload();
                expect(manager.groupOf('vip')?.meta).toEqual({ prefix: 'V' });

                writeFileSync(permissionsFile(), '{ "schemaVersion": 2, "groups": {');
                await expect(manager.reload()).rejects.toThrow('Invalid permissions.json file.');
                expect(manager.groupOf('vip')?.meta).toEqual({ prefix: 'V' });
                expect(logger.error).toHaveBeenCalled();

                // Operators stay too while the other file fails, since both are read before either is published.
                opsFile('Op');
                await expect(manager.reload()).rejects.toThrow();
                expect(manager.isOp(offline('Op'))).toBe(false);
            });

            it('reloads when the file changes on disk, and not after its own writes', async () => {
                const watching = new PermissionManager(server(), { now: () => now });
                await watching.enable();
                try {
                    await watching.createGroup('vip');
                    const reloaded = new Promise<void>((resolve) => {
                        const stop = watching.onChange((change) => {
                            if (change.group === undefined && change.subject === undefined) {
                                stop();
                                resolve();
                            }
                        });
                    });
                    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('changed on disk'));

                    writeFileSync(permissionsFile(), edited(['groups', 'vip', 'weight'], 9));

                    await reloaded;
                    expect(watching.groupOf('vip')?.weight).toBe(9);
                } finally {
                    await watching.disable();
                }
            });
        });

        it('gives the command level the level meta names, and an operator level 4', async () => {
            opsFile('Op');
            await manager.enable();

            expect(manager.commandLevelOf(steve)).toBe(0);
            await manager.setGroupMeta(DEFAULT_GROUP, 'level', '1');
            expect(manager.commandLevelOf(steve)).toBe(1);
            await manager.setUserMeta(steve, 'level', '3');
            expect(manager.commandLevelOf(steve)).toBe(3);
            expect(manager.commandLevelOf(identityNamed('Op'))).toBe(4);
            // The operator group outweighs default, so its node comes first.
            expect(manager.nodesOf(identityNamed('Op'))).toEqual([
                '*',
                'minecraft.command.help',
                'minecraft.command.list',
                'minecraft.command.me',
                'jsprismarine.command.plugins',
                'jsprismarine.command.version',
                'jsprismarine.command.tps'
            ]);
        });

        it('loads operator entries by subject, and keeps a legacy one waiting', async () => {
            writeFileSync(
                path.join(directory, 'ops.json'),
                `[
  { "name": "bob", "kind": "offline", "id": "bob", "level": 4 }, // the owner
  { "name": "steve", "kind": "xbox", "id": "2535400000000001", "level": 4 },
  { "name": "legacy-op", "level": 4 },
  "junk"
]
`
            );

            await manager.enable();

            expect(manager.isOp(offline('bob'))).toBe(true);
            expect(manager.isOp({ kind: 'xbox', xuid: '2535400000000001' })).toBe(true);
            // An offline steve is not the Xbox account named steve.
            expect(manager.isOp(offline('steve'))).toBe(false);
            expect(manager.isOp(offline('legacy-op'))).toBe(false);
            expect(manager.has(identityNamed('bob'), 'minecraft.command.stop')).toBe(true);
        });

        describe('claimLegacy', () => {
            const BOB_UUID = '00000000-0000-0000-0000-00000000000b';
            const legacyOps = `[
    // the owner
    { "name": "bob", "uuid": "${BOB_UUID}", "level": 4 },
    { "name": "carol", "kind": "offline", "id": "carol", "level": 4 }
]
`;

            it("waits for a login with the entry's UUID, then keys the entry by the account where it was", async () => {
                writeFileSync(path.join(directory, 'ops.json'), legacyOps);
                await manager.enable();
                const bob = {
                    ...identityNamed('Bobby', BOB_UUID),
                    xuid: '2535400000000002',
                    subject: { kind: 'xbox', xuid: '2535400000000002' } as const
                };

                expect(manager.isOp(bob.subject)).toBe(false);
                expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(BOB_UUID));

                expect(manager.claimLegacy(bob)).toBe(true);
                expect(manager.isOp(bob.subject)).toBe(true);
                await manager.disable();

                const text = readFileSync(path.join(directory, 'ops.json'), 'utf8');
                expect(text).toContain('// the owner');
                expect(plain(text)).toStrictEqual([
                    { name: 'Bobby', kind: 'xbox', id: '2535400000000002', level: 4 },
                    { name: 'carol', kind: 'offline', id: 'carol', level: 4 }
                ]);
            });

            it('claims an entry once, and a login with another UUID claims nothing', async () => {
                writeFileSync(path.join(directory, 'ops.json'), legacyOps);
                await manager.enable();

                expect(manager.claimLegacy(identityNamed('bob', '00000000-0000-0000-0000-00000000000c'))).toBe(false);
                expect(manager.claimLegacy(identityNamed('bob', BOB_UUID))).toBe(true);
                expect(manager.claimLegacy(identityNamed('bob', BOB_UUID))).toBe(false);
                await manager.disable();

                expect(plain(readFileSync(path.join(directory, 'ops.json'), 'utf8'))).toHaveLength(2);
            });
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
            expect(opManager.isOp(offline('carol'))).toBe(true);
            expect(plain(readFileSync(path.join(directory, 'ops.json'), 'utf8'))).toContainEqual({
                name: 'carol',
                kind: 'offline',
                id: 'carol',
                level: 4
            });
            await expect(opManager.setOp('nobody', true)).rejects.toThrow();
        });

        it('sends the command list once the operator change is made, so it lists what the player may now run', async () => {
            const uuid = '00000000-0000-0000-0000-000000000008';
            const opWhenListed: boolean[] = [];
            const opManager: PermissionManager = new PermissionManager(
                {
                    getLogger: () => logger,
                    getSessionManager: () =>
                        stub<SessionManager>({ findSession: () => session, getSessions: () => [session] }),
                    getKernel: () => kernelPosting(() => {})
                },
                { watch: false }
            );
            const session = stub<PlayerSession>({
                identity: identityNamed('dave', uuid),
                sendAvailableCommands: async () => void opWhenListed.push(opManager.isOp(offline('dave'))),
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

                expect(opManager.isOp(offline('erin'))).toBe(true);
                expect(posted.map((event) => [event.getSession(), event.getOperator()])).toEqual([[erin, true]]);
                expect(opsFile()).toEqual([]);

                await told;
                await opManager.disable();
                expect(sent).toEqual(['erin commands', 'erin settings']);
                expect(opsFile()).toEqual([{ name: 'erin', kind: 'offline', id: 'erin', level: 4 }]);
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

                expect(opsFile()).toEqual([{ name: 'gwen', kind: 'offline', id: 'gwen', level: 4 }]);
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
                expect(opManager.isOp(offline('hal'))).toBe(false);
                expect(opsFile()).toEqual([]);
            });
        });

        it('adds and removes one operator line and keeps the comments', async () => {
            const file = path.join(directory, 'ops.json');
            writeFileSync(
                file,
                `[
    // The owner.
    { "name": "alice", "kind": "offline", "id": "alice", "level": 4 }
]
`
            );

            await manager['writeOp'](offline('bob'), 'bob', true);
            let text = readFileSync(file, 'utf8');
            expect(text).toContain('// The owner.');
            expect(plain(text)).toStrictEqual([
                { name: 'alice', kind: 'offline', id: 'alice', level: 4 },
                { name: 'bob', kind: 'offline', id: 'bob', level: 4 }
            ]);

            await manager['writeOp'](offline('bob'), 'bob', true);
            expect(plain(readFileSync(file, 'utf8'))).toHaveLength(2);

            await manager['writeOp'](offline('alice'), 'alice', false);
            text = readFileSync(file, 'utf8');
            expect(plain(text)).toStrictEqual([{ name: 'bob', kind: 'offline', id: 'bob', level: 4 }]);
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
            const real = new PermissionManager(
                {
                    getLogger: () => logger,
                    getSessionManager: () =>
                        stub<SessionManager>({ findSession: () => session, getSessions: () => [session] }),
                    getKernel: () => kernelPosting(() => {})
                },
                { watch: false }
            );
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

        it("applies a player's granted and revoked nodes without a reconnect", async () => {
            const { session, manager: real } = await operatorCandidate();

            await real.grantUser(session.identity, 'minecraft.command.kick');
            expect(real.can(session).execute('minecraft.command.kick')).toBe(true);

            expect(await real.revokeUser(session.identity, 'minecraft.command.kick')).toBe(true);
            expect(real.can(session).execute('minecraft.command.kick')).toBe(false);
        });

        it('saves a deop even when the command list cannot be sent', async () => {
            const { session, manager: real } = await operatorCandidate(async () => {
                throw new Error('the client went away');
            });
            await real['writeOp'](session.identity.subject, session.identity.name, true);

            expect(await real.setOp(session.identity.name, false)).toBe(false);

            expect(plain(readFileSync(path.join(directory, 'ops.json'), 'utf8'))).toStrictEqual([]);
            expect(session.isOp()).toBe(false);
        });
    });
});
