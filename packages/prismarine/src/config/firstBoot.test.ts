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
 * Three bugs lived here at once. The content settings wrote a `config.yaml` of
 * their own beside `config.json`; the watch-mode host read them before the
 * child's `Config` existed, so that `config.yaml` was then mistaken for a
 * legacy config and converted, which put `content-strict` and friends at the
 * top of `config.json`; and `$schema` was appended wherever the write
 * happened to land rather than kept first.
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

    it.each(['config.yml', 'config.yaml'])('refuses to start over a %s, naming the file and the way out', (name) => {
        writeFileSync(path.join(root, name), 'port: 25565\n');

        expect(() => new Config()).toThrow(/no longer supports YAML/);
        expect(() => new Config()).toThrow(name);
        expect(() => new Config()).toThrow(/config\.json/);
        // The file is the person's config; refusing must not touch it.
        expect(readFileSync(path.join(root, name), 'utf8')).toBe('port: 25565\n');
    });

    it('refuses even when a config.json already exists, so the YAML is not silently ignored', async () => {
        await boot();
        writeFileSync(path.join(root, 'config.yaml'), 'content-strict: true\n');

        expect(() => new Config()).toThrow(/no longer supports YAML/);
        expect(() => readContentSettings()).toThrow(/no longer supports YAML/);
    });
});
