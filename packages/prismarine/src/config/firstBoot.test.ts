import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readContentSettings } from '../content/settings';
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
        'port',
        'server-ip',
        'level-name',
        'worlds',
        'max-players',
        'gamemode',
        'difficulty',
        'motd',
        'view-distance',
        'preload-radius',
        'chunk-send-budget-ms',
        'proximity-broadcast',
        'server-authoritative-block-breaking',
        'entity-tracking-hysteresis',
        'entity-tracking-interval',
        'online-mode',
        'packet-compression-level',
        'enable-query',
        'enable-process-title',
        'enable-ticking',
        'log-excluded-packets',
        'crafting-recipe-limit',
        'content-strict',
        'content-world-packs',
        'content-datapacks'
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

    it.each(['config.yml', 'config.yaml'])('ignores an existing %s beside config.json', async (name) => {
        await boot();
        const yamlFile = path.join(root, name);
        writeFileSync(yamlFile, 'content-strict: true\n');

        expect(() => new Config()).not.toThrow();
        expect(readContentSettings()).toEqual({ strict: false, worldPacks: [], datapacks: [] });
        expect(readFileSync(yamlFile, 'utf8')).toBe('content-strict: true\n');
    });
});
