import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '@jsprismarine/logger';
import { parseConfigDocument } from '../config/ConfigDocument';
import BanManager from './BanManager';
import type { BanManagerServer } from './BanManager';

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

                expect(banManager.isBanned({ getName: () => 'player1' })).toBe('reason1');
                // A ban with no reason still reads as banned.
                expect(banManager.isBanned({ getName: () => 'player2' })).not.toBe(false);
                expect(banManager.isBanned({ getName: () => 'player3' })).toBe(false);
            });

            it('should create ban list file if it does not exist', async () => {
                await banManager.enable();

                expect(logger.warn).toHaveBeenCalledWith('Failed to load ban list!');
                expect(readFileSync(file, 'utf8')).toContain('// JSPrismarine schema:');
                expect(banManager['banned'].size).toBe(0);
            });

            it('should skip entries that are not bans and keep the rest', async () => {
                writeFileSync(file, '[{ "name": "player1", "reason": "r" }, "junk", { "reason": "no name" }]');

                await banManager.enable();

                expect(banManager.isBanned({ getName: () => 'player1' })).toBe('r');
                expect(banManager['banned'].size).toBe(1);
            });

            it('should report a file that does not parse without throwing', async () => {
                writeFileSync(file, '[{ "name": ');

                await banManager.enable();

                expect(logger.error).toHaveBeenCalled();
                expect(banManager['banned'].size).toBe(0);
            });
        });

        describe('onDisable', () => {
            it('should clear the banned map', async () => {
                banManager['banned'].set('player1', { reason: 'reason1' });
                await banManager.disable();
                expect(banManager['banned'].size).toBe(0);
            });
        });

        describe('setBanned', () => {
            it('should add the ban to the file without touching the other lines', async () => {
                writeFileSync(file, BAN_FILE);
                await banManager.enable();

                await banManager.setBanned('player3', 'alts');

                const text = readFileSync(file, 'utf8');
                expect(banManager.isBanned({ getName: () => 'player3' })).toBe('alts');
                expect(text).toContain('// Griefed spawn twice; appeal denied.');
                expect(text).toContain('{ "name": "player1", "reason": "reason1" },');
                expect(parseConfigDocument('json', text).get([])).toStrictEqual([
                    { name: 'player1', reason: 'reason1' },
                    { name: 'player2', reason: '' },
                    { name: 'player3', reason: 'alts' }
                ]);
            });

            it('should replace an existing ban in place', async () => {
                writeFileSync(file, BAN_FILE);
                await banManager.enable();

                await banManager.setBanned('player1', 'again');

                const text = readFileSync(file, 'utf8');
                expect(text).toContain('// Griefed spawn twice; appeal denied.');
                expect(parseConfigDocument('json', text).get([])).toStrictEqual([
                    { name: 'player1', reason: 'again' },
                    { name: 'player2', reason: '' }
                ]);
            });

            it('should start a file from nothing', async () => {
                await banManager.setBanned('player1');

                expect(parseConfigDocument('json', readFileSync(file, 'utf8')).get([])).toStrictEqual([
                    { name: 'player1', reason: '' }
                ]);
            });
        });

        describe('setUnbanned', () => {
            it('should remove only that player and keep the comments', async () => {
                writeFileSync(file, BAN_FILE);
                await banManager.enable();

                await banManager.setUnbanned('player2');

                const text = readFileSync(file, 'utf8');
                expect(banManager.isBanned({ getName: () => 'player2' })).toBe(false);
                expect(text).toContain('// Griefed spawn twice; appeal denied.');
                expect(parseConfigDocument('json', text).get([])).toStrictEqual([
                    { name: 'player1', reason: 'reason1' }
                ]);
            });
        });

        describe('isBanned', () => {
            it('should return the reason if player is banned', () => {
                banManager['banned'].set('player1', { reason: 'reason1' });
                const player = { getName: vi.fn(() => 'player1') };
                const result = banManager.isBanned(player);
                expect(result).toBe('reason1');
            });

            it('should return false if player is not banned', () => {
                const player = { getName: vi.fn(() => 'player1') };
                const result = banManager.isBanned(player);
                expect(result).toBe(false);
            });
        });
    });
});
