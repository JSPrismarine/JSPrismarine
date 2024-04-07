import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import fs from 'fs';
import path from 'path';

import BanManager from './BanManager';
import type Server from '../Server';

describe('ban', () => {
    describe('BanManager', () => {
        let server: Server;
        let banManager: BanManager;

        beforeEach(() => {
            server = {
                getLogger: vi.fn().mockReturnValue({
                    warn: vi.fn(),
                    error: vi.fn()
                })
            } as unknown as Server;

            banManager = new BanManager(server);
        });

        afterEach(() => {
            vi.clearAllMocks();
        });

        describe('onEnable', () => {
            it('should call parseBanned', async () => {
                const parseBannedSpy = vi.spyOn(banManager, 'parseBanned' as const as keyof BanManager);
                await banManager.onEnable();
                expect(parseBannedSpy).toHaveBeenCalled();
            });
        });

        describe('onDisable', () => {
            it('should clear the banned map', async () => {
                banManager.onDisable();
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
                expect(existsSyncSpy).toHaveBeenCalledWith(path.join(process.cwd(), '/banned-players.json'));
                expect(getLoggerSpy).toHaveBeenCalledWith();
                expect(readFileSyncSpy).toHaveBeenCalledWith(path.join(process.cwd(), '/banned-players.json'));
                expect(parseSpy).toHaveBeenCalledWith('[]');
                expect(banManager['banned'].size).toBe(0);
            });

            it('should create ban list file if it does not exist', async () => {
                const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
                const getLoggerSpy = vi.spyOn(banManager['server'], 'getLogger');
                const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync');
                await banManager['parseBanned']();
                expect(existsSyncSpy).toHaveBeenCalledWith(path.join(process.cwd(), '/banned-players.json'));
                expect(getLoggerSpy).toHaveBeenCalledWith();
                expect(writeFileSyncSpy).toHaveBeenCalledWith(path.join(process.cwd(), '/banned-players.json'), '[]');
                expect(banManager['banned'].size).toBe(0);
            });
        });

        describe('isBanned', () => {
            it('should return the reason if player is banned', () => {
                banManager['banned'].set('player1', { reason: 'reason1' });
                const player = { getName: vi.fn().mockReturnValue('player1') };
                const result = banManager.isBanned(player as any);
                expect(result).toBe('reason1');
            });

            it('should return false if player is not banned', () => {
                const player = { getName: vi.fn().mockReturnValue('player1') };
                const result = banManager.isBanned(player as any);
                expect(result).toBe(false);
            });
        });
    });
});
