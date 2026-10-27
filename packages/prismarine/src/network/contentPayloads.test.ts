import { block_definitions, item_components, item_table } from '@jsprismarine/bedrock-data';
import { BlockPalette, BlockStateModel, vanillaBlockPalette } from '@jsprismarine/blocks';
import { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { blockRuntimeId } from '@jsprismarine/protocol';
import { nbtToPlain, readNetworkNbt, writeNetworkNbt } from '@jsprismarine/wire';
import { describe, expect, it, vi } from 'vitest';

import { definitionOf, definitionsOf } from '../content/ContentOptions';
import { buildServerContent } from '../content/ServerContent';
import { fixtureBlockPalette, fixtureContentOptions, fixtureDefinitions } from '../content/testing';
import CreativeInventory from '../inventory/CreativeInventory';
import { stub } from '../testing/stub.test.helper';
import GameRuleManager from '../world/GameRuleManager';
import { ContentPaletteError } from './contentPalette';
import {
    buildNetworkContentPayloads,
    contentPayloadWarning,
    joinContentPayloads,
    networkContentPayloads
} from './contentPayloads';
import { itemAsStack } from './packet/CreativeContentPacket';
import StartGamePacket from './packet/StartGamePacket';

import type { ContentPayloadReport, NetworkContentPayloads } from './contentPayloads';
import type Server from '../Server';
import type { ContentOptions } from '../content/ContentOptions';
import type { ServerContent } from '../content/ServerContent';
import type { Definition, Definitions } from '@jsprismarine/packs';
import type { BlockProperty } from '@jsprismarine/protocol';

/** The fixture palette doubles as the client's: a client that has exactly these two blocks. */
const client = (): BlockPalette => fixtureBlockPalette();

/** The fixture content, with any registry of it replaced. */
const contentWith = (registries: Partial<Definitions> = {}, overrides: ContentOptions = {}): ServerContent =>
    buildServerContent(
        fixtureContentOptions({
            load: () => ({ definitions: definitionsOf({ ...fixtureDefinitions(), ...registries }), diagnostics: [] }),
            ...overrides
        })
    );

/** One Java recipe registry holding a single recipe. */
const recipesJava = (id: string, data: unknown): ReadonlyMap<string, Definition> =>
    new Map([[id, definitionOf('recipesJava', id, data)]]);

describe('network', () => {
    describe('buildNetworkContentPayloads', () => {
        it('writes one item registry entry per resolved item, in identifier order', () => {
            const { items } = buildNetworkContentPayloads(contentWith(), { clientPalette: client() });

            expect(items.map((entry) => entry.name)).toEqual([
                'minecraft:diamond_pickaxe',
                'minecraft:redstone_lamp',
                'minecraft:stone'
            ]);
            // The numbers are the captured table's, not ones this server chose.
            expect(items.every((entry) => entry.runtimeId !== 0)).toBe(true);
        });

        it('declares no block when the client already has every block the build holds', () => {
            const payloads = buildNetworkContentPayloads(contentWith(), { clientPalette: client() });

            expect(payloads.blockProperties).toEqual([]);
            expect(payloads.report.inventedBlocks).toBe(0);
        });

        it('declares a block this server invented, and nothing the client already has', () => {
            const lamp = {
                format_version: '1.26.20',
                'minecraft:block': {
                    description: { identifier: 'mypack:lamp' },
                    components: { 'minecraft:light_emission': 15 }
                }
            };

            const content = contentWith(
                {
                    blocks: new Map([
                        ...fixtureDefinitions().blocks,
                        ['mypack:lamp', definitionOf('blocks', 'mypack:lamp', lamp)]
                    ])
                },
                {
                    blockPalette: new BlockPalette([
                        ...fixtureBlockPalette().entries.map((entry) => [entry.identifier, entry.model] as const),
                        ['mypack:lamp', new BlockStateModel([])]
                    ])
                }
            );

            const payloads = buildNetworkContentPayloads(content, { clientPalette: client() });

            expect(payloads.blockProperties.map((property) => property.name)).toEqual(['mypack:lamp']);
            expect(payloads.report.inventedBlocks).toBe(1);

            // The definition is network NBT the client reads, so the test
            // reads it the same way rather than pinning bytes wire owns.
            const definition = payloads.blockProperties[0]?.definition;
            const plain = nbtToPlain(readNetworkNbt(definition ?? Buffer.alloc(0)));
            expect(plain).toMatchObject({
                components: { 'minecraft:light_emission': { emission: 'byte:15' } },
                molangVersion: 'int:13'
            });
        });

        it('fills the creative menu from the catalog, dropping what the registry cannot name', () => {
            const { creative, report } = buildNetworkContentPayloads(contentWith(), { clientPalette: client() });

            // The fixture resolves three items, so every other catalog entry
            // has no id to travel under and is reported rather than sent.
            expect(creative.entries.length).toBeGreaterThan(0);
            expect(creative.entries.every((entry) => entry.item.runtimeId !== 0)).toBe(true);
            expect(creative.groups.length).toBeGreaterThan(0);
            expect(report.unknownCreativeItems.length).toBeGreaterThan(0);
        });

        it('gives a block output the hashed runtime id of its default state', () => {
            const content = contentWith({
                recipesJava: recipesJava('minecraft:lamp_from_stone', {
                    type: 'minecraft:crafting_shapeless',
                    ingredients: ['minecraft:stone'],
                    result: { id: 'minecraft:redstone_lamp' }
                })
            });

            const { crafting } = buildNetworkContentPayloads(content, { clientPalette: client() });

            expect(crafting.shapeless).toHaveLength(1);
            expect(crafting.shapeless[0]?.outputs[0]?.blockRuntimeId).toBe(
                blockRuntimeId('minecraft:redstone_lamp', { lit: false })
            );
        });

        it('fills potionMixes from the brewing recipes, as numbers', () => {
            const content = contentWith({
                recipesJava: recipesJava('minecraft:lamp_brewing', {
                    type: 'minecraft:brewing',
                    input: { item: 'minecraft:diamond_pickaxe' },
                    reagent: { item: 'minecraft:stone' },
                    output: { id: 'minecraft:redstone_lamp' }
                })
            });

            const { crafting, items } = buildNetworkContentPayloads(content, { clientPalette: client() });
            const idOf = (name: string) => items.find((entry) => entry.name === name)?.runtimeId;

            expect(crafting.potionMixes).toHaveLength(1);
            expect(crafting.potionMixes[0]?.inputId).toBe(idOf('minecraft:diamond_pickaxe'));
            expect(crafting.potionMixes[0]?.reagentId).toBe(idOf('minecraft:stone'));
            expect(crafting.potionMixes[0]?.outputId).toBe(idOf('minecraft:redstone_lamp'));
        });

        it('refuses to build when the content palette disagrees with the client', () => {
            // A client that is missing a block the server will put in a chunk
            // draws the wrong block rather than complaining, so the build has
            // to stop here.
            const other = new BlockPalette([['minecraft:stone', new BlockStateModel([])]]);

            expect(() => buildNetworkContentPayloads(contentWith(), { clientPalette: other })).toThrow(
                ContentPaletteError
            );
        });

        it('names the block and the disagreement when the palettes differ', () => {
            const other = new BlockPalette([
                ['minecraft:stone', new BlockStateModel([])],
                [
                    'minecraft:redstone_lamp',
                    new BlockStateModel([{ name: 'lit', type: 'int', values: [0, 1, 2], defaultValue: 0 }])
                ]
            ]);

            try {
                buildNetworkContentPayloads(contentWith(), { clientPalette: other });
                expect.unreachable('the lamp has two values on one side and three on the other');
            } catch (error: unknown) {
                if (!(error instanceof ContentPaletteError)) throw error;
                expect(error.disagreements).toHaveLength(1);
                expect(error.disagreements[0]?.block).toBe('minecraft:redstone_lamp');
                expect(error.disagreements[0]?.detail).toContain('carries lit as');
            }
        });
    });

    describe('networkContentPayloads', () => {
        it('builds once per content object', () => {
            const content = contentWith();
            const first = networkContentPayloads(content, { clientPalette: client() });

            expect(networkContentPayloads(content)).toBe(first);
        });
    });

    describe('joinContentPayloads', () => {
        it('has nothing to give when no content was built', () => {
            expect(joinContentPayloads(undefined, new Logger())).toBeUndefined();
        });

        it('writes one line saying what the content sends, and builds once', () => {
            const logger = new Logger();
            const info = vi.spyOn(logger, 'info').mockReturnValue(undefined);
            vi.spyOn(logger, 'warn').mockReturnValue(undefined);
            const content = contentWith();

            const first = joinContentPayloads(content, logger, { clientPalette: client() });

            expect(first).toBeDefined();
            expect(info).toHaveBeenCalledTimes(1);
            expect(info.mock.calls[0]?.[0]).toContain('3§r items');

            expect(joinContentPayloads(content, logger)).toBe(first);
            expect(info).toHaveBeenCalledTimes(1);
        });

        it('falls back rather than throwing when the payloads cannot be built', () => {
            const logger = new Logger();
            vi.spyOn(logger, 'error').mockReturnValue(undefined);
            const warn = vi.spyOn(logger, 'warn').mockReturnValue(undefined);
            const content = contentWith();
            const other = new BlockPalette([['minecraft:stone', new BlockStateModel([])]]);

            expect(joinContentPayloads(content, logger, { clientPalette: other })).toBeUndefined();
            expect(warn.mock.calls[0]?.[0]).toContain('the captured ones go out instead');

            // The second call answers from the record of the failure, so a
            // join does not pay for a build that already threw.
            expect(joinContentPayloads(content, logger, { clientPalette: other })).toBeUndefined();
            expect(warn).toHaveBeenCalledTimes(1);
        });
    });

    describe('contentPayloadWarning', () => {
        const nothingInvented = {
            inventedBlocks: 0,
            allocatedItemIds: [],
            untranslatedComponents: [],
            unknownCreativeItems: [],
            omittedRecipes: 0,
            widenedIngredients: 0,
            smithingTrimRecipes: 0,
            furnaceRecipes: 0
        } satisfies ContentPayloadReport;

        it('says nothing about a build that said everything exactly', () => {
            expect(contentPayloadWarning(nothingInvented)).toBeUndefined();
        });

        it('names only what the build had to invent', () => {
            const warning = contentPayloadWarning({
                ...nothingInvented,
                inventedBlocks: 2,
                allocatedItemIds: ['mypack:wand']
            });

            expect(warning).toContain('invented §e2§r blocks');
            expect(warning).toContain('gave §e1§r items an id of its own');
            expect(warning).not.toContain('cooking');
        });
    });
});

/**
 * A `StartGamePacket` whose only variable is `Block Properties`, encoded.
 *
 * Everything else is a fixed value, so two buffers that differ differ in the
 * block definitions.
 */
const startGame = (blockProperties: readonly BlockProperty[] | null): Buffer => {
    const packet = new StartGamePacket();
    packet.entityId = 1n;
    packet.runtimeEntityId = 1n;
    packet.gamemode = 1;
    packet.seed = 0n;
    packet.worldSpawnPos = new Vector3(0, 64, 0);
    packet.levelId = 'level';
    packet.worldName = 'world';
    packet.serverIdentifier = 'JSPrismarine';
    packet.scenarioIdentifier = 'JSPrismarine';
    packet.worldIdentifier = 'world';
    packet.gameRules = new GameRuleManager(stub<Server>());
    packet.blockProperties = blockProperties;
    packet.encode();

    return packet.getBuffer();
};

/**
 * The real build, against Mojang's fetched packs.
 *
 * Gated the way the content tests are: it needs the caches
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` populates, so
 * CI runs the fixture tests above and this one runs on demand.
 *
 * ```sh
 * JSP_CONTENT_VANILLA=1 pnpm --filter @jsprismarine/prismarine exec vitest run src/network/contentPayloads
 * ```
 */
describe.skipIf(!process.env.JSP_CONTENT_VANILLA)('the payloads the vanilla pack stack produces', () => {
    /** Built once: the pack stack takes seconds and every test here reads the same build. */
    let built: NetworkContentPayloads | undefined;
    const vanilla = (): NetworkContentPayloads => (built ??= buildNetworkContentPayloads(buildServerContent({})));

    it('sends every registry the client builds its world from', () => {
        const payloads = vanilla();

        // The 98 data-driven vanilla blocks a Bedrock Dedicated Server
        // 1.26.51.1 declared, and nothing this server invented.
        expect(payloads.blockProperties).toHaveLength(98);
        expect(payloads.report.inventedBlocks).toBe(0);

        expect(payloads.items).toHaveLength(1613);
        expect(payloads.creative.groups).toHaveLength(124);
        expect(payloads.creative.entries).toHaveLength(1980);
        expect(payloads.report.unknownCreativeItems).toEqual([]);

        expect(payloads.crafting.shaped).toHaveLength(827);
        expect(payloads.crafting.shapeless).toHaveLength(726);
        expect(payloads.crafting.smithingTransform).toHaveLength(12);
        // Java's 279 brewing recipes, which had no way onto the wire before.
        expect(payloads.crafting.potionMixes).toHaveLength(279);
    }, 180_000);

    it('declares the captured block definitions, byte for byte', () => {
        const declared = vanilla().blockProperties;

        expect(declared.map((entry) => entry.name)).toEqual(block_definitions.map((entry) => entry.name));

        const captured = new Map(block_definitions.map((entry) => [entry.name, entry.definition]));
        const differing = declared.filter((entry) => !entry.definition.equals(captured.get(entry.name)!));

        console.debug(`block definitions: ${declared.length - differing.length}/${declared.length} byte identical`);
        expect(differing.map((entry) => entry.name)).toEqual([]);
    }, 180_000);

    /**
     * The seven items Mojang's own behavior pack still files under the names
     * Bedrock used before it flattened them.
     *
     * A Bedrock Dedicated Server resolves each to its modern name before it
     * writes the table, so the capture has `minecraft:cod` where the pack has
     * `minecraft:fish`. This build takes the pack's identifier at face value
     * and gives it an id of its own. Every one of the seven modern names is
     * also in the registry, from Java's side of the item set, so the cost is
     * seven entries the client cannot draw rather than seven items a player
     * cannot be handed.
     */
    const LEGACY_PACK_ITEMS = [
        'minecraft:appleEnchanted',
        'minecraft:clownfish',
        'minecraft:cooked_fish',
        'minecraft:fish',
        'minecraft:melon',
        'minecraft:muttonCooked',
        'minecraft:muttonRaw'
    ];

    it('gives every item the number, flag and version the capture gives it', () => {
        const items = vanilla().items;
        const captured = new Map(Object.entries(item_table));

        const unnamed: string[] = [];
        const disagreements = items.flatMap((entry) => {
            const row = captured.get(entry.name);
            if (row === undefined) {
                unnamed.push(entry.name);
                return [];
            }
            if (row.runtime_id !== entry.runtimeId) {
                return [`${entry.name}: id ${entry.runtimeId}, captured ${row.runtime_id}`];
            }
            if (row.component_based !== entry.componentBased) return [`${entry.name}: component flag differs`];
            if (row.version !== entry.version)
                return [`${entry.name}: version ${entry.version}, captured ${row.version}`];

            return [];
        });

        console.debug(
            `item table: ${items.length - unnamed.length}/${items.length} sent items are in the capture of ` +
                `${captured.size}, ${disagreements.length} disagree`
        );

        expect(disagreements).toEqual([]);
        expect(unnamed.sort()).toEqual(LEGACY_PACK_ITEMS);
        expect(vanilla().report.allocatedItemIds.toSorted()).toEqual(LEGACY_PACK_ITEMS);
    }, 180_000);

    it('leaves out only block names and the variants Bedrock flattened away', () => {
        const sent = new Set(vanilla().items.map((entry) => entry.name));
        const palette = vanillaBlockPalette();
        const missing = Object.keys(item_table).filter((name) => !sent.has(name));
        const blocks = missing.filter((name) => palette.entry(name) !== undefined);

        // The rest are the pre-flattening aggregates a modern client no
        // longer hands a player (`minecraft:wool`, `minecraft:log`, the
        // `minecraft:item.*` block forms) and Education Edition's items.
        console.debug(`item table: ${missing.length} captured names left out, ${blocks.length} of them blocks`);

        for (const name of ['minecraft:white_wool', 'minecraft:oak_log', 'minecraft:oak_planks', 'minecraft:cod'])
            expect(sent.has(name)).toBe(true);

        expect(missing.length - blocks.length).toBeLessThan(100);
    }, 180_000);

    it('reports how far the item component compounds are from the capture', () => {
        const shared = vanilla().items.filter((entry) => item_components[entry.name] !== undefined);
        const withCompound = shared.filter((entry) => entry.componentData !== undefined);
        const identical = withCompound.filter((entry) =>
            writeNetworkNbt(entry.componentData!).equals(item_components[entry.name]!)
        );

        // None are expected to match. Java's components decide this build's
        // compound and Mojang's own tables decide the capture's, the capture
        // writes `minecraft:food` alone for the 47 foods it does not mark
        // component based, and `minecraft:icon` is a resource pack fact this
        // build leaves empty. `@jsprismarine/wire` measures the gap field by
        // field; this records the whole-compound number so a change to the
        // projection shows up as a change to it.
        console.debug(
            `item components: a compound for ${withCompound.length} of the ${shared.length} captured items, ` +
                `${identical.length} of them byte identical`
        );

        expect(shared).not.toHaveLength(0);
    }, 180_000);

    it('writes the creative menu the captured catalog describes, entry for entry', () => {
        // The menu a pick is read against, so the order and the length are
        // the whole of the agreement: an entry at a different position hands
        // a player an item they did not click.
        const theirs = new CreativeInventory().getEntries();
        const ours = vanilla().creative.entries;

        expect(ours).toHaveLength(theirs.length);

        const disagreements = ours.flatMap((entry, index) => {
            const captured = itemAsStack(theirs[index]!.item);
            if (captured.runtimeId !== entry.item.runtimeId) return [`${index}: id ${entry.item.runtimeId}`];
            if (captured.meta !== entry.item.meta) return [`${index}: meta ${entry.item.meta}`];
            if (captured.blockRuntimeId !== entry.item.blockRuntimeId) return [`${index}: block id`];
            if (theirs[index]!.group !== entry.group) return [`${index}: group ${entry.group}`];

            return [];
        });

        // The user data blob is left out on purpose: the captured path drops
        // the catalog's NBT and this one carries it, which is the one place
        // the content build sends more than the path it replaces.
        // `userData` is optional on the wire structure and `ItemStack` defaults it to an empty
        // blob, so an absent one and an empty one are the same thing to compare against.
        const EMPTY_USER_DATA = Buffer.alloc(0);
        const withNbt = ours.filter(
            (entry, index) =>
                !(entry.item.userData ?? EMPTY_USER_DATA).equals(
                    itemAsStack(theirs[index]!.item).userData ?? EMPTY_USER_DATA
                )
        );
        console.debug(
            `creative entries: ${ours.length}, ${disagreements.length} disagree, ${withNbt.length} gained NBT`
        );

        expect(disagreements).toEqual([]);
    }, 180_000);

    it('writes the same StartGamePacket the captured path writes', () => {
        // Same packet twice, once told what the registries declared and once
        // left to the captured definitions, so a difference is the block
        // properties and nothing else.
        const fromContent = startGame(vanilla().blockProperties);
        const fromCapture = startGame(null);

        expect(fromContent.equals(fromCapture)).toBe(true);
    }, 180_000);
});
