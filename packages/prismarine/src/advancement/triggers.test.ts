import { describe, expect, it } from 'vitest';

import { buildServerContent } from '../content/ServerContent';
import { definitionOf, definitionsOf } from '../content/ContentOptions';
import type { ServerContent } from '../content/ServerContent';
import { fixtureBlockPalette, fixtureItemDefinitions } from '../content/testing';
import Player from '../Player';
import type Server from '../Server';
import type { World } from '../world/World';
import { Attributes } from '../entity/Attribute';
import { DamageCause } from '../entity/DamageCause';
import { DamageSource } from '../entity/DamageSource';
import type { Entity } from '../entity/Entity';
import ContainerEntry from '../inventory/ContainerEntry';
import HumanInventory from '../inventory/HumanInventory';
import { Item } from '../item/Item';
import { createItemActorPort } from '../item/actorPort';
import type { ContentEntityAccess } from '../content/world/adapter';
import { unwiredWorld } from '../content/world/unwired';
import { testContent } from '../testing/entityServer';
import { stub, stubOf } from '../testing/stub.test.helper';
import { advancementsOf, loadAdvancements, storedAdvancements } from './progress';
import {
    advancementBlockUsed,
    advancementItemCrafted,
    advancementItemUsedOnBlock,
    advancementKill,
    advancementPickedUpItem,
    advancementPlayerTick
} from './triggers';

/**
 * A player earning vanilla advancements by playing.
 *
 * The three the brief names, each through the trigger a real session would
 * reach: mining stone (the cobblestone landing in a slot, which is the only
 * way Java reports a block break), crafting, and killing a mob. The
 * advancement bodies are copied verbatim from Java 26.3's
 * `data/minecraft/advancement/`, with `kill_a_mob` cut down to two of its 60
 * criteria so the fixture stays readable - the shape and the trigger are the
 * real ones.
 */

const advancementDefinitions = () =>
    new Map([
        [
            'minecraft:story/root',
            definitionOf('advancements', 'minecraft:story/root', {
                criteria: {
                    crafting_table: {
                        conditions: { items: [{ items: 'minecraft:crafting_table' }] },
                        trigger: 'minecraft:inventory_changed'
                    }
                },
                display: {
                    announce_to_chat: false,
                    background: 'minecraft:gui/advancements/backgrounds/stone',
                    description: { translate: 'advancements.story.root.description' },
                    icon: { id: 'minecraft:grass_block' },
                    show_toast: false,
                    title: { translate: 'advancements.story.root.title' }
                },
                requirements: [['crafting_table']]
            })
        ],
        [
            'minecraft:story/mine_stone',
            definitionOf('advancements', 'minecraft:story/mine_stone', {
                parent: 'minecraft:story/root',
                criteria: {
                    get_stone: {
                        conditions: { items: [{ items: '#minecraft:stone_tool_materials' }] },
                        trigger: 'minecraft:inventory_changed'
                    }
                },
                display: {
                    description: { translate: 'advancements.story.mine_stone.description' },
                    icon: { id: 'minecraft:wooden_pickaxe' },
                    title: { translate: 'advancements.story.mine_stone.title' }
                },
                requirements: [['get_stone']]
            })
        ],
        [
            'minecraft:adventure/craft_decorated_pot_using_only_sherds',
            definitionOf('advancements', 'minecraft:adventure/craft_decorated_pot_using_only_sherds', {
                criteria: {
                    pot_crafted_using_only_sherds: {
                        conditions: {
                            ingredients: [
                                { items: '#minecraft:decorated_pot_sherds' },
                                { items: '#minecraft:decorated_pot_sherds' }
                            ],
                            recipes: 'minecraft:decorated_pot'
                        },
                        trigger: 'minecraft:recipe_crafted'
                    }
                },
                display: {
                    description: { translate: 'description' },
                    icon: { id: 'minecraft:decorated_pot' },
                    title: { translate: 'advancements.adventure.craft_decorated_pot_using_only_sherds.title' }
                },
                requirements: [['pot_crafted_using_only_sherds']]
            })
        ],
        [
            'minecraft:adventure/kill_a_mob',
            definitionOf('advancements', 'minecraft:adventure/kill_a_mob', {
                criteria: {
                    'minecraft:zombie': {
                        conditions: {
                            entity: {
                                type: 'minecraft:entity_properties',
                                entity: 'this',
                                predicate: { 'minecraft:entity_type': 'minecraft:zombie' }
                            }
                        },
                        trigger: 'minecraft:player_killed_entity'
                    },
                    'minecraft:creeper': {
                        conditions: {
                            entity: {
                                type: 'minecraft:entity_properties',
                                entity: 'this',
                                predicate: { 'minecraft:entity_type': 'minecraft:creeper' }
                            }
                        },
                        trigger: 'minecraft:player_killed_entity'
                    }
                },
                display: {
                    description: { translate: 'description' },
                    icon: { id: 'minecraft:iron_sword' },
                    title: { translate: 'advancements.adventure.kill_a_mob.title' }
                },
                // Any one of them, which is what makes this an `or` rather than
                // the `and` a single-group default would produce.
                requirements: [['minecraft:zombie', 'minecraft:creeper']]
            })
        ],
        [
            'minecraft:story/stand_somewhere',
            definitionOf('advancements', 'minecraft:story/stand_somewhere', {
                criteria: { anywhere: { trigger: 'minecraft:location' } },
                requirements: [['anywhere']]
            })
        ],
        [
            // Verbatim from Java 26.3, display aside: one criterion with no
            // conditions at all, so the first thing a player eats opens the
            // whole husbandry branch.
            'minecraft:husbandry/root',
            definitionOf('advancements', 'minecraft:husbandry/root', {
                criteria: { consumed_item: { trigger: 'minecraft:consume_item' } },
                requirements: [['consumed_item']]
            })
        ],
        [
            'minecraft:story/wear_out_a_pickaxe',
            definitionOf('advancements', 'minecraft:story/wear_out_a_pickaxe', {
                criteria: {
                    worn: {
                        conditions: { item: { items: 'minecraft:diamond_pickaxe' }, durability: { max: 2 } },
                        trigger: 'minecraft:item_durability_changed'
                    }
                },
                requirements: [['worn']]
            })
        ],
        [
            // No conditions, because `location_check` resolves the block out of
            // the live world through the level rather than out of the event, and
            // this fixture has no world. The trigger is what is under test here.
            'minecraft:story/use_a_block',
            definitionOf('advancements', 'minecraft:story/use_a_block', {
                criteria: { touched: { trigger: 'minecraft:default_block_use' } },
                requirements: [['touched']]
            })
        ],
        [
            'minecraft:story/use_a_pickaxe_on_a_lamp',
            definitionOf('advancements', 'minecraft:story/use_a_pickaxe_on_a_lamp', {
                criteria: {
                    used: {
                        conditions: {
                            location: [
                                {
                                    type: 'minecraft:match_tool',
                                    predicate: { items: 'minecraft:diamond_pickaxe' }
                                }
                            ]
                        },
                        trigger: 'minecraft:item_used_on_block'
                    }
                },
                requirements: [['used']]
            })
        ],
        [
            'minecraft:story/touch_anything',
            definitionOf('advancements', 'minecraft:story/touch_anything', {
                criteria: { touched: { trigger: 'minecraft:any_block_use' } },
                requirements: [['touched']]
            })
        ]
    ]);

const tagDefinitions = () =>
    new Map([
        [
            'item/minecraft:stone_tool_materials',
            definitionOf('tags', 'item/minecraft:stone_tool_materials', {
                values: ['minecraft:cobblestone', 'minecraft:blackstone', 'minecraft:cobbled_deepslate']
            })
        ],
        [
            'item/minecraft:decorated_pot_sherds',
            definitionOf('tags', 'item/minecraft:decorated_pot_sherds', {
                values: ['minecraft:brick', 'minecraft:angler_pottery_sherd']
            })
        ]
    ]);

const content = (): ServerContent =>
    buildServerContent({
        load: () => ({
            definitions: definitionsOf({ advancements: advancementDefinitions(), tags: tagDefinitions() }),
            diagnostics: []
        }),
        blockPalette: fixtureBlockPalette(),
        itemDefinitions: fixtureItemDefinitions()
    });

/** Whoever is holding the item, as the item runtime names one, matched to the player below. */
const SOURCE = { identifier: 'minecraft:player', runtimeId: 7 };

/**
 * A player with an inventory, the attributes a subject reads, and a world to announce into.
 *
 * The item actor port is the real one, built over the same player, so the two triggers whose
 * call site is inside it are driven by the call site rather than by the helper.
 */
const scene = () => {
    const built = content();
    const announced: Array<{ key: string; parameters: string[] }> = [];
    const inventory = new HumanInventory();

    const server = stub<Server>({ getContent: () => built });
    const world = stub<World>({
        getPlayers: () => [player],
        getEntity: (runtimeId: bigint) => (runtimeId === 7n ? player : null),
        loadedBlockAt: () => ({ name: 'minecraft:air', states: {} }) as never,
        getServer: () => server
    });

    const player: Player = stubOf(Player, {
        getType: () => 'minecraft:player',
        getName: () => 'tester',
        getPosition: () => ({ getX: () => 0, getY: () => 64, getZ: () => 0 }) as never,
        getServer: () => server,
        getWorld: () => world,
        getInventory: () => inventory,
        getEquipment: () => ({}),
        getStatusEffects: () => [],
        attributes: new Attributes(Attributes.getPlayerDefaults()),
        metadata: { sprinting: false } as never,
        gamemode: 0,
        isSneaking: () => false,
        isFlying: () => false,
        getFood: () => 20,
        getSaturation: () => 5,
        addFood: () => {},
        sendMessage: async (message: string, _type?: number, parameters: string[] = []) => {
            announced.push({ key: message, parameters });
        }
    });

    const port = createItemActorPort({
        world: () => world,
        entities: stub<ContentEntityAccess>({ drop: () => {} }),
        level: { ...unwiredWorld().level, gameTime: () => 0 }
    });

    return { player, inventory, announced, port };
};

const mob = (type: string): Entity =>
    stub<Entity>({
        getType: () => type,
        getPosition: () => ({ getX: () => 0, getY: () => 64, getZ: () => 0 }) as never,
        getEquipment: () => ({}),
        getServer: () => stub<Server>({ getContent: () => testContent() })
    });

const done = (player: Player, id: string): boolean => {
    const advancement = player.getServer().getContent().advancements.get(id);
    return advancement !== undefined && advancementsOf(player).isDone(advancement);
};

describe('earning vanilla advancements by playing', () => {
    it('earns story/mine_stone from the cobblestone a break dropped', () => {
        const { player, inventory } = scene();
        const cobblestone = new Item({ name: 'minecraft:cobblestone' });
        inventory.setItem(0, new ContainerEntry({ item: cobblestone, count: 1 }));

        expect(done(player, 'minecraft:story/mine_stone')).toBe(false);
        advancementPickedUpItem(player, cobblestone);
        expect(done(player, 'minecraft:story/mine_stone')).toBe(true);
    });

    it('does not earn it from something else landing in a slot', () => {
        const { player, inventory } = scene();
        const stick = new Item({ name: 'minecraft:stick' });
        inventory.setItem(0, new ContainerEntry({ item: stick, count: 1 }));

        advancementPickedUpItem(player, stick);
        expect(done(player, 'minecraft:story/mine_stone')).toBe(false);
    });

    it('earns story/root from a crafting table reaching the inventory', () => {
        const { player, inventory } = scene();
        const table = new Item({ name: 'minecraft:crafting_table' });
        inventory.setItem(0, new ContainerEntry({ item: table, count: 1 }));

        advancementPickedUpItem(player, table);
        expect(done(player, 'minecraft:story/root')).toBe(true);
    });

    it('earns a recipe_crafted advancement from the recipe and its ingredients', () => {
        const { player } = scene();
        const sherds = [new Item({ name: 'minecraft:brick' }), new Item({ name: 'minecraft:angler_pottery_sherd' })];

        advancementItemCrafted(player, 'minecraft:decorated_pot', sherds);
        expect(done(player, 'minecraft:adventure/craft_decorated_pot_using_only_sherds')).toBe(true);
    });

    it('does not earn it from the right recipe with the wrong ingredients', () => {
        const { player } = scene();

        advancementItemCrafted(player, 'minecraft:decorated_pot', [new Item({ name: 'minecraft:stick' })]);
        expect(done(player, 'minecraft:adventure/craft_decorated_pot_using_only_sherds')).toBe(false);
    });

    it('does not earn it from the right ingredients under another recipe', () => {
        const { player } = scene();
        const sherds = [new Item({ name: 'minecraft:brick' }), new Item({ name: 'minecraft:angler_pottery_sherd' })];

        advancementItemCrafted(player, 'minecraft:stick', sherds);
        expect(done(player, 'minecraft:adventure/craft_decorated_pot_using_only_sherds')).toBe(false);
    });

    it('earns kill_a_mob from killing one of the mobs it names', () => {
        const { player } = scene();

        advancementKill(mob('minecraft:zombie'), DamageSource.entity(player));
        expect(done(player, 'minecraft:adventure/kill_a_mob')).toBe(true);
    });

    it('does not earn it from killing something else', () => {
        const { player } = scene();

        advancementKill(mob('minecraft:cow'), DamageSource.entity(player));
        expect(done(player, 'minecraft:adventure/kill_a_mob')).toBe(false);
    });

    it('does not credit a kill nobody is answerable for', () => {
        const { player } = scene();

        advancementKill(mob('minecraft:zombie'), DamageSource.of(DamageCause.Generic));
        expect(done(player, 'minecraft:adventure/kill_a_mob')).toBe(false);
    });

    it('earns a location advancement from the periodic check', () => {
        const { player } = scene();

        advancementPlayerTick(player);
        expect(done(player, 'minecraft:story/stand_somewhere')).toBe(true);
    });

    it('announces a completion to everyone who can see it, and keeps quiet about a silent one', () => {
        const { player, inventory, announced } = scene();
        const cobblestone = new Item({ name: 'minecraft:cobblestone' });
        const table = new Item({ name: 'minecraft:crafting_table' });
        inventory.setItem(0, new ContainerEntry({ item: cobblestone, count: 1 }));
        inventory.setItem(1, new ContainerEntry({ item: table, count: 1 }));

        // `story/root` sets `announce_to_chat: false`, which is why it is the
        // one advancement in the game nobody is told about.
        advancementPickedUpItem(player, table);
        expect(announced).toEqual([]);

        advancementPickedUpItem(player, cobblestone);
        expect(announced).toEqual([
            { key: 'chat.type.achievement', parameters: ['tester', 'advancements.story.mine_stone.title'] }
        ]);
    });

    it('earns husbandry/root the first time the player eats anything', () => {
        const { player, port, inventory } = scene();
        inventory.setItem(0, new ContainerEntry({ item: new Item({ name: 'minecraft:stone' }), count: 1 }));

        expect(done(player, 'minecraft:husbandry/root')).toBe(false);

        // Through the port's own `feed`, which is where `minecraft:consumable`
        // lands, rather than through the trigger helper.
        port.perform({ kind: 'feed', target: SOURCE, nutrition: 4, saturation: 2.4 });

        expect(done(player, 'minecraft:husbandry/root')).toBe(true);
    });

    it('earns a durability advancement from the hit that wore the tool down', () => {
        const { player, port, inventory } = scene();
        const pickaxe = new Item({ name: 'minecraft:diamond_pickaxe' });
        inventory.setItem(0, new ContainerEntry({ item: pickaxe, count: 1 }));
        pickaxe.durability = 4;

        port.perform({ kind: 'consume-durability', source: SOURCE, amount: 1, broke: false });
        expect(done(player, 'minecraft:story/wear_out_a_pickaxe')).toBe(false);

        // One more, which takes it to the single point the criterion asks for.
        port.perform({ kind: 'consume-durability', source: SOURCE, amount: 1, broke: false });
        expect(done(player, 'minecraft:story/wear_out_a_pickaxe')).toBe(true);
    });

    it('earns the block-use advancements from a block that took the click', () => {
        const { player } = scene();
        const event = { origin: { x: 1, y: 64, z: 2 }, block: 'minecraft:redstone_lamp' };

        advancementBlockUsed(player, event, true);

        expect(done(player, 'minecraft:story/use_a_block')).toBe(true);
        expect(done(player, 'minecraft:story/touch_anything')).toBe(true);
    });

    it('leaves default_block_use alone when the item took the click instead', () => {
        const { player } = scene();
        const event = { origin: { x: 1, y: 64, z: 2 }, block: 'minecraft:redstone_lamp' };

        advancementBlockUsed(player, event, false);

        expect(done(player, 'minecraft:story/use_a_block')).toBe(false);
        expect(done(player, 'minecraft:story/touch_anything')).toBe(true);
    });

    it('earns item_used_on_block from the tool that did it', () => {
        const { player } = scene();
        const event = { origin: { x: 1, y: 64, z: 2 }, block: 'minecraft:redstone_lamp' };

        advancementItemUsedOnBlock(player, { ...event, tool: new Item({ name: 'minecraft:stone' }) });
        expect(done(player, 'minecraft:story/use_a_pickaxe_on_a_lamp')).toBe(false);

        advancementItemUsedOnBlock(player, { ...event, tool: new Item({ name: 'minecraft:diamond_pickaxe' }) });
        expect(done(player, 'minecraft:story/use_a_pickaxe_on_a_lamp')).toBe(true);
    });
});

describe('advancement progress across a save and a load', () => {
    it('survives the round trip through the player data record', () => {
        const first = scene();
        const cobblestone = new Item({ name: 'minecraft:cobblestone' });
        first.inventory.setItem(0, new ContainerEntry({ item: cobblestone, count: 1 }));
        advancementPickedUpItem(first.player, cobblestone);

        const stored = storedAdvancements(first.player);
        expect(stored['minecraft:story/mine_stone']).toEqual({
            criteria: { get_stone: expect.any(String) },
            done: true
        });

        const second = scene();
        expect(done(second.player, 'minecraft:story/mine_stone')).toBe(false);
        loadAdvancements(second.player, stored);
        expect(done(second.player, 'minecraft:story/mine_stone')).toBe(true);
    });

    it('does not earn a second time, so a reloaded completion announces nothing', () => {
        const first = scene();
        const cobblestone = new Item({ name: 'minecraft:cobblestone' });
        first.inventory.setItem(0, new ContainerEntry({ item: cobblestone, count: 1 }));
        advancementPickedUpItem(first.player, cobblestone);

        const second = scene();
        second.inventory.setItem(0, new ContainerEntry({ item: cobblestone, count: 1 }));
        loadAdvancements(second.player, storedAdvancements(first.player));

        advancementPickedUpItem(second.player, cobblestone);
        expect(second.announced).toEqual([]);
    });

    it('starts a player with no stored record from nothing', () => {
        const { player } = scene();

        loadAdvancements(player, undefined);
        expect(storedAdvancements(player)).toEqual({});
    });

    it('drops a broken entry and keeps the rest, rather than failing the login', () => {
        const { player } = scene();

        loadAdvancements(player, {
            'minecraft:story/mine_stone': { criteria: { get_stone: '2026-10-25T09:14:02.511Z' }, done: true },
            'minecraft:story/root': { criteria: 'not an object' },
            'minecraft:nonsense': 7
        });

        expect(done(player, 'minecraft:story/mine_stone')).toBe(true);
        expect(done(player, 'minecraft:story/root')).toBe(false);
    });
});
