import type { Diagnostic, FilterContext, FilterEntityView } from '@jsprismarine/entities';
import { parseLenientJson, readBrarchive } from '@jsprismarine/packs';
import { seededRandom } from '@jsprismarine/predicates';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { reportProgress } from '../../../.test/reportProgress';

import { Merchant } from './economy';
import type { TradeEnchanting } from './functions';
import { VANILLA_TRADE_FUNCTIONS } from './functions';
import { generateOffers } from './offers';
import type { TradeTable } from './tables';
import { parseTradeTable } from './tables';

/**
 * Runs the package over the real vanilla trade tables.
 *
 * It needs the bedrock-samples checkout, and optionally the Bedrock Dedicated
 * Server zip, that `pnpm --filter @jsprismarine/bedrock-data run
 * fetch:sources` caches, so it only runs with JSP_VANILLA_TRADE_TABLES set.
 *
 * The samples and server releases differ in content, so each pack is checked
 * for parse diagnostics and the functions its tables actually use.
 *
 * The two librarian tables carry `//` comments and trailing commas, so the
 * lenient JSON parser is what reads them. Extracted game files are untrusted
 * input and nothing here executes them.
 */

const enabled = !!process.env.JSP_VANILLA_TRADE_TABLES;

const cacheRoot = join(import.meta.dirname, '..', '..', '..', 'node_modules', '.cache', 'jsprismarine');

const decoder = new TextDecoder();

const TRADE_FOLDERS = ['trading', join('trading', 'economy_trades')] as const;

/** The behavior pack folder of a bedrock-samples checkout. */
const bedrockSamplesPack = (): string | undefined => {
    const root = join(cacheRoot, 'bedrock-samples');
    if (!existsSync(root)) return undefined;
    for (const tag of readdirSync(root)) {
        const unpacked = join(root, tag, 'unpacked');
        if (!existsSync(unpacked)) continue;
        for (const checkout of readdirSync(unpacked)) {
            const pack = join(unpacked, checkout, 'behavior_pack');
            if (existsSync(join(pack, 'trading'))) return pack;
        }
    }
    return undefined;
};

/** The `vanilla` layer of an unpacked BDS, which is the only layer holding trade tables. */
const bedrockServerPack = (): string | undefined => {
    const root = join(cacheRoot, 'bds');
    if (!existsSync(root)) return undefined;
    for (const version of readdirSync(root)) {
        const pack = join(root, version, 'unpacked', 'behavior_packs', 'vanilla');
        if (existsSync(join(pack, '__brarchive', 'trading.brarchive'))) return pack;
    }
    return undefined;
};

/**
 * Every trade table of one pack, keyed by its folder and name.
 *
 * Both brarchives name their members by basename alone, so the legacy
 * `armorer_trades.json` and the economy one collide without the folder.
 */
const tradeFilesIn = (root: string): ReadonlyMap<string, string> => {
    const files = new Map<string, string>();

    for (const folder of TRADE_FOLDERS) {
        const archive = join(root, '__brarchive', `${folder}.brarchive`);
        if (!existsSync(archive)) continue;
        for (const [member, bytes] of readBrarchive(readFileSync(archive)))
            files.set(join(folder, basename(member)), decoder.decode(bytes));
    }

    for (const folder of TRADE_FOLDERS) {
        const path = join(root, folder);
        if (!existsSync(path)) continue;
        for (const name of readdirSync(path)) {
            const file = join(path, name);
            if (!name.endsWith('.json') || !statSync(file).isFile()) continue;
            files.set(join(folder, name), readFileSync(file, 'utf8'));
        }
    }

    return files;
};

/** Every function name the parsed tables carry. */
const functionsIn = (tables: Iterable<TradeTable>): ReadonlySet<string> => {
    const names = new Set<string>();
    for (const table of tables)
        for (const tier of table.tiers)
            for (const group of tier.groups)
                for (const trade of group.trades)
                    for (const slot of [...trade.wants, ...trade.gives])
                        for (const item of slot.choices) for (const fn of item.functions) names.add(fn.name);
    return names;
};

/** A trader variant the cartographer and fisherman filters read, in the overworld. */
const traderContext = (markVariant: number): FilterContext => ({
    self: { measure: (name) => (name === 'is_mark_variant' ? markVariant : undefined) } satisfies FilterEntityView,
    world: { dimension: () => 'minecraft:overworld' }
});

/** A stub enchanter, so the two enchanting functions have their seam. */
const enchanting: TradeEnchanting = {
    enchantWithLevels: (_item, levels) => new Map([['minecraft:enchantments', [{ id: 'test', level: levels }]]]),
    enchantBookForTrading: () => ({ level: 3, components: new Map([['minecraft:enchantments', 'test']]) })
};

/** Parses one pack's tables, resolving a binary file to the samples copy of the same name. */
const parsePack = (
    files: ReadonlyMap<string, string>,
    fallback: ReadonlyMap<string, string>,
    report: (diagnostic: Diagnostic) => void
): { readonly tables: ReadonlyMap<string, TradeTable>; readonly binary: number } => {
    const tables = new Map<string, TradeTable>();
    let binary = 0;

    for (const [name, raw] of files) {
        let text = raw;
        if (text.startsWith('\u007fMCB')) {
            binary += 1;
            const replacement = fallback.get(name);
            if (replacement === undefined) continue;
            text = replacement;
        }
        const table = parseTradeTable(parseLenientJson(text), { pack: 'vanilla', path: name, report });
        if (table !== undefined) tables.set(name, table);
    }

    return { tables, binary };
};

const samplesPack = bedrockSamplesPack();

describe.runIf(enabled && samplesPack !== undefined)(
    'the vanilla trade tables of bedrock-samples',
    { tags: ['real-data'] },
    () => {
        let files: ReadonlyMap<string, string> = new Map();
        let diagnostics: Diagnostic[] = [];
        let tables: ReadonlyMap<string, TradeTable> = new Map();

        beforeAll(() => {
            files = tradeFilesIn(samplesPack!);
            diagnostics = [];
            tables = parsePack(files, files, (diagnostic) => diagnostics.push(diagnostic)).tables;
        });

        it('reads the trade files in the pack', () => {
            expect(files.size).toBeGreaterThan(0);
            expect([...files.keys()].filter((name) => !tables.has(name))).toEqual([]);
            reportProgress(`Parsed ${tables.size} trade tables from ${files.size} files in bedrock-samples.`);
        });

        it('parses every file with no diagnostic at all', () => {
            expect(diagnostics).toEqual([]);
        });

        it('recognizes economy and legacy trade tables', () => {
            const economy = [...tables.keys()].filter((name) => name.includes('economy_trades'));
            const legacy = [...tables.keys()].filter((name) => !name.includes('economy_trades'));

            expect(economy.length).toBeGreaterThan(0);
            expect(legacy.length).toBeGreaterThan(0);
            expect(economy.length + legacy.length).toBe(tables.size);
            reportProgress(`Trade table types: ${economy.length} economy and ${legacy.length} legacy.`);
        });

        it('counts the tiers, groups and trades', () => {
            let tiers = 0;
            let groups = 0;
            let trades = 0;
            for (const table of tables.values()) {
                tiers += table.tiers.length;
                for (const tier of table.tiers) {
                    groups += tier.groups.length;
                    for (const group of tier.groups) trades += group.trades.length;
                }
            }

            reportProgress(`Parsed trade tables contain ${tiers} tiers, ${groups} groups, and ${trades} trades.`);
        });

        it('implements every trade item function the tables use', () => {
            const used = functionsIn(tables.values());

            reportProgress(`Trade tables use ${used.size} item functions: ${[...used].sort().join(', ')}.`);
            for (const name of used) expect(VANILLA_TRADE_FUNCTIONS.has(name)).toBe(true);
        });

        it('generates offers for every table, reporting only the trades a variant rules out', () => {
            const codes = new Set<string>();
            let offers = 0;

            for (const table of tables.values()) {
                const generated = generateOffers({
                    table,
                    random: seededRandom(7),
                    traderExp: 1000,
                    context: { filters: traderContext(3) },
                    enchanting,
                    report: (code) => codes.add(code)
                });
                offers += generated.length;
                for (const offer of generated) {
                    expect(offer.wants.length).toBeGreaterThan(0);
                    expect(offer.gives.length).toBeGreaterThan(0);
                    for (const stack of [...offer.wants, ...offer.gives]) expect(stack.count).toBeGreaterThan(0);
                }
            }

            // The cartographer's biome maps are gated on the trader's mark
            // variant, so a trader of one variant drops the trades of the others.
            expect([...codes]).toEqual(['trading.noChoiceSurvived']);
            expect(offers).toBeGreaterThan(100);
        });

        it('repeats the offers of one trader for one seed', () => {
            const table = [...tables.values()][0]!;
            const run = () =>
                generateOffers({
                    table,
                    random: seededRandom(3),
                    traderExp: 1000,
                    context: { filters: traderContext(1) },
                    enchanting
                });

            expect(run()).toEqual(run());
        });

        it('runs a full session against every table', () => {
            for (const table of tables.values()) {
                const merchant = new Merchant({
                    table,
                    random: seededRandom(11),
                    context: { filters: traderContext(1) },
                    enchanting
                });

                for (let round = 0; round < 40; round += 1) {
                    for (let index = 0; index < merchant.offers().length; index += 1) merchant.trade(index);
                    merchant.resupply();
                }

                expect(merchant.experience).toBeGreaterThan(0);
                for (const offer of merchant.offers()) expect(offer.wants[0]?.count).toBeGreaterThanOrEqual(1);
            }
        });
    }
);

const serverPack = bedrockServerPack();

const serverTradeTablesEnabled = enabled && serverPack !== undefined && samplesPack !== undefined;

describe.runIf(serverTradeTablesEnabled)(
    'the vanilla trade tables of the Bedrock Dedicated Server',
    { tags: ['real-data'] },
    () => {
        let files: ReadonlyMap<string, string> = new Map();
        let diagnostics: Diagnostic[] = [];
        let tables: ReadonlyMap<string, TradeTable> = new Map();
        let binary = 0;

        beforeAll(() => {
            files = tradeFilesIn(serverPack!);
            diagnostics = [];
            const result = parsePack(files, tradeFilesIn(samplesPack!), (diagnostic) => diagnostics.push(diagnostic));
            tables = result.tables;
            binary = result.binary;
        });

        it('reads the server trade files, using samples text for binary tables', () => {
            expect(files.size).toBeGreaterThan(0);
            expect([...files.keys()].filter((name) => !tables.has(name))).toEqual([]);
            reportProgress(
                `Parsed ${tables.size} Bedrock Dedicated Server trade tables from ${files.size} files; ${binary} were binary.`
            );
        });

        it('parses every file with no diagnostic at all', () => {
            expect(diagnostics).toEqual([]);
        });

        it('implements every function the 1.26.51.1 tables use', () => {
            const used = functionsIn(tables.values());

            // 1.26.51.1 moved the coral trades from `random_aux_value` to
            // `random_block_state`, which 1.26.50.4 does not write.
            expect(used.has('random_block_state')).toBe(true);
            for (const name of used) expect(VANILLA_TRADE_FUNCTIONS.has(name)).toBe(true);
        });

        it('generates offers for every table, reporting only the trades a variant rules out', () => {
            const codes = new Set<string>();
            for (const table of tables.values()) {
                generateOffers({
                    table,
                    random: seededRandom(21),
                    traderExp: 1000,
                    context: { filters: traderContext(2) },
                    enchanting,
                    report: (code) => codes.add(code)
                });
            }

            expect([...codes].filter((code) => code !== 'trading.noChoiceSurvived')).toEqual([]);
        });
    }
);
