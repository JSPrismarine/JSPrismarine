import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { LootGrammarError } from '@jsprismarine/loot';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { lootBuildReport, lootSummary, lootWarning } from './lootReport';
import { buildServerContent } from './ServerContent';
import { readContentSettings } from './settings';
import { fixtureBlockPalette } from './testing';

/**
 * `content-strict` reaching the loot registries, from the key in `config.json`
 * to the refusal.
 *
 * The registries took a `strict` option and nothing passed it, and nothing
 * called `validate()` either, so a table was only compiled when something
 * rolled it. Both halves matter: without the option strict loot never refuses,
 * and without the compile it refuses at whichever chest a player opens first,
 * which is not a startup failure at all.
 */

const temporaryDirs: string[] = [];
afterAll(() => {
    for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** A directory holding a `config.json` with the given keys, for `readContentSettings` to find. */
const configuredWith = (settings: Record<string, unknown>): string => {
    const root = mkdtempSync(join(tmpdir(), 'jsp-loot-strict-'));
    temporaryDirs.push(root);
    writeFileSync(join(root, 'config.json'), `${JSON.stringify(settings, null, 4)}\n`);
    return root;
};

/** A datapack on disk, so the table goes through the real loader. */
const datapackWith = (files: Readonly<Record<string, unknown>>): string => {
    const root = mkdtempSync(join(tmpdir(), 'jsp-loot-pack-'));
    temporaryDirs.push(root);
    writeFileSync(join(root, 'pack.mcmeta'), JSON.stringify({ pack: { min_format: 121, max_format: 121 } }));
    for (const [path, data] of Object.entries(files)) {
        const absolute = join(root, ...path.split('/'));
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, JSON.stringify(data));
    }
    return root;
};

/** A table whose pool states no `rolls`, which the Java grammar reports and cannot guess. */
const UNREADABLE = {
    'data/fixture/loot_table/broken.json': {
        pools: [{ entries: [{ type: 'minecraft:item', name: 'minecraft:diamond' }] }]
    }
};

/** A content build over one datapack, strict or not according to the config in `configRoot`. */
const buildWithConfig = (configRoot: string, pack: string) => {
    vi.stubEnv('JSP_DIR', configRoot);
    try {
        return buildServerContent({
            stack: [{ kind: 'datapack', path: pack }],
            strict: readContentSettings().strict,
            blockPalette: fixtureBlockPalette(),
            itemDefinitions: []
        });
    } finally {
        vi.unstubAllEnvs();
    }
};

describe('content-strict reaching the loot registries', () => {
    it('refuses a table the grammar cannot read, with the key set in config.json', () => {
        const config = configuredWith({ 'content-strict': true });

        vi.stubEnv('JSP_DIR', config);
        expect(readContentSettings().strict).toBe(true);
        vi.unstubAllEnvs();

        expect(() => buildWithConfig(config, datapackWith(UNREADABLE))).toThrow(LootGrammarError);
    });

    it('loads short without the key, and names the table in the content report', () => {
        const content = buildWithConfig(configuredWith({ 'content-strict': false }), datapackWith(UNREADABLE));

        expect(content.diagnostics.filter((entry) => entry.code === 'loot.invalid')).toEqual([
            expect.objectContaining({
                severity: 'error',
                code: 'loot.invalid',
                path: 'data/fixture/loot_table/broken.json',
                message: 'fixture:broken.pools[0]: a loot pool needs rolls'
            })
        ]);
    });

    it('reports what compiled and what went unapplied, so the gap is drained rather than kept', () => {
        const content = buildWithConfig(
            configuredWith({ 'content-strict': false }),
            datapackWith({
                'data/fixture/loot_table/fine.json': {
                    pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:diamond' }] }]
                }
            })
        );

        const report = lootBuildReport(content);

        expect(report).toEqual({ javaTables: 1, bedrockTables: 0, cycles: 0, unreviewed: 0, reviewed: 0 });
        expect(lootSummary(report)).toContain('§e1§r java loot tables');
        // A build with nothing to say says nothing, the way the join payload
        // report does.
        expect(lootWarning(report)).toBeUndefined();
    });

    it('states each kind of gap it has, and only the kinds it has', () => {
        expect(lootWarning({ javaTables: 2, bedrockTables: 1, cycles: 0, unreviewed: 0, reviewed: 7 })).toBe(
            'The loot tables leave §e7§r reviewed gaps unapplied; see the content report'
        );
        expect(lootWarning({ javaTables: 2, bedrockTables: 1, cycles: 3, unreviewed: 4, reviewed: 7 })).toBe(
            'The loot tables carry §c4§r members nobody has reviewed, hold §c3§r reference cycles, ' +
                'leave §e7§r reviewed gaps unapplied; see the content report'
        );
    });
});
