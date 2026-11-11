import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Difficulty, Gametype, PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import pkg from '../../package.json' with { type: 'json' };
import { Config, toPacketCompressionLevel, toPacketCompressionThreshold } from './Config';
import { normalizeWorldData, worldDataOf } from './normalizeWorldData';
import { chunkWorkerCount } from '../world/generators/chunkConcurrency';

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

        it('puts the IPv6 listener on 19133, where Bedrock clients look for it, and writes it', () => {
            expect(config.getServerPortV6()).toBe(19133);
            expect(readFileSync(path.join(configDirectory, 'config.json'), 'utf8')).toContain('"server-portv6": 19133');
        });

        it('writes server-port to a fresh file, and none of the keys that follow it, even when read again', async () => {
            const read = () => readFileSync(path.join(configDirectory, 'config.json'), 'utf8');
            const reread = new Config();
            await reread.enable();

            expect(read()).toContain('"server-port": 19132');
            for (const key of ['port', 'server-udp-ports', 'query-port', 'server-public-ip']) {
                expect(read()).not.toContain(`"${key}"`);
            }
            expect([reread.getQueryPort(), reread.getServerUdpPorts()]).toStrictEqual([19132, '']);
        });

        it("renames an older file's port to server-port, keeping its value and comments", async () => {
            const file = path.join(configDirectory, 'config.json');
            writeFileSync(file, '{\n  // My server.\n  "port": 25565, // forwarded\n  "motd": "Hi there"\n}\n');

            const reread = new Config();
            await reread.enable();

            const text = readFileSync(file, 'utf8');
            expect(reread.getServerPort()).toBe(25565);
            expect(text).toContain('  // My server.\n  "server-port": 25565, // forwarded');
            expect(text).not.toContain('"port"');
        });

        it('refuses a file that has both port and server-port', async () => {
            writeFileSync(path.join(configDirectory, 'config.json'), '{ "port": 19132, "server-port": 19200 }\n');

            await expect(new Config().enable()).rejects.toThrow('has both port and server-port');
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
                    preset: 'minecraft:normal',
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

        it('should default chunk workers to the available worker count', () => {
            expect(config.getChunkWorkers()).toBe(Math.max(0, chunkWorkerCount()));
        });

        it('allows chunk generation to stay on the server thread', async () => {
            writeFileSync(path.join(configDirectory, 'config.json'), '{"chunk-workers":0}');

            const configured = new Config();
            await configured.enable();

            expect(configured.getChunkWorkers()).toBe(0);
        });

        it('clamps invalid negative chunk worker counts to zero', async () => {
            writeFileSync(path.join(configDirectory, 'config.json'), '{"chunk-workers":-2}');

            const configured = new Config();
            await configured.enable();

            expect(configured.getChunkWorkers()).toBe(0);
        });

        it('keeps up to a gigabyte of terrain on disk by default', () => {
            expect(config.getTerrainCacheSizeMb()).toBe(1024);
        });

        it('turns the terrain cache off at zero and clamps invalid sizes', async () => {
            for (const [configured, expected] of [
                ['0', 0],
                ['256', 256],
                ['-5', 0],
                ['2.9', 2],
                ['"lots"', 1024]
            ] as const) {
                writeFileSync(path.join(configDirectory, 'config.json'), `{"terrain-cache-size-mb":${configured}}`);

                const reconfigured = new Config();
                await reconfigured.enable();

                expect(reconfigured.getTerrainCacheSizeMb(), configured).toBe(expected);
            }
        });

        it('runs generation workers in a host process unless told to keep them in the server', async () => {
            expect(config.getChunkHost()).toBe('process');
            expect(config.getInvalidChunkHost()).toBeUndefined();

            for (const [configured, expected] of [
                ['"process"', 'process'],
                ['"in-process"', 'in-process'],
                ['"elsewhere"', 'process']
            ] as const) {
                writeFileSync(path.join(configDirectory, 'config.json'), `{"chunk-host":${configured}}`);

                const reconfigured = new Config();
                await reconfigured.enable();

                expect(reconfigured.getChunkHost(), configured).toBe(expected);
            }

            writeFileSync(path.join(configDirectory, 'config.json'), '{"chunk-host":"elsewhere"}');
            const invalid = new Config();
            await invalid.enable();
            expect(invalid.getInvalidChunkHost()).toBe('elsewhere');
        });

        it('should have online mode enabled by default', () => {
            expect(config.getOnlineMode()).toBe(true);
        });

        it('runs RakNet on a worker thread by default', () => {
            expect(config.getUseRakNetWorker()).toBe(true);
        });

        it('accepts RakNet and NetherNet clients and shows on the LAN by default, as BDS ships', () => {
            expect(config.getEnableRakNet()).toBe(true);
            expect(config.getEnableNetherNet()).toBe(true);
            expect(config.getEnableLanVisibility()).toBe(true);
            // Unset, as Bedrock Dedicated Server 1.26.70 ships it: NetherNet's UDP is the server port.
            expect(config.getServerUdpPorts()).toBe('');
        });

        it('advertises no public address unless config.json names one, and writes none to a fresh file', async () => {
            expect(config.getServerPublicIp()).toBe('');
            expect(readFileSync(path.join(configDirectory, 'config.json'), 'utf8')).not.toContain('"server-public-ip"');

            writeFileSync(
                path.join(configDirectory, 'config.json'),
                JSON.stringify({ 'server-public-ip': '203.0.113.7' })
            );
            const fromFile = new Config();
            await fromFile.enable();
            expect(fromFile.getServerPublicIp()).toBe('203.0.113.7');
        });

        it('looks up a public address by default, and reads the switch from config.json', async () => {
            expect(config.getEnableServerPublicIpLookup()).toBe(true);

            writeFileSync(
                path.join(configDirectory, 'config.json'),
                JSON.stringify({ 'enable-server-public-ip-lookup': false })
            );
            const fromFile = new Config();
            await fromFile.enable();
            expect(fromFile.getEnableServerPublicIpLookup()).toBe(false);
        });

        it('reads the transport and LAN visibility switches from config.json', async () => {
            writeFileSync(
                path.join(configDirectory, 'config.json'),
                JSON.stringify({ 'enable-raknet': false, 'enable-nethernet': false, 'enable-lan-visibility': false })
            );
            const fromFile = new Config();
            await fromFile.enable();

            expect(fromFile.getEnableRakNet()).toBe(false);
            expect(fromFile.getEnableNetherNet()).toBe(false);
            expect(fromFile.getEnableLanVisibility()).toBe(false);
        });

        it('should have the default packet compression level', () => {
            expect(config.getPacketCompressionLevel()).toBe(7);
        });

        it('keeps zlib as the default packet compression algorithm', () => {
            expect(config.getPacketCompressionAlgorithm()).toBe(PacketCompressionAlgorithm.ZLIB);
        });

        it.each([
            ['zlib', PacketCompressionAlgorithm.ZLIB],
            ['snappy', PacketCompressionAlgorithm.SNAPPY],
            ['none', PacketCompressionAlgorithm.NONE],
            ['unknown', PacketCompressionAlgorithm.ZLIB]
        ] as const)('selects the configured packet compression algorithm: %s', async (value, expected) => {
            writeFileSync(
                path.join(configDirectory, 'config.json'),
                JSON.stringify({ 'packet-compression-algorithm': value })
            );
            const fromFile = new Config();
            await fromFile.enable();

            expect(fromFile.getPacketCompressionAlgorithm()).toBe(expected);
        });

        it('uses the default packet compression threshold', () => {
            expect(config.getPacketCompressionThreshold()).toBe(256);
        });

        it('keeps full-flush packet fragments disabled until retail clients validate them', () => {
            expect(config.getPacketFullFlushFragments()).toBe(false);
        });

        it('reads the full-flush packet fragment flag from config.json', async () => {
            writeFileSync(path.join(configDirectory, 'config.json'), '{ "packet-full-flush-fragments": true }\n');
            const configured = new Config();
            await configured.enable();

            expect(configured.getPacketFullFlushFragments()).toBe(true);
        });

        it('reads the packet compression threshold from config.json', async () => {
            writeFileSync(path.join(configDirectory, 'config.json'), '{ "packet-compression-threshold": 512 }\n');
            const configured = new Config();
            await configured.enable();

            expect(configured.getPacketCompressionThreshold()).toBe(512);
        });

        it('should write every key with a comment explaining it', () => {
            const text = readFileSync(path.join(configDirectory, 'config.json'), 'utf8');

            expect(text).toContain(
                `https://unpkg.com/@jsprismarine/prismarine@${pkg.version}/schemas/config.schema.json`
            );
            expect(text).toContain("// The port the server listens on, as Bedrock Dedicated Server's server-port");
            expect(text).toContain('"server-port": 19132');
            expect(text).toContain('// How far players see, in chunks.');
            expect(text).toContain('"view-distance": 10');
            expect(text).toContain(
                '// How many worker threads to use for chunk generation. 0 keeps it on the server thread.'
            );
            expect(text).toContain('"chunk-workers":');
            // Every setting has a comment; `$schema` is the only top-level key without one.
            const keys = text.match(/^ {4}"[^"]+":/gm) ?? [];
            const comments = text.match(/^ {4}\/\//gm) ?? [];
            expect(keys.length).toBeGreaterThan(20);
            expect(comments).toHaveLength(keys.length - 1);
        });

        it('should add a new key to an older file without touching what is there', async () => {
            const file = path.join(configDirectory, 'config.json');
            const oldConfig = '{\n  // My server.\n  "server-port": 25565, // forwarded\n  "motd": "Hi there"\n}\n';
            writeFileSync(file, oldConfig);

            const reread = new Config();
            await reread.enable();

            const text = readFileSync(file, 'utf8');
            expect(reread.getServerPort()).toBe(25565);
            expect(reread.getMotd()).toBe('Hi there');
            expect(text).toContain('  // My server.');
            expect(text).toContain('"server-port": 25565, // forwarded');
            expect(text).toContain('"motd": "Hi there"');
            expect(text.indexOf('"server-port":') < text.indexOf('"motd":')).toBe(true);
            expect(text).toContain('// How far players see, in chunks.');
            expect(text).toContain('"view-distance": 10');
        });

        it('answers query on the game socket by default, on whatever port the file names', async () => {
            expect(config.getEnableQuery()).toBe(true);
            expect(config.getQueryPort()).toBe(config.getServerPort());

            writeFileSync(path.join(configDirectory, 'config.json'), '{ "server-port": 25565 }\n');
            const reread = new Config();
            await reread.enable();
            expect(reread.getQueryPort()).toBe(25565);
        });

        it('keeps query on the game socket when the server port is overridden, and writes no query port', async () => {
            const overridden = new Config({ serverPort: 19200 });
            await overridden.enable();

            expect(overridden.getServerPort()).toBe(19200);
            expect(overridden.getQueryPort()).toBe(19200);
            expect(readFileSync(path.join(configDirectory, 'config.json'), 'utf8')).not.toContain('"query-port"');
        });

        it('should rewrite a world read in the old spelling without touching the rest', async () => {
            const file = path.join(configDirectory, 'config.json');
            writeFileSync(
                file,
                [
                    '{',
                    '  // My server.',
                    '  "server-port": 25565, // forwarded',
                    '  "worlds": {',
                    '    "world": { "generator": "Flat", "layers": [{ "block": "stone", "size": 3 }], "seed": "9" }',
                    '  },',
                    '  "motd": "Hi there"',
                    '}',
                    ''
                ].join('\n')
            );

            const reread = new Config();
            await reread.enable();
            expect(reread.getWorlds()).toEqual({
                world: { generator: 'Flat', layers: [{ block: 'stone', size: 3 }], seed: '9' }
            });

            const normalized = normalizeWorldData(reread.getWorlds()['world']!, ['minecraft:flat']);
            reread.setWorld('world', worldDataOf(normalized), true);

            const text = readFileSync(file, 'utf8');
            expect(text).toContain('  // My server.');
            expect(text).toContain('"server-port": 25565, // forwarded');
            expect(text).toContain('"motd": "Hi there"');
            expect(text).not.toContain('"generator": "Flat"');
            expect(text).not.toContain('"size"');
            expect(text.indexOf('"worlds":')).toBeLessThan(text.indexOf('"motd":'));
            const written = new Config();
            await written.enable();
            expect(written.getWorlds()).toEqual({
                world: {
                    preset: 'minecraft:flat',
                    seed: '9',
                    dimensions: {
                        'minecraft:overworld': {
                            generator: {
                                type: 'minecraft:flat',
                                settings: {
                                    biome: 'minecraft:plains',
                                    layers: [{ block: 'stone', height: 3 }],
                                    lakes: false,
                                    features: false,
                                    structure_overrides: []
                                }
                            }
                        }
                    }
                }
            });
        });

        it.each(['config.yml', 'config.yaml'])('ignores an existing %s', (name) => {
            const yamlFile = path.join(configDirectory, name);
            writeFileSync(yamlFile, 'port: 25565\n');

            expect(() => new Config()).not.toThrow();
            expect(readFileSync(yamlFile, 'utf8')).toBe('port: 25565\n');
        });

        it('should set the gamemode', () => {
            config.setGamemode(Gametype.CREATIVE);
            expect(config.getGamemode().toLowerCase()).toBe('creative');
        });

        it('changes the default gamemode at once and writes it to the file afterwards', async () => {
            const file = path.join(configDirectory, 'config.json');
            const before = readFileSync(file, 'utf8');

            const written = config.setGamemode(Gametype.CREATIVE, true);

            expect(config.getGamemode()).toBe('Creative');
            expect(readFileSync(file, 'utf8')).toBe(before);

            // A key another setter writes before the queued one runs is kept.
            config.setMotd('Written first', true);
            await written;

            const reopened = new Config();
            await reopened.enable();
            expect(reopened.getGamemode()).toBe('Creative');
            expect(reopened.getMotd()).toBe('Written first');
        });

        it('finishes a queued write before it is disabled', async () => {
            void config.setGamemode(Gametype.ADVENTURE, true);
            await config.disable();

            const reopened = new Config();
            await reopened.enable();
            expect(reopened.getGamemode()).toBe('Adventure');
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
                world: { preset: 'minecraft:normal', provider: 'LevelDB', seed: expect.stringMatching(/^-?\d+$/) }
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

    describe('toPacketCompressionThreshold', () => {
        it("clamps values to Bedrock's unsigned threshold range", () => {
            expect(toPacketCompressionThreshold(-1)).toBe(0);
            expect(toPacketCompressionThreshold(0)).toBe(0);
            expect(toPacketCompressionThreshold(256)).toBe(256);
            expect(toPacketCompressionThreshold(65_535)).toBe(65_535);
            expect(toPacketCompressionThreshold(65_536)).toBe(65_535);
        });

        it('uses the default when the configured threshold is not an integer', () => {
            for (const configured of ['fast', undefined, Number.NaN, 4.5]) {
                expect(toPacketCompressionThreshold(configured)).toBe(256);
            }
        });
    });
});
