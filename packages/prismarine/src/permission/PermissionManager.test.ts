import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '@jsprismarine/logger';
import Console from '../Console';
import { canExecute, PermissionManager } from './PermissionManager';
import type { PermissionManagerServer } from './PermissionManager';

/** Strips `//` comments so a commented file can be compared as plain JSON. */
const plain = (text: string): unknown => JSON.parse(text.replace(/\/\/.*$/gm, ''));

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
                defaultPermissions: [
                    'minecraft.command.help',
                    'minecraft.command.list',
                    'minecraft.command.me',
                    'jsprismarine.command.plugins',
                    'jsprismarine.command.version',
                    'jsprismarine.command.tps'
                ],
                defaultOperatorPermissions: ['*'],
                players: [{ name: 'filfat', permissions: ['*'] }]
            });
            expect(readFileSync(path.join(directory, 'ops.json'), 'utf8')).toBe('[]');
            expect(manager.getDefaultPermissions()).toHaveLength(6);
        });

        it('loads commented files and skips entries it cannot use', async () => {
            writeFileSync(
                path.join(directory, 'permissions.json'),
                '{\n  // trimmed down\n  "defaultPermissions": ["minecraft.command.help"],\n  "players": [{ "name": "alice", "permissions": ["*"] }, { "name": 7 }]\n}\n'
            );
            writeFileSync(
                path.join(directory, 'ops.json'),
                '[\n  { "name": "alice", "level": 4 }, // the owner\n  "junk"\n]\n'
            );

            await manager.enable();

            expect(manager.getDefaultPermissions()).toStrictEqual(['minecraft.command.help']);
            expect(manager.isOp('alice')).toBe(true);
            expect(manager['permissions'].get('alice')).toStrictEqual(['*']);
            expect(manager['permissions'].size).toBe(1);
        });

        it('refuses a permissions file that does not parse', async () => {
            writeFileSync(path.join(directory, 'permissions.json'), '{ "defaultPermissions": [');

            await expect(manager.enable()).rejects.toThrow('Invalid permissions.json file.');
        });

        it('adds and removes one operator line and keeps the comments', async () => {
            const file = path.join(directory, 'ops.json');
            writeFileSync(file, '[\n    // The owner.\n    { "name": "alice", "level": 4 }\n]\n');

            await manager['writeOp']('bob', true);
            let text = readFileSync(file, 'utf8');
            expect(text).toContain('// The owner.');
            expect(plain(text)).toStrictEqual([
                { name: 'alice', level: 4 },
                { name: 'bob', level: 4 }
            ]);

            await manager['writeOp']('bob', true);
            expect(plain(readFileSync(file, 'utf8'))).toHaveLength(2);

            await manager['writeOp']('alice', false);
            text = readFileSync(file, 'utf8');
            expect(plain(text)).toStrictEqual([{ name: 'bob', level: 4 }]);
            expect(text).toContain('// The owner.');
        });
    });
});
