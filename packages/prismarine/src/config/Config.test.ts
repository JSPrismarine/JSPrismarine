import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Gametype } from '@jsprismarine/minecraft';
import { Config, toPacketCompressionLevel } from './Config';

describe('config', () => {
    describe('Config', () => {
        let config: Config;
        let configDirectory: string;

        beforeEach(async () => {
            configDirectory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-config-test-'));
            vi.stubEnv('JSP_DIR', configDirectory);
            config = new Config();
            await config.enable();
        });

        afterEach(() => {
            vi.unstubAllEnvs();
            rmSync(configDirectory, { recursive: true, force: true });
        });

        it('should have the default server port', () => {
            expect(config.getServerPort()).toBe(19132);
        });

        it('should have the default server IP', () => {
            expect(config.getServerIp()).toBe('0.0.0.0');
        });

        it('should have the default level name', () => {
            expect(config.getLevelName()).toBe('world');
        });

        it('should have the default worlds', () => {
            expect(config.getWorlds()).toEqual({
                world: {
                    generator: 'Flat',
                    provider: 'LevelDB',
                    seed: expect.any(Number)
                }
            });
        });

        it('should have the default max players', () => {
            expect(config.getMaxPlayers()).toBe(20);
        });

        it('should have the default gamemode', () => {
            expect(config.getGamemode().toLowerCase()).toBe('survival');
        });

        it('should have the default MOTD', () => {
            expect(config.getMotd()).toBe('Another JSPrismarine server!');
        });

        it('should have the default view distance', () => {
            expect(config.getViewDistance()).toBe(10);
        });

        it('should have online mode disabled by default', () => {
            expect(config.getOnlineMode()).toBe(false);
        });

        it('should have the default packet compression level', () => {
            expect(config.getPacketCompressionLevel()).toBe(7);
        });

        it('should write every key with a comment explaining it', () => {
            const text = readFileSync(path.join(configDirectory, 'config.yaml'), 'utf8');

            expect(text).toContain(
                '# The UDP port the server listens on. Bedrock clients look for 19132.\nport: 19132\n'
            );
            expect(text).toContain('# How far players see, in chunks.\nview-distance: 10\n');
            // Every key has a comment above it: as many comment lines as top-level keys.
            const keys = text.match(/^[a-z-]+:/gm) ?? [];
            const comments = text.match(/^# /gm) ?? [];
            expect(keys.length).toBeGreaterThan(20);
            expect(comments).toHaveLength(keys.length);
        });

        it('should add a new key to an older file without touching what is there', async () => {
            const file = path.join(configDirectory, 'config.yaml');
            writeFileSync(file, '# My server.\nport: 25565 # forwarded\nmotd: Hi there\n');

            const reread = new Config();
            await reread.enable();

            const text = readFileSync(file, 'utf8');
            expect(reread.getServerPort()).toBe(25565);
            expect(reread.getMotd()).toBe('Hi there');
            expect(text.startsWith('# My server.\nport: 25565 # forwarded\nmotd: Hi there\n')).toBe(true);
            expect(text).toContain('# How far players see, in chunks.\nview-distance: 10\n');
        });

        it('should set the gamemode', () => {
            config.setGamemode(Gametype.CREATIVE);
            expect(config.getGamemode().toLowerCase()).toBe('creative');
        });

        it('should set the MOTD', () => {
            config.setMotd('Welcome to my server!');
            expect(config.getMotd()).toBe('Welcome to my server!');
        });
    });

    describe('toPacketCompressionLevel', () => {
        it('should clamp a compression level zlib would reject', () => {
            // A typo in the config file used to surface as a rejection on the chunk sending
            // path, which took the server's tick down with it.
            for (const [configured, expected] of [
                [10, 9],
                [100, 9],
                [-2, -1],
                [0, 0],
                [9, 9],
                [-1, -1]
            ]) {
                expect(toPacketCompressionLevel(configured)).toBe(expected);
            }
        });

        it('should fall back to the default for a compression level that is not a number', () => {
            for (const configured of ['fast', undefined, Number.NaN, 4.5]) {
                expect(toPacketCompressionLevel(configured)).toBe(7);
            }
        });
    });
});
