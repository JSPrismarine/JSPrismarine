import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '@jsprismarine/logger';
import { parseConfigDocument } from '../config/ConfigDocument';
import { identityNamed } from '../testing/sessionIdentity.test.helper';
import BanManager from './BanManager';
import type { BanManagerServer } from './BanManager';

/** An Xbox account's identity, as an online-mode login carries it. */
const xboxPlayer = (name: string, xuid: string) => ({
    ...identityNamed(name),
    xuid,
    subject: { kind: 'xbox', xuid } as const
});

const BAN_FILE = [
    '[',
    '    // Griefed spawn twice; appeal denied.',
    '    { "name": "player1", "reason": "reason1" },',
    '    { "name": "player2", "reason": "" }',
    ']',
    ''
].join('\n');

describe('ban', () => {
    describe('BanManager', () => {
        let logger: Logger;
        let server: BanManagerServer;
        let banManager: BanManager;
        let directory: string;
        let file: string;

        beforeEach(() => {
            directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-ban-test-'));
            vi.stubEnv('JSP_DIR', directory);
            file = path.join(directory, 'banned-players.json');

            logger = new Logger();
            vi.spyOn(logger, 'warn').mockImplementation(() => {});
            vi.spyOn(logger, 'error').mockImplementation(() => {});
            server = { getLogger: () => logger };

            banManager = new BanManager(server);
        });

        afterEach(() => {
            vi.unstubAllEnvs();
            vi.restoreAllMocks();
            rmSync(directory, { recursive: true, force: true });
        });

        describe('onEnable', () => {
            it('should load the ban list from file', async () => {
                writeFileSync(file, BAN_FILE);

                await banManager.enable();

                expect(banManager.isBanned(identityNamed('player1'))).toBe('reason1');
                // A ban with no reason still reads as banned.
                expect(banManager.isBanned(identityNamed('player2'))).not.toBe(false);
                expect(banManager.isBanned(identityNamed('player3'))).toBe(false);
                // A login's identity, before any player exists.
                expect(banManager.isBanned(identityNamed('player1'))).toBe('reason1');
                expect(banManager.isBanned(identityNamed('player3'))).toBe(false);
            });

            it('should create ban list file if it does not exist', async () => {
                await banManager.enable();

                // Creating the list is what a first start does, so it is no warning.
                expect(logger.warn).not.toHaveBeenCalled();
                expect(readFileSync(file, 'utf8')).toContain('// JSPrismarine schema:');
                expect(banManager.isBanned(identityNamed('player1'))).toBe(false);
            });

            it('should skip entries that are not bans and keep the rest', async () => {
                writeFileSync(file, '[{ "name": "player1", "reason": "r" }, "junk", { "reason": "no name" }]');

                await banManager.enable();

                expect(banManager.isBanned(identityNamed('player1'))).toBe('r');
                expect(banManager.isBanned(identityNamed('junk'))).toBe(false);
            });

            it('should report a file that does not parse without throwing', async () => {
                writeFileSync(file, '[{ "name": ');

                await banManager.enable();

                expect(logger.error).toHaveBeenCalled();
                expect(banManager.isBanned(identityNamed('player1'))).toBe(false);
            });
        });

        describe('onDisable', () => {
            it('should clear the banned list', async () => {
                await banManager.setBanned({ name: 'player1' }, 'reason1');
                await banManager.disable();
                expect(banManager.isBanned(identityNamed('player1'))).toBe(false);
            });
        });

        describe('setBanned', () => {
            it('bans an online player by name and account without touching the other lines', async () => {
                writeFileSync(file, BAN_FILE);
                await banManager.enable();

                await banManager.setBanned({ name: 'player3', subject: { kind: 'offline', name: 'player3' } }, 'alts');

                const text = readFileSync(file, 'utf8');
                expect(banManager.isBanned(identityNamed('player3'))).toBe('alts');
                expect(text).toContain('// Griefed spawn twice; appeal denied.');
                expect(text).toContain('{ "name": "player1", "reason": "reason1" },');
                expect(parseConfigDocument(text).get([])).toStrictEqual([
                    { name: 'player1', reason: 'reason1' },
                    { name: 'player2', reason: '' },
                    { name: 'player3', kind: 'offline', id: 'player3', reason: 'alts' }
                ]);
            });

            it('bans an offline name on every platform', async () => {
                await banManager.enable();

                await banManager.setBanned({ name: 'player3' }, 'alts');

                expect(banManager.isBanned(identityNamed('player3'))).toBe('alts');
                expect(banManager.isBanned(xboxPlayer('player3', '2535400000000003'))).toBe('alts');
                expect(parseConfigDocument(readFileSync(file, 'utf8')).get([])).toStrictEqual([
                    { name: 'player3', reason: 'alts' }
                ]);
            });

            it('matches a ban with an account by the name and by the account, so a renamed account stays banned', async () => {
                await banManager.enable();

                await banManager.setBanned(
                    { name: 'player3', subject: { kind: 'xbox', xuid: '2535400000000003' } },
                    'alts'
                );

                expect(banManager.isBanned(identityNamed('player3'))).toBe('alts');
                expect(banManager.isBanned(xboxPlayer('renamed', '2535400000000003'))).toBe('alts');
                expect(banManager.isBanned(xboxPlayer('player3', '2535400000000009'))).toBe('alts');
                expect(banManager.isBanned(xboxPlayer('other', '2535400000000009'))).toBe(false);
            });

            it('should replace an existing ban in place', async () => {
                writeFileSync(file, BAN_FILE);
                await banManager.enable();

                await banManager.setBanned({ name: 'player1' }, 'again');

                const text = readFileSync(file, 'utf8');
                expect(text).toContain('// Griefed spawn twice; appeal denied.');
                expect(parseConfigDocument(text).get([])).toStrictEqual([
                    { name: 'player1', reason: 'again' },
                    { name: 'player2', reason: '' }
                ]);
            });

            it('replaces every ban of the name in the file, so a restart does not bring an old account back', async () => {
                writeFileSync(
                    file,
                    `[
    // two accounts once held the name
    { "name": "player1", "kind": "xbox", "id": "1", "reason": "a" },
    { "name": "player2", "reason": "" },
    { "name": "player1", "kind": "xbox", "id": "2", "reason": "b" }
]
`
                );
                await banManager.enable();

                await banManager.setBanned({ name: 'player1', subject: { kind: 'xbox', xuid: '3' } }, 'c');

                const text = readFileSync(file, 'utf8');
                expect(text).toContain('// two accounts once held the name');
                expect(parseConfigDocument(text).get([])).toStrictEqual([
                    { name: 'player1', kind: 'xbox', id: '3', reason: 'c' },
                    { name: 'player2', reason: '' }
                ]);
                const reloaded = new BanManager(server);
                await reloaded.enable();
                expect(reloaded.isBanned(xboxPlayer('renamed', '1'))).toBe(false);
                expect(reloaded.isBanned(xboxPlayer('renamed', '2'))).toBe(false);
                expect(reloaded.isBanned(xboxPlayer('renamed', '3'))).toBe('c');
            });

            it('should start a file from nothing', async () => {
                await banManager.setBanned({ name: 'player1' });

                expect(parseConfigDocument(readFileSync(file, 'utf8')).get([])).toStrictEqual([
                    { name: 'player1', reason: '' }
                ]);
            });
        });

        describe('claimLegacy', () => {
            it('adds the account of the player a name-only ban turns away, where the entry was, and keeps matching the name', async () => {
                writeFileSync(file, BAN_FILE);
                await banManager.enable();
                const steve = xboxPlayer('player1', '2535400000000001');

                expect(await banManager.claimLegacy(steve)).toBe(true);

                expect(banManager.isBanned(steve)).toBe('reason1');
                // The name match stays, so a ban never lapses; the account match is added to it.
                expect(banManager.isBanned(identityNamed('player1'))).toBe('reason1');
                expect(banManager.isBanned(xboxPlayer('renamed', '2535400000000001'))).toBe('reason1');
                const text = readFileSync(file, 'utf8');
                expect(text).toContain('// Griefed spawn twice; appeal denied.');
                expect(parseConfigDocument(text).get([])).toStrictEqual([
                    { name: 'player1', kind: 'xbox', id: '2535400000000001', reason: 'reason1' },
                    { name: 'player2', reason: '' }
                ]);
                expect(await banManager.claimLegacy(steve)).toBe(false);
            });
        });

        describe('setUnbanned', () => {
            it('should remove only that player and keep the comments', async () => {
                writeFileSync(file, BAN_FILE);
                await banManager.enable();

                await banManager.setUnbanned('player2');

                const text = readFileSync(file, 'utf8');
                expect(banManager.isBanned(identityNamed('player2'))).toBe(false);
                expect(text).toContain('// Griefed spawn twice; appeal denied.');
                expect(parseConfigDocument(text).get([])).toStrictEqual([{ name: 'player1', reason: 'reason1' }]);
            });

            it('lifts every ban on the name, whichever platform each names', async () => {
                writeFileSync(
                    file,
                    '[{ "name": "player1", "kind": "xbox", "id": "1", "reason": "a" }, { "name": "player1", "reason": "b" }]'
                );
                await banManager.enable();

                await banManager.setUnbanned('player1');

                expect(banManager.isBanned(xboxPlayer('player1', '1'))).toBe(false);
                expect(banManager.isBanned(identityNamed('player1'))).toBe(false);
                expect(parseConfigDocument(readFileSync(file, 'utf8')).get([])).toStrictEqual([]);
            });
        });

        describe('isBanned', () => {
            it('should return the reason if player is banned', async () => {
                await banManager.setBanned({ name: 'player1' }, 'reason1');
                expect(banManager.isBanned(identityNamed('player1'))).toBe('reason1');
            });

            it('should return false if player is not banned', () => {
                expect(banManager.isBanned(identityNamed('player1'))).toBe(false);
            });
        });
    });
});
