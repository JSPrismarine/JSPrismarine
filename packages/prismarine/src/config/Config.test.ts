import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Gametype } from '@jsprismarine/minecraft';
import pkg from '../../package.json' with { type: 'json' };
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
            const text = readFileSync(path.join(configDirectory, 'config.json'), 'utf8');

            expect(text).toContain(
                `https://unpkg.com/@jsprismarine/prismarine@${pkg.version}/schemas/config.schema.json`
            );
            expect(text).toContain('// The UDP port the server listens on. Bedrock clients look for 19132.');
            expect(text).toContain('"port": 19132');
            expect(text).toContain('// How far players see, in chunks.');
            expect(text).toContain('"view-distance": 10');
            // Every setting has a comment; `$schema` is the only top-level key without one.
            const keys = text.match(/^ {4}"[^"]+":/gm) ?? [];
            const comments = text.match(/^ {4}\/\//gm) ?? [];
            expect(keys.length).toBeGreaterThan(20);
            expect(comments).toHaveLength(keys.length - 1);
        });

        it('should add a new key to an older file without touching what is there', async () => {
            const file = path.join(configDirectory, 'config.json');
            const oldConfig = '{\n  // My server.\n  "port": 25565, // forwarded\n  "motd": "Hi there"\n}\n';
            writeFileSync(file, oldConfig);

            const reread = new Config();
            await reread.enable();

            const text = readFileSync(file, 'utf8');
            expect(reread.getServerPort()).toBe(25565);
            expect(reread.getMotd()).toBe('Hi there');
            expect(text).toContain('  // My server.');
            expect(text).toContain('"port": 25565, // forwarded');
            expect(text).toContain('"motd": "Hi there"');
            expect(text.indexOf('"port":') < text.indexOf('"motd":')).toBe(true);
            expect(text).toContain('// How far players see, in chunks.');
            expect(text).toContain('"view-distance": 10');
        });

        it('should keep using a legacy config.yaml when config.json is absent', async () => {
            const jsonFile = path.join(configDirectory, 'config.json');
            const yamlFile = path.join(configDirectory, 'config.yaml');
            rmSync(jsonFile);
            writeFileSync(yamlFile, 'port: 25565\nmotd: Legacy server\n');

            const legacyConfig = new Config();
            await legacyConfig.enable();

            expect(legacyConfig.getServerPort()).toBe(25565);
            expect(legacyConfig.getMotd()).toBe('Legacy server');
            expect(existsSync(jsonFile)).toBe(false);
        });

        it('should prefer config.json when both config files exist', async () => {
            writeFileSync(path.join(configDirectory, 'config.yaml'), 'port: 25565\n');

            const reread = new Config();
            await reread.enable();

            expect(reread.getServerPort()).toBe(19132);
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
