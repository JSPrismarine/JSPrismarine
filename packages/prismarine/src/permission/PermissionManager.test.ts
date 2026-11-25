import { testKernel } from '../testing/kernel.test.helper';
import { KernelEventBus } from '@jsprismarine/kernel';
import type { ServerEvents } from '../events/ServerEvents';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismarineServerErrors } from '@jsprismarine/errors/prismarine/server';
import { Logger } from '@jsprismarine/logger';
import pkg from '../../package.json' with { type: 'json' };
import Console from '../Console';
import { parseConfigDocument } from '../config/ConfigDocument';
import type { ConfigPath } from '../config/ConfigDocument';
import { temporaryPathOf } from '../config/JsonFile';
import type SessionManager from '../SessionManager';
import type PlayerToggleOperatorEvent from '../events/player/PlayerToggleOperatorEvent';
import type PlayerSession from '../player/PlayerSession';
import type { PlayerIdentity } from '../playerIdentity';
import { fakePlayer } from '../testing/fakePlayer.test.helper';
import { stub } from '../testing/stub.test.helper';
import { canExecute, PermissionManager } from './PermissionManager';
import type { PermissionChange, PermissionManagerServer } from './PermissionManager';
import { DEFAULT_GROUP, OPERATOR_GROUP } from './model';
import { VERSION_3_DEFAULT_PERMISSIONS } from './PermissionsFile';
import { identityNamed } from '../testing/sessionIdentity.test.helper';
import type { Subject } from '../identity/Subject';

/** The subject of an offline player of this name. */
const offline = (name: string): Subject => ({ kind: 'offline', name });
/** The subject of an Xbox account with this XUID. */
const xbox = (xuid: string): Subject => ({ kind: 'xbox', xuid });

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
            getKernel: () => testKernel()
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

        /** Managers with a watcher, closed after each test whatever happened in it. */
        const watchers: PermissionManager[] = [];

        afterEach(async () => {
            await manager.disable();
            for (const watching of watchers.splice(0)) await watching.disable();
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
                schemaVersion: 3,
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
                            'jsprismarine.command.tps',
                            'jsprismarine.command.link',
                            'jsprismarine.command.unlink'
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
    { "name": "alice", "uuid": "00000000-0000-0000-0000-000000000002", "permissions": ["*"] },
    { "name": "alice", "uuid": "00000000-0000-0000-0000-000000000002", "permissions": ["minecraft.command.kick"] },
    { "name": "carol", "uuid": "00000000-0000-0000-0000-000000000003", "permissions": ["minecraft.command.ban"] },
    { "name": "legacy", "permissions": ["*"] },
    { "name": 7 }
  ]
}
`;

            it('turns a file without a schemaVersion into groups and pending users, keeping the old file as .v1.bak, with the last record of a UUID as the old loader read it', async () => {
                writeFileSync(permissionsFile(), LEGACY);
                opsFile('Op');

                await manager.enable();

                expect(readFileSync(`${permissionsFile()}.v1.bak`, 'utf8')).toBe(LEGACY);
                expect(permissions()).toMatchObject({
                    schemaVersion: 3,
                    groups: {
                        default: {
                            weight: 0,
                            parents: [],
                            nodes: ['minecraft.command.help', ...VERSION_3_DEFAULT_PERMISSIONS].map((node) => ({
                                node
                            })),
                            meta: {}
                        },
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
                        },
                        {
                            name: 'carol',
                            legacyUuid: '00000000-0000-0000-0000-000000000003',
                            groups: [],
                            nodes: [{ node: 'minecraft.command.ban' }],
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
                // The `*` an earlier record of the same UUID held does not come back with the claim.
                expect(manager.has(alice, 'minecraft.command.stop')).toBe(false);
                expect(manager.has(impostor, 'minecraft.command.kick')).toBe(false);
                await manager.disable();
                expect(permissions()).toMatchObject({
                    users: {
                        offline: {
                            Alice: { name: 'Alice', groups: [], nodes: [{ node: 'minecraft.command.kick' }], meta: {} }
                        }
                    },
                    // Carol's entry waits on, untouched by Alice's claim.
                    pending: [{ name: 'carol', legacyUuid: '00000000-0000-0000-0000-000000000003' }]
                });
            });

            it('retries a claim whose write failed at the next login, and lets a revocation made meanwhile stand', async () => {
                writeFileSync(permissionsFile(), LEGACY);
                await manager.enable();
                const alice = identityNamed('Alice', '00000000-0000-0000-0000-000000000002');
                const carol = identityNamed('Carol', '00000000-0000-0000-0000-000000000003');

                // The claims' writes fail; the players hold their grants and the entries wait on.
                mkdirSync(temporaryPathOf(permissionsFile()));
                expect(manager.claimLegacy(alice)).toBe(true);
                expect(manager.claimLegacy(carol)).toBe(true);
                await manager.reload();
                rmSync(temporaryPathOf(permissionsFile()), { recursive: true });
                expect(manager.has(alice, 'minecraft.command.kick')).toBe(true);
                expect(manager.has(carol, 'minecraft.command.ban')).toBe(true);
                expect(permissions()).toMatchObject({ pending: [expect.anything(), expect.anything()] });

                // An administrator revokes Alice's grant: the write takes her pending entry with it.
                expect(await manager.revokeUser(alice, 'minecraft.command.kick')).toBe(true);
                expect(manager.claimLegacy(alice)).toBe(false);
                expect(manager.has(alice, 'minecraft.command.kick')).toBe(false);
                // Carol logs in again: the claim is written as it stands.
                expect(manager.claimLegacy(carol)).toBe(true);
                await manager.disable();
                expect(permissions()).toMatchObject({
                    pending: [],
                    users: {
                        offline: {
                            Alice: { nodes: [] },
                            Carol: { nodes: [{ node: 'minecraft.command.ban' }] }
                        }
                    }
                });
            });

            it.each([
                { version: '4', code: 'PRISMARINE_FILE_VERSION_TOO_NEW' },
                { version: '"2"', code: 'PRISMARINE_FILE_VERSION_INVALID' },
                { version: '1.5', code: 'PRISMARINE_FILE_VERSION_INVALID' }
            ])(
                'refuses a file whose schemaVersion is $version rather than a whole number up to 3, without rewriting it',
                async ({ version, code }) => {
                    const text = `{ "schemaVersion": ${version}, "groups": {}, "users": {} }`;
                    writeFileSync(permissionsFile(), text);

                    await expect(manager.enable()).rejects.toThrow('Invalid permissions.json file.');

                    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ code }));
                    expect(permissionsText()).toBe(text);
                    expect(readdirSync(directory).filter((name) => name.endsWith('.bak'))).toEqual([]);
                }
            );

            it('adds the link nodes to the default group of a version 2 file once, and keeps it as .v2.bak', async () => {
                const text = JSON.stringify({
                    schemaVersion: 2,
                    groups: {
                        default: { weight: 0, parents: [], nodes: [{ node: 'minecraft.command.help' }], meta: {} },
                        vip: { weight: 10, parents: ['default'], nodes: [{ node: 'minecraft.command.me' }], meta: {} }
                    },
                    users: { offline: {} }
                });
                writeFileSync(permissionsFile(), text);

                await manager.enable();
                await manager.disable();
                await manager.enable();

                expect(readFileSync(`${permissionsFile()}.v2.bak`, 'utf8')).toBe(text);
                expect(readdirSync(directory).filter((name) => name.endsWith('.bak'))).toEqual([
                    'permissions.json.v2.bak'
                ]);
                expect(permissions()).toMatchObject({
                    schemaVersion: 3,
                    groups: {
                        default: {
                            nodes: ['minecraft.command.help', ...VERSION_3_DEFAULT_PERMISSIONS].map((node) => ({
                                node
                            }))
                        },
                        vip: { nodes: [{ node: 'minecraft.command.me' }] }
                    }
                });
                for (const node of VERSION_3_DEFAULT_PERMISSIONS) expect(manager.has(steve, node)).toBe(true);
            });

            it('gives `default` only the nodes later versions add when the old file names no valid default permissions, as the old loader read it', async () => {
                writeFileSync(permissionsFile(), '{ "defaultPermissions": "help", "players": [] }');

                await manager.enable();

                expect(manager.groupOf(DEFAULT_GROUP)?.nodes.map(({ node }) => node)).toEqual([
                    ...VERSION_3_DEFAULT_PERMISSIONS
                ]);
                expect(manager.has(steve, 'minecraft.command.help')).toBe(false);
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

            it('files every pending entry of one UUID under the account that claims it, keeping the copy of a node or membership that applies longer', async () => {
                const PAST = '2026-11-21T11:00:00Z';
                writeFileSync(
                    permissionsFile(),
                    JSON.stringify({
                        schemaVersion: 3,
                        groups: { vip: { weight: 1, parents: [], nodes: [], meta: {} } },
                        users: {},
                        pending: [
                            {
                                name: 'old',
                                legacyUuid: 'u-1',
                                groups: [{ group: 'vip' }],
                                // A permanent copy before an expired one within one record stays too.
                                nodes: [
                                    { node: 'a.b', expires: PAST },
                                    { node: 'e.f' },
                                    { node: 'e.f', expires: PAST }
                                ],
                                meta: {}
                            },
                            {
                                name: 'older',
                                legacyUuid: 'u-1',
                                groups: [{ group: 'vip', expires: PAST }],
                                nodes: [{ node: 'a.b' }, { node: 'c.d' }],
                                meta: {}
                            }
                        ]
                    })
                );
                await manager.enable();

                const bob = identityNamed('Bob', 'u-1');
                expect(manager.claimLegacy(bob)).toBe(true);
                expect(manager.claimLegacy(bob)).toBe(false);
                expect(manager.has(bob, 'a.b')).toBe(true);
                expect(manager.has(bob, 'c.d')).toBe(true);
                expect(manager.has(bob, 'e.f')).toBe(true);
                expect(manager.groupsOf(bob)).toEqual(['vip', 'default']);

                await manager.disable();
                expect(permissions()).toMatchObject({
                    pending: [],
                    users: {
                        offline: {
                            Bob: {
                                groups: [{ group: 'vip' }],
                                nodes: [{ node: 'a.b' }, { node: 'e.f' }, { node: 'c.d' }]
                            }
                        }
                    }
                });
            });
        });

        it('reads a file without the built-in groups as if it had them, drops a parent that closes a cycle, and skips an entry whose expiry is not a string', async () => {
            writeFileSync(
                permissionsFile(),
                JSON.stringify({
                    schemaVersion: 3,
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
                await manager.grantGroup('vip', 'minecraft.command.tp');
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
                expect(manager.has(steve, 'minecraft.command.tp')).toBe(true);
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

            it('keeps a meta key such as `__proto__` as a key like any other', async () => {
                await manager.enable();
                await manager.createGroup('vip');

                await manager.setUserMeta(steve, '__proto__', 'own');
                await manager.setGroupMeta('vip', '__proto__', 'group');
                expect(manager.metaOf(steve, '__proto__')).toBe('own');
                expect(manager.userOf(steve.subject)?.meta).toEqual({ ['__proto__']: 'own' });
                expect(permissions()).toMatchObject({
                    users: { offline: { Steve: { meta: { ['__proto__']: 'own' } } } },
                    groups: { vip: { meta: { ['__proto__']: 'group' } } }
                });

                await manager.setUserMeta(steve, '__proto__', undefined);
                expect(manager.metaOf(steve, '__proto__')).toBeUndefined();
                expect(Object.keys(manager.userOf(steve.subject)?.meta ?? {})).toEqual([]);
            });

            it('decides whether a parent link is there when the edit runs, behind a removal queued before it', async () => {
                await manager.enable();
                await manager.createGroup('staff');
                await manager.createGroup('vip');
                await manager.addParent('staff', 'vip');

                const removing = manager.removeParent('staff', 'vip');
                const adding = manager.addParent('staff', 'vip');
                expect(await removing).toBe(true);
                await adding;

                expect(manager.groupOf('staff')?.parents).toEqual(['vip']);
                expect(permissions()).toMatchObject({ groups: { staff: { parents: ['vip'] } } });
            });

            it('knows the bytes a hand-edited file holds, so a file without `$schema` is not read as changed', async () => {
                writeFileSync(
                    permissionsFile(),
                    JSON.stringify({ schemaVersion: 3, groups: {}, users: { offline: {} } }, null, 4)
                );
                await manager.enable();

                await manager.grantUser(steve, 'a.b');

                expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('changed on disk'));
                expect(permissions()).toMatchObject({ users: { offline: { Steve: { nodes: [{ node: 'a.b' }] } } } });
            });

            it('changes memory only once the file is written, so a failed write leaves the edit to make again', async () => {
                await manager.enable();
                await manager.grantUser(steve, 'a.b');
                const granted = manager.grantUser(steve, 'c.d');
                expect(manager.has(steve, 'c.d')).toBe(false);
                await granted;
                expect(manager.has(steve, 'c.d')).toBe(true);

                // A directory stands where the write stages the new text, so the read of the file
                // succeeds and the write fails, on every platform, leaving the file as it was.
                const kept = permissionsText();
                mkdirSync(temporaryPathOf(permissionsFile()));
                try {
                    await expect(manager.revokeUser(steve, 'a.b')).rejects.toThrow();
                } finally {
                    rmSync(temporaryPathOf(permissionsFile()), { recursive: true });
                }
                expect(permissionsText()).toBe(kept);
                expect(manager.has(steve, 'a.b')).toBe(true);
                expect(await manager.revokeUser(steve, 'a.b')).toBe(true);
                expect(manager.has(steve, 'a.b')).toBe(false);
                expect(existsSync(temporaryPathOf(permissionsFile()))).toBe(false);
                // The failed write recorded nothing, so the file as it stayed was not read as a change.
                expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('changed on disk'));
            });

            it('writes a complete file again when the one on disk is gone', async () => {
                await manager.enable();
                await manager.createGroup('vip');
                rmSync(permissionsFile());

                await manager.grantUser(steve, 'a.b');

                expect(permissions()).toMatchObject({
                    schemaVersion: 3,
                    groups: { default: expect.anything(), operator: expect.anything(), vip: expect.anything() },
                    users: { offline: { Steve: { nodes: [{ node: 'a.b' }] } } }
                });
                expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('writing it again from memory'));
            });

            it('reads a change made on disk before an edit computes from memory, so the edit does not write over it', async () => {
                await manager.enable();
                await manager.createGroup('vip');
                await manager.grantGroup('vip', 'x.y');
                const heard: PermissionChange[] = [];
                manager.onChange((change) => void heard.push(change));
                // An owner revokes the node in their editor before the watcher, off here, catches up.
                writeFileSync(permissionsFile(), edited(['groups', 'vip', 'nodes'], []));

                await manager.addToGroup(steve, 'vip');

                expect(manager.groupOf('vip')?.nodes).toEqual([]);
                expect(manager.has(steve, 'x.y')).toBe(false);
                expect(permissions()).toMatchObject({
                    groups: { vip: { nodes: [] } },
                    users: { offline: { Steve: { groups: [{ group: 'vip' }] } } }
                });
                expect(heard).toEqual([{}, { subject: steve.subject, name: 'Steve' }]);
            });

            it('migrates an old-shape file that appeared on disk before an edit, rather than writing memory over it', async () => {
                await manager.enable();
                await manager.createGroup('vip');
                writeFileSync(permissionsFile(), '{ "defaultPermissions": ["x.y"] }');

                await manager.grantUser(steve, 'a.b');

                expect(manager.groupOf('vip')).toBeUndefined();
                expect(manager.has(steve, 'x.y')).toBe(true);
                expect(existsSync(`${permissionsFile()}.v1.bak`)).toBe(true);
                expect(permissions()).toMatchObject({
                    schemaVersion: 3,
                    groups: { default: { nodes: ['x.y', ...VERSION_3_DEFAULT_PERMISSIONS].map((node) => ({ node })) } },
                    users: { offline: { Steve: { nodes: [{ node: 'a.b' }] } } }
                });
            });

            it('refuses an edit while the file on disk declares a schemaVersion this server does not read, and rewrites nothing', async () => {
                await manager.enable();
                const text = '{ "schemaVersion": 4, "groups": {}, "users": {} }';
                writeFileSync(permissionsFile(), text);

                await expect(manager.grantUser(steve, 'a.b')).rejects.toThrow('Invalid permissions.json file.');

                expect(manager.has(steve, 'a.b')).toBe(false);
                expect(manager.has(steve, 'minecraft.command.help')).toBe(true);
                expect(permissionsText()).toBe(text);
                expect(logger.error).toHaveBeenCalledWith(
                    expect.objectContaining({ code: 'PRISMARINE_FILE_VERSION_TOO_NEW' })
                );
            });

            it('checks an expiry and a group again when a queued edit runs, since the queue may have outlived either', async () => {
                await manager.enable();
                await manager.createGroup('vip');
                const SOON = '2026-11-21T12:00:01.000Z';

                const first = manager.grantUser(steve, 'x.y');
                const granted = manager.grantUser(steve, 'a.b', SOON);
                const deleting = manager.deleteGroup('vip');
                const adding = manager.addToGroup(steve, 'vip');
                now = Date.parse(SOON);

                await first;
                await expect(granted).rejects.toThrow('ISO 8601');
                await deleting;
                await expect(adding).rejects.toThrow('No permission group');
                expect(manager.has(steve, 'x.y')).toBe(true);
                expect(manager.has(steve, 'a.b')).toBe(false);
                expect(manager.groupsOf(steve)).toEqual(['default']);
            });

            it('arms the next expiry before the sends for the one before it, so a deadline the sends outlast is not missed', async () => {
                vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
                try {
                    // Once `holding`, a send waits until the test lets it through.
                    let holding = false;
                    const held: (() => void)[] = [];
                    const sent: string[] = [];
                    online = [
                        stub<PlayerSession>({
                            identity: steve,
                            sendAvailableCommands: () =>
                                new Promise<void>((resolve) => {
                                    sent.push('commands');
                                    if (holding) held.push(resolve);
                                    else resolve();
                                }),
                            announceSettings: async () => void sent.push('settings')
                        })
                    ];
                    await manager.enable();
                    const FIRST = '2026-11-21T12:00:01.000Z';
                    const SECOND = '2026-11-21T12:00:02.000Z';
                    await manager.grantUser(steve, 'a.b', FIRST);
                    await manager.grantUser(steve, 'c.d', SECOND);
                    sent.length = 0;
                    holding = true;

                    // The send for the first expiry is still pending when the second one passes.
                    now = Date.parse(FIRST);
                    await vi.advanceTimersByTimeAsync(1000);
                    expect(sent).toEqual(['commands']);
                    now = Date.parse(SECOND);
                    await vi.advanceTimersByTimeAsync(1000);
                    expect(sent).toEqual(['commands', 'commands']);
                    for (const release of held.splice(0)) release();
                    await vi.advanceTimersByTimeAsync(0);

                    expect(sent).toEqual(['commands', 'commands', 'settings', 'settings']);
                } finally {
                    vi.useRealTimers();
                }
            });

            it('sends every player their command list and abilities again when a membership or node expires', async () => {
                vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
                try {
                    const sent: string[] = [];
                    online = [
                        stub<PlayerSession>({
                            identity: steve,
                            sendAvailableCommands: async () => void sent.push('commands'),
                            announceSettings: async () => void sent.push('settings')
                        })
                    ];
                    await manager.enable();
                    await manager.createGroup('vip');
                    await manager.addToGroup(steve, 'vip', LATER);
                    sent.length = 0;

                    now = Date.parse(LATER) - 1;
                    await vi.advanceTimersByTimeAsync(Date.parse(LATER) - NOON - 1);
                    expect(sent).toEqual([]);
                    expect(manager.groupsOf(steve)).toEqual(['default', 'vip']);

                    now = Date.parse(LATER);
                    await vi.advanceTimersByTimeAsync(1);
                    expect(sent).toEqual(['commands', 'settings']);
                    expect(manager.groupsOf(steve)).toEqual(['default']);
                } finally {
                    vi.useRealTimers();
                }
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
                const valid = permissionsText();

                writeFileSync(permissionsFile(), '{ "schemaVersion": 2, "groups": {');
                await expect(manager.reload()).rejects.toThrow('Invalid permissions.json file.');
                expect(manager.groupOf('vip')?.meta).toEqual({ prefix: 'V' });
                expect(logger.error).toHaveBeenCalled();

                // Operators stay too while the other file fails, since both are read before either is published.
                opsFile('Op');
                await expect(manager.reload()).rejects.toThrow();
                expect(manager.isOp(offline('Op'))).toBe(false);

                // And a valid permissions file is not published while ops.json fails.
                writeFileSync(permissionsFile(), valid);
                writeFileSync(permissionsFile(), edited(['groups', 'vip', 'meta'], { prefix: 'W' }));
                writeFileSync(path.join(directory, 'ops.json'), '[');
                await expect(manager.reload()).rejects.toThrow();
                expect(manager.groupOf('vip')?.meta).toEqual({ prefix: 'V' });
            });

            it('does not announce a reload that shutdown overtook', async () => {
                await manager.enable();
                const heard: PermissionChange[] = [];
                manager.onChange((change) => void heard.push(change));

                const reloading = manager.reload();
                await manager.disable();
                await reloading;

                expect(heard).toEqual([]);
            });

            it('keeps an operator change made while an edit reads a file that changed on disk', async () => {
                const session = stub<PlayerSession>({
                    identity: steve,
                    sendAvailableCommands: async () => {},
                    announceSettings: async () => {}
                });
                const kernelServer = new PermissionManager(
                    { ...server(), getKernel: () => kernelPosting(() => {}) },
                    { now: () => now, watch: false }
                );
                await kernelServer.enable();
                writeFileSync(permissionsFile(), edited(['groups', 'default', 'meta'], { prefix: 'D' }));

                const editing = kernelServer.grantUser(steve, 'a.b');
                const told = kernelServer.setOpNow(session, true);
                await editing;
                await told;

                expect(kernelServer.isOp(steve.subject)).toBe(true);
                expect(kernelServer.groupOf('default')?.meta).toEqual({ prefix: 'D' });
                expect(kernelServer.has(steve, 'a.b')).toBe(true);
                await kernelServer.disable();
                expect(plain(readFileSync(path.join(directory, 'ops.json'), 'utf8'))).toContainEqual(
                    expect.objectContaining({ name: 'Steve', kind: 'offline', id: 'Steve' })
                );
            });

            it('keeps a legacy operator claim made while a reload reads the files, with the UUID no longer waiting', async () => {
                const BOB_UUID = '00000000-0000-0000-0000-00000000000b';
                writeFileSync(
                    path.join(directory, 'ops.json'),
                    JSON.stringify([{ name: 'bob', uuid: BOB_UUID, level: 4 }])
                );
                await manager.enable();
                const bob = {
                    ...identityNamed('Bobby', BOB_UUID),
                    xuid: '2535400000000002',
                    subject: xbox('2535400000000002')
                };

                const reloading = manager.reload();
                expect(manager.claimLegacy(bob)).toBe(true);
                await reloading;

                expect(manager.isOp(bob.subject)).toBe(true);
                // The entry is claimed: a later login with the UUID under another account gets nothing.
                expect(manager.claimLegacy(identityNamed('bob', BOB_UUID))).toBe(false);
                expect(manager.isOp(offline('bob'))).toBe(false);
                await manager.disable();
                expect(plain(readFileSync(path.join(directory, 'ops.json'), 'utf8'))).toStrictEqual([
                    { name: 'Bobby', kind: 'xbox', id: '2535400000000002', level: 4 }
                ]);
            });

            it('keeps a pending user claim made while a reload reads the files, and files the whole record', async () => {
                writeFileSync(
                    permissionsFile(),
                    JSON.stringify({
                        schemaVersion: 3,
                        groups: {},
                        users: {},
                        pending: [{ name: 'alice', legacyUuid: 'u-a', groups: [], nodes: [{ node: 'a.b' }], meta: {} }]
                    })
                );
                await manager.enable();
                const alice = identityNamed('Alice', 'u-a');
                await manager.grantUser(alice, 'c.d');

                const reloading = manager.reload();
                expect(manager.claimLegacy(alice)).toBe(true);
                await reloading;
                expect(manager.has(alice, 'a.b')).toBe(true);
                expect(manager.has(alice, 'c.d')).toBe(true);

                await manager.disable();
                expect(permissions()).toMatchObject({
                    pending: [],
                    users: { offline: { Alice: { nodes: [{ node: 'c.d' }, { node: 'a.b' }] } } }
                });
            });

            it('keeps an operator change made while a reload reads the files', async () => {
                await manager.enable();
                const sent: string[] = [];
                const session = stub<PlayerSession>({
                    identity: steve,
                    sendAvailableCommands: async () => void sent.push('commands'),
                    announceSettings: async () => void sent.push('settings')
                });
                const kernelServer = new PermissionManager(
                    { ...server(), getKernel: () => kernelPosting(() => {}) },
                    { now: () => now, watch: false }
                );
                await kernelServer.enable();

                const reloading = kernelServer.reload();
                const told = kernelServer.setOpNow(session, true);
                await reloading;
                await told;

                expect(kernelServer.isOp(steve.subject)).toBe(true);
                await kernelServer.disable();
                expect(plain(readFileSync(path.join(directory, 'ops.json'), 'utf8'))).toContainEqual(
                    expect.objectContaining({ name: 'Steve', kind: 'offline', id: 'Steve' })
                );
            });

            it('reloads when the file changes on disk, and not after its own writes', async () => {
                const watching = new PermissionManager(server(), { now: () => now });
                watchers.push(watching);
                await watching.enable();
                const reloads: PermissionChange[] = [];
                watching.onChange((change) => {
                    if (change.group === undefined && change.subject === undefined) reloads.push(change);
                });

                await watching.createGroup('vip');

                writeFileSync(permissionsFile(), edited(['groups', 'vip', 'weight'], 9));

                // The watcher's reload, or a timeout that fails the test without leaving the watcher open.
                await Promise.race([
                    new Promise<void>((resolve) => {
                        const stop = watching.onChange((change) => {
                            if (change.group === undefined && change.subject === undefined) {
                                stop();
                                resolve();
                            }
                        });
                        if (reloads.length > 0) resolve();
                    }),
                    new Promise<never>((_resolve, reject) =>
                        setTimeout(() => reject(new PrismarineServerErrors.MissingExecutor()), 5000)
                    )
                ]);
                expect(watching.groupOf('vip')?.weight).toBe(9);
                // One reload, the external edit's: the manager's own write before it reloaded nothing.
                const disk = vi
                    .mocked(logger.info)
                    .mock.calls.filter(([line]) => String(line).includes('changed on disk'));
                expect(disk).toHaveLength(1);
                expect(reloads).toHaveLength(1);
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
                'jsprismarine.command.tps',
                ...VERSION_3_DEFAULT_PERMISSIONS
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

            it('leaves the file as it is for a player it cannot name, as BDS does for a simulated player', async () => {
                const ivy = online('ivy', '00000000-0000-0000-0000-00000000000d');
                const { opManager } = managerOf();
                await opManager.enable();

                await opManager.setOpNow(ivy, true, { persist: false });
                expect(opManager.isOp(offline('ivy'))).toBe(true);
                await opManager.disable();

                expect(opsFile()).toEqual([]);
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
