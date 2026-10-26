import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Difficulty, Gametype } from '@jsprismarine/minecraft';
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
                    generator: 'Overworld',
                    provider: 'LevelDB',
                    // A string, because the seed is 64 bits and a JSON number is a double.
                    seed: expect.stringMatching(/^-?\d+$/)
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

        it('should have online mode enabled by default', () => {
            expect(config.getOnlineMode()).toBe(true);
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

        it.each(['config.yml', 'config.yaml'])('converts legacy %s to JSON and keeps its comments', async (name) => {
            const jsonFile = path.join(configDirectory, 'config.json');
            const yamlFile = path.join(configDirectory, name);
            const yaml = [
                '# My server.',
                'port: 25565 # forwarded',
                '',
                '# Message shown in the server list.',
                'motd: Legacy server',
                'worlds:',
                '    # Primary world.',
                '    world:',
                '        seed: 42 # Keep the seed.',
                '# Keep this note.',
                ''
            ].join('\n');
            rmSync(jsonFile);
            writeFileSync(yamlFile, yaml);

            const legacyConfig = new Config();
            await legacyConfig.enable();

            expect(legacyConfig.getServerPort()).toBe(25565);
            expect(legacyConfig.getMotd()).toBe('Legacy server');
            expect(legacyConfig.getWorlds()).toEqual({ world: { seed: 42 } });
            expect(existsSync(jsonFile)).toBe(true);
            expect(readFileSync(yamlFile, 'utf8')).toBe(yaml);

            const json = readFileSync(jsonFile, 'utf8');
            expect(json).toContain(
                `https://unpkg.com/@jsprismarine/prismarine@${pkg.version}/schemas/config.schema.json`
            );
            expect(json).toContain('// My server.');
            expect(json).toContain('"port": 25565, // forwarded');
            expect(json).toContain('// Message shown in the server list.');
            expect(json).toContain('// Primary world.');
            expect(json).toContain('"seed": 42 // Keep the seed.');
            expect(json).toContain('// Keep this note.');
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

    /**
     * What a subclass that answers startup questions itself gets.
     *
     * Every test server in this repository stubs `enable` so nothing reads a
     * file, and the fields used to be left unset. `getDifficulty` lowercased
     * an undefined and threw partway through the join burst, which left the
     * joining client waiting at `AWAITING_SPAWN` for packets that never came.
     * Each getter has to answer with what the file's default would be.
     */
    describe('a Config whose enable never ran', () => {
        let configDirectory: string;

        // The constructor reads `log-level`, which writes the file, so even a config nothing
        // enables needs a directory of its own rather than the repository's.
        beforeEach(() => {
            configDirectory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-config-test-'));
            vi.stubEnv('JSP_DIR', configDirectory);
        });

        afterEach(() => {
            vi.unstubAllEnvs();
            rmSync(configDirectory, { recursive: true, force: true });
        });

        const stubbed = () =>
            new (class extends Config {
                public override async enable() {}
            })();

        it('answers with the difficulty the config file defaults to', () => {
            expect(stubbed().getDifficulty()).toBe(Difficulty.NORMAL);
        });

        it('answers every other startup question the join path asks', () => {
            const config = stubbed();

            expect(config.getGamemode()).toBe('survival');
            expect(config.getServerPort()).toBe(19132);
            expect(config.getServerIp()).toBe('0.0.0.0');
            expect(config.getLevelName()).toBe('world');
            expect(config.getMotd()).toBe('Another JSPrismarine server!');
            expect(config.getMaxPlayers()).toBe(20);
            expect(config.getViewDistance()).toBe(10);
            expect(config.getOnlineMode()).toBe(true);
            expect(config.getPacketCompressionLevel()).toBe(7);
            expect(config.getWorlds()).toEqual({
                world: { generator: 'Overworld', provider: 'LevelDB', seed: expect.stringMatching(/^-?\d+$/) }
            });
        });

        it('answers the same as a config enabled over an empty directory', async () => {
            const fromFile = new Config();
            await fromFile.enable();

            const config = stubbed();
            expect(config.getDifficulty()).toBe(fromFile.getDifficulty());
            expect(config.getGamemode()).toBe(fromFile.getGamemode());
            expect(config.getViewDistance()).toBe(fromFile.getViewDistance());
            expect(config.getLogExcludedPackets()).toStrictEqual(fromFile.getLogExcludedPackets());
            expect(config.getCraftingRecipeLimit()).toBe(fromFile.getCraftingRecipeLimit());
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
