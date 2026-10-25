import { describe, expect, it } from 'vitest';

import { buildServerContent } from '../content/ServerContent';
import { definitionOf, definitionsOf } from '../content/ContentOptions';
import type { ServerContent } from '../content/ServerContent';
import { fixtureBlockPalette, fixtureItemDefinitions } from '../content/testing';
import type Player from '../Player';
import type Server from '../Server';
import type PlayerSession from '../network/PlayerSession';
import type { World } from '../world/World';
import { AttributeIds, Attributes } from '../entity/Attribute';
import { Item } from '../item/Item';
import type DataPacket from '../network/packet/DataPacket';
import PlayerEnchantOptionsPacket, { EnchantType } from '../network/packet/PlayerEnchantOptionsPacket';
import { stub } from '../testing/stub.test.helper';
import { bookshelfPowerAround } from './bookshelves';
import {
    enchantingRows,
    enchantOptionsOf,
    enchantmentSeedOf,
    rerollEnchantmentSeed,
    showEnchantingTable,
    takeEnchantingRow
} from './enchantingTable';
import { anvilPreview, takeFromAnvil } from './anvil';

/**
 * The enchanting table and the anvil, reachable at last.
 *
 * Both rules live in `@jsprismarine/enchantments` and are checked there
 * against values a Java program produced from the real `java.util.Random`.
 * What is checked here is the server's half: that a seed produces stable rows,
 * that taking one charges the player and lands the enchantment on the stack,
 * that the rows reach the client as a packet it can draw, and that the anvil
 * merges two of the same item the way vanilla does.
 *
 * The enchantment bodies are copied verbatim from Java 26.3's
 * `data/minecraft/enchantment/`.
 */

const MINING = {
    anvil_cost: 1,
    description: { translate: 'enchantment' },
    slots: ['mainhand'],
    supported_items: '#minecraft:enchantable/mining',
    primary_items: '#minecraft:enchantable/mining',
    weight: 10
};

const enchantmentDefinitions = () =>
    new Map([
        [
            'minecraft:efficiency',
            definitionOf('enchantments', 'minecraft:efficiency', {
                ...MINING,
                max_level: 5,
                max_cost: { base: 51, per_level_above_first: 10 },
                min_cost: { base: 1, per_level_above_first: 10 },
                effects: {
                    'minecraft:attributes': [
                        {
                            amount: { type: 'minecraft:levels_squared', added: 1.0 },
                            attribute: 'minecraft:mining_efficiency',
                            id: 'minecraft:enchantment.efficiency',
                            operation: 'add_value'
                        }
                    ]
                }
            })
        ],
        [
            'minecraft:unbreaking',
            definitionOf('enchantments', 'minecraft:unbreaking', {
                ...MINING,
                anvil_cost: 2,
                max_level: 3,
                max_cost: { base: 56, per_level_above_first: 8 },
                min_cost: { base: 5, per_level_above_first: 8 },
                weight: 5,
                effects: {}
            })
        ]
    ]);

const tagDefinitions = () =>
    new Map([
        [
            'item/minecraft:enchantable/mining',
            definitionOf('tags', 'item/minecraft:enchantable/mining', { values: ['minecraft:diamond_pickaxe'] })
        ],
        [
            'enchantment/minecraft:in_enchanting_table',
            definitionOf('tags', 'enchantment/minecraft:in_enchanting_table', {
                values: ['minecraft:efficiency', 'minecraft:unbreaking']
            })
        ]
    ]);

const content = (): ServerContent =>
    buildServerContent({
        load: () => ({
            definitions: definitionsOf({ enchantments: enchantmentDefinitions(), tags: tagDefinitions() }),
            diagnostics: []
        }),
        blockPalette: fixtureBlockPalette(),
        itemDefinitions: fixtureItemDefinitions()
    });

/** A world that is nothing but air and whatever blocks the test names. */
const worldOf = (blocks: ReadonlyMap<string, string> = new Map()) =>
    stub<World>({
        getBlockState: async (x: number, y: number, z: number) =>
            ({ name: blocks.get(`${x},${y},${z}`) ?? 'minecraft:air' }) as never,
        getPlayers: () => []
    });

const scene = (built: ServerContent, world = worldOf()) => {
    const sent: DataPacket[] = [];
    const attributes = new Attributes(Attributes.getPlayerDefaults());

    const player: Player = stub<Player>({
        getType: () => 'minecraft:player',
        getName: () => 'tester',
        getServer: () => stub<Server>({ getContent: () => built }),
        getWorld: () => world,
        getPosition: () => ({ getX: () => 0, getY: () => 64, getZ: () => 0 }) as never,
        getEquipment: () => ({}),
        attributes,
        // What `advancementSubject` reads when the enchant raises
        // `enchanted_item`.
        metadata: { sprinting: false } as never,
        gamemode: 0,
        isSneaking: () => false,
        isFlying: () => false,
        getFood: () => 20,
        getSaturation: () => 5,
        getNetworkSession: () => stub<PlayerSession>({ send: async (packet: DataPacket) => void sent.push(packet) })
    });

    attributes.setValue(AttributeIds.PlayerLevel, 30);
    return { player, sent, attributes };
};

const pickaxe = () => new Item({ name: 'minecraft:diamond_pickaxe' });

describe('the enchanting table', () => {
    it('offers the same three rows for the same seed, which is what keeps them still', () => {
        const registry = content().enchantments;

        const first = enchantingRows(registry, pickaxe(), 1234, 15);
        const second = enchantingRows(registry, pickaxe(), 1234, 15);

        expect(first).toHaveLength(3);
        expect(second).toEqual(first);
    });

    it('offers different rows for a different seed', () => {
        const registry = content().enchantments;

        const first = enchantingRows(registry, pickaxe(), 1234, 15);
        const second = enchantingRows(registry, pickaxe(), 4321, 15);

        expect(second).not.toEqual(first);
    });

    it('costs more with more bookshelves', () => {
        const registry = content().enchantments;

        const bare = enchantingRows(registry, pickaxe(), 7, 0);
        const surrounded = enchantingRows(registry, pickaxe(), 7, 15);

        expect(surrounded[2]!.cost).toBeGreaterThan(bare[2]!.cost);
    });

    it('offers nothing for an item the table cannot enchant', () => {
        const registry = content().enchantments;

        const rows = enchantingRows(registry, new Item({ name: 'minecraft:stone' }), 1234, 15);
        expect(rows.every((row) => row.cost === 0)).toBe(true);
    });

    it('turns the rows into options the client can draw', () => {
        const registry = content().enchantments;
        const rows = enchantingRows(registry, pickaxe(), 1234, 15);
        const options = enchantOptionsOf(registry, rows);

        expect(options.length).toBeGreaterThan(0);
        for (const option of options) {
            expect(option.cost).toBeGreaterThan(0);
            expect(option.enchantNetId).toBe(option.enchants.slot + 1);
            // Both are mainhand enchantments, so both land in the held list.
            expect(option.enchants.equipActivatedEnchants).toEqual([]);
            for (const instance of option.enchants.heldActivatedEnchants) {
                expect([EnchantType.Efficiency, EnchantType.Unbreaking]).toContain(instance.enchantType);
                expect(instance.enchantLevel).toBeGreaterThan(0);
            }
        }
    });

    describe('taking a row', () => {
        it('puts the drawn enchantments on the stack and charges the levels', () => {
            const { player, attributes } = scene(content());
            const registry = content().enchantments;
            const seed = enchantmentSeedOf(player, 1234);
            const rows = enchantingRows(registry, pickaxe(), seed, 15);
            const row = rows.findIndex((entry) => entry.picks.length > 0);

            const result = takeEnchantingRow(registry, player, pickaxe(), seed, 15, row);

            expect(result).toBeDefined();
            expect(result!.stack.getEnchantments().size).toBeGreaterThan(0);
            expect([...result!.stack.getEnchantments()]).toEqual(
                rows[row]!.picks.map((pick) => [pick.enchantment, pick.level])
            );
            expect(attributes.getValue(AttributeIds.PlayerLevel)).toBe(30 - rows[row]!.cost);
        });

        it('rerolls the seed, so the next item is a fresh draw', () => {
            const { player } = scene(content());
            const registry = content().enchantments;
            const seed = enchantmentSeedOf(player, 1234);
            const row = enchantingRows(registry, pickaxe(), seed, 15).findIndex((entry) => entry.picks.length > 0);

            takeEnchantingRow(registry, player, pickaxe(), seed, 15, row);
            expect(enchantmentSeedOf(player)).not.toBe(seed);
        });

        it('refuses a player who cannot pay, and charges them nothing', () => {
            const { player, attributes } = scene(content());
            const registry = content().enchantments;
            const seed = enchantmentSeedOf(player, 1234);
            const row = enchantingRows(registry, pickaxe(), seed, 15).findIndex((entry) => entry.picks.length > 0);
            attributes.setValue(AttributeIds.PlayerLevel, 0);

            expect(takeEnchantingRow(registry, player, pickaxe(), seed, 15, row)).toBeUndefined();
            expect(attributes.getValue(AttributeIds.PlayerLevel)).toBe(0);
        });

        it('refuses an empty row', () => {
            const { player } = scene(content());
            const registry = content().enchantments;
            const stone = new Item({ name: 'minecraft:stone' });

            expect(takeEnchantingRow(registry, player, stone, 1234, 15, 0)).toBeUndefined();
        });
    });

    describe('sending the table to the client', () => {
        it('sends real options for an enchantable stack', async () => {
            const { player, sent } = scene(content());
            rerollEnchantmentSeed(player);

            await showEnchantingTable(player, pickaxe(), { x: 0, y: 64, z: 0 });

            const packet = sent.find(
                (entry): entry is PlayerEnchantOptionsPacket => entry instanceof PlayerEnchantOptionsPacket
            );
            expect(packet).toBeDefined();
            expect(packet!.options.length).toBeGreaterThan(0);
        });

        it('clears the table for an empty slot', async () => {
            const { player, sent } = scene(content());

            await showEnchantingTable(player, undefined, { x: 0, y: 64, z: 0 });

            const packet = sent.at(-1);
            expect(packet).toBeInstanceOf(PlayerEnchantOptionsPacket);
            expect((packet as PlayerEnchantOptionsPacket).options).toEqual([]);
        });
    });
});

describe('bookshelfPowerAround', () => {
    it('is zero with nothing around the table', async () => {
        expect(await bookshelfPowerAround(worldOf(), { x: 0, y: 64, z: 0 })).toBe(0);
    });

    it('counts a shelf two blocks out with the gap clear', async () => {
        const blocks = new Map([['2,64,0', 'minecraft:bookshelf']]);

        expect(await bookshelfPowerAround(worldOf(blocks), { x: 0, y: 64, z: 0 })).toBe(1);
    });

    it('stops counting it when the gap is filled, which is why the ring has one', async () => {
        const blocks = new Map([
            ['2,64,0', 'minecraft:bookshelf'],
            ['1,64,0', 'minecraft:stone']
        ]);

        expect(await bookshelfPowerAround(worldOf(blocks), { x: 0, y: 64, z: 0 })).toBe(0);
    });

    it('caps at fifteen, which is where the formula stops caring', async () => {
        const blocks = new Map<string, string>();
        for (let x = -2; x <= 2; x += 1) {
            for (let z = -2; z <= 2; z += 1) {
                if (Math.abs(x) === 2 || Math.abs(z) === 2) {
                    blocks.set(`${x},64,${z}`, 'minecraft:bookshelf');
                    blocks.set(`${x},65,${z}`, 'minecraft:bookshelf');
                }
            }
        }

        expect(await bookshelfPowerAround(worldOf(blocks), { x: 0, y: 64, z: 0 })).toBe(15);
    });
});

describe('the anvil', () => {
    it('merges two equal levels into one above, and charges for it', () => {
        const registry = content().enchantments;
        const base = pickaxe().withEnchantments({ 'minecraft:unbreaking': 2 });
        const addition = pickaxe().withEnchantments({ 'minecraft:unbreaking': 2 });

        const preview = anvilPreview(registry, { base, addition });

        expect(preview.stack?.getEnchantmentLevel('minecraft:unbreaking')).toBe(3);
        expect(preview.cost).toBeGreaterThan(0);
    });

    it('takes the larger of two unequal levels', () => {
        const registry = content().enchantments;
        const base = pickaxe().withEnchantments({ 'minecraft:unbreaking': 1 });
        const addition = pickaxe().withEnchantments({ 'minecraft:unbreaking': 3 });

        expect(anvilPreview(registry, { base, addition }).stack?.getEnchantmentLevel('minecraft:unbreaking')).toBe(3);
    });

    it('caps at the enchantment maximum, however many copies go in', () => {
        const registry = content().enchantments;
        const base = pickaxe().withEnchantments({ 'minecraft:unbreaking': 3 });
        const addition = pickaxe().withEnchantments({ 'minecraft:unbreaking': 3 });

        expect(anvilPreview(registry, { base, addition }).stack?.getEnchantmentLevel('minecraft:unbreaking')).toBe(3);
    });

    it('charges the player and hands the stack over', () => {
        const { player, attributes } = scene(content());
        const registry = content().enchantments;
        const base = pickaxe().withEnchantments({ 'minecraft:unbreaking': 2 });
        const addition = pickaxe().withEnchantments({ 'minecraft:unbreaking': 2 });
        const cost = anvilPreview(registry, { base, addition }).cost;

        const outcome = takeFromAnvil(registry, player, { base, addition });

        expect(outcome?.stack.getEnchantmentLevel('minecraft:unbreaking')).toBe(3);
        expect(attributes.getValue(AttributeIds.PlayerLevel)).toBe(30 - cost);
    });

    it('refuses a player who cannot pay, and charges them nothing', () => {
        const { player, attributes } = scene(content());
        const registry = content().enchantments;
        attributes.setValue(AttributeIds.PlayerLevel, 0);

        const outcome = takeFromAnvil(registry, player, {
            base: pickaxe().withEnchantments({ 'minecraft:unbreaking': 2 }),
            addition: pickaxe().withEnchantments({ 'minecraft:unbreaking': 2 })
        });

        expect(outcome).toBeUndefined();
        expect(attributes.getValue(AttributeIds.PlayerLevel)).toBe(0);
    });
});
