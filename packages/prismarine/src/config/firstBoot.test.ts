import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readContentSettings } from '../content/settings';
import { DEFAULT_PROTOCOL_SETTINGS } from '../network/codec/ProtocolPolicy';
import { Config } from './Config';

/**
 * What the generated config file looks like after a boot, regardless of which
 * process touched it first.
 *
 * `Config` and content settings share `config.json`, even when the watch-mode
 * host reads content settings first. `$schema` stays first and the keys follow
 * their definition order.
 */
describe('the config file a boot generates', () => {
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(path.join(tmpdir(), 'jsprismarine-first-boot-'));
        vi.stubEnv('JSP_DIR', root);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        rmSync(root, { recursive: true, force: true });
    });

    const configFile = () => path.join(root, 'config.json');

    /** The top-level keys of the file, in the order the file spells them. */
    const keysInFileOrder = (): string[] =>
        [...readFileSync(configFile(), 'utf8').matchAll(/^ {4}"([^"]+)":/gm)].map(([, key]) => key ?? '');

    /** How the keys are defined in code: `Config` first, then the content settings. */
    const DEFINITION_ORDER = [
        '$schema',
        'log-level',
        'server-port',
        'server-portv6',
        'server-ip',
        'level-name',
        'worlds',
        'max-players',
        'gamemode',
        'difficulty',
        'motd',
        'view-distance',
        'preload-radius',
        'chunk-workers',
        'chunk-host',
        'terrain-cache-size-mb',
        'chunk-send-budget-ms',
        'proximity-broadcast',
        'server-authoritative-block-breaking',
        'fluid-replacement',
        'entity-tracking-hysteresis',
        'entity-tracking-interval',
        'protocol-window',
        'protocol-content',
        'online-mode',
        'enable-raknet',
        'use-raknet-worker',
        'enable-nethernet',
        'enable-server-public-ip-lookup',
        'enable-lan-visibility',
        'packet-compression-level',
        'packet-compression-algorithm',
        'packet-compression-threshold',
        'packet-full-flush-fragments',
        'enable-query',
        'enable-process-title',
        'enable-ticking',
        'log-excluded-packets',
        'crafting-recipe-limit',
        'stats',
        'content-strict',
        'content-world-packs',
        'content-datapacks',
        'content-java-version'
    ];

    /** One boot, in the order the server performs it. */
    const boot = async (): Promise<Config> => {
        const config = new Config();
        await config.enable();
        readContentSettings();
        return config;
    };

    it('writes one config.json, $schema first and every key in definition order', async () => {
        await boot();

        expect(existsSync(configFile())).toBe(true);
        expect(existsSync(path.join(root, 'config.yaml'))).toBe(false);
        expect(existsSync(path.join(root, 'config.yml'))).toBe(false);
        expect(keysInFileOrder()).toEqual(DEFINITION_ORDER);
    });

    it('keeps definition order even when the content settings are read first, as the watch host does', async () => {
        readContentSettings();
        await boot();

        expect(existsSync(path.join(root, 'config.yaml'))).toBe(false);
        expect(keysInFileOrder()).toEqual(DEFINITION_ORDER);
    });

    it('reads the file back on a second boot without rewriting or reordering it', async () => {
        await boot();
        const firstBoot = readFileSync(configFile(), 'utf8');

        await boot();

        expect(readFileSync(configFile(), 'utf8')).toBe(firstBoot);
    });

    it('reads content-java-version as the release to run, and an empty one as the default release', async () => {
        await boot();
        expect(readContentSettings().javaVersion).toBeUndefined();

        const file = readFileSync(configFile(), 'utf8');
        expect(file).toContain('"content-java-version": ""');
        writeFileSync(
            configFile(),
            file.replace('"content-java-version": ""', '"content-java-version": " 26.4-snapshot-8 "')
        );
        expect(readContentSettings().javaVersion).toBe('26.4-snapshot-8');
    });

    it.each(['config.yml', 'config.yaml'])('ignores an existing %s beside config.json', async (name) => {
        await boot();
        const yamlFile = path.join(root, name);
        writeFileSync(yamlFile, 'content-strict: true\n');

        expect(() => new Config()).not.toThrow();
        expect(readContentSettings()).toEqual({
            strict: false,
            worldPacks: [],
            datapacks: [],
            protocols: DEFAULT_PROTOCOL_SETTINGS
        });
        expect(readFileSync(yamlFile, 'utf8')).toBe('content-strict: true\n');
    });
});
