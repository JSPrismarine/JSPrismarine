import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import fs from 'node:fs';

import { Logger } from '@jsprismarine/logger';
import { withCwd } from '../utils/cwd';
import BanManager from './BanManager';
import type { BanManagerServer } from './BanManager';

describe('ban', () => {
    describe('BanManager', () => {
        let logger: Logger;
        let server: BanManagerServer;
        let banManager: BanManager;

        beforeEach(() => {
            logger = new Logger();
            vi.spyOn(logger, 'warn').mockImplementation(() => {});
            vi.spyOn(logger, 'error').mockImplementation(() => {});
            server = { getLogger: () => logger };

            banManager = new BanManager(server);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        describe('onEnable', () => {
            it('should load the ban list from file', async () => {
                const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
                vi.spyOn(fs.promises, 'readFile').mockResolvedValue(
                    Buffer.from(JSON.stringify([{ name: 'player1', reason: 'reason1' }]))
                );

                await banManager.enable();

                expect(existsSyncSpy).toHaveBeenCalledWith(withCwd('banned-players.json'));
                expect(banManager.isBanned({ getName: () => 'player1' })).toBe('reason1');
            });
        });

        describe('onDisable', () => {
            it('should clear the banned map', async () => {
                banManager.disable();
                expect(banManager['banned'].size).toBe(0);
            });
        });

        describe('parseBanned', () => {
            it.skip('should load ban list from file', async () => {
                const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
                const getLoggerSpy = vi.spyOn(banManager['server'], 'getLogger');
                const readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue('[]');
                const parseSpy = vi.spyOn(JSON, 'parse').mockReturnValue([]);
                await banManager['parseBanned']();
                expect(existsSyncSpy).toHaveBeenCalledWith(withCwd('banned-players.json'));
                expect(getLoggerSpy).toHaveBeenCalledWith();
                expect(readFileSyncSpy).toHaveBeenCalledWith(withCwd('banned-players.json'));
                expect(parseSpy).toHaveBeenCalledWith('[]');
                expect(banManager['banned'].size).toBe(0);
            });

            it('should create ban list file if it does not exist', async () => {
                const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
                const getLoggerSpy = vi.spyOn(banManager['server'], 'getLogger');
                const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync');
                await banManager['parseBanned']();
                expect(existsSyncSpy).toHaveBeenCalledWith(withCwd('banned-players.json'));
                expect(getLoggerSpy).toHaveBeenCalledWith();
                expect(logger.warn).toHaveBeenCalledWith('Failed to load ban list!');
                expect(writeFileSyncSpy).toHaveBeenCalledWith(withCwd('banned-players.json'), '[]');
                expect(banManager['banned'].size).toBe(0);
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
