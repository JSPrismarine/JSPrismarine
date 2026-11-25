import { Vector3 } from '@jsprismarine/math';
import { ArmorSlot, Gametype } from '@jsprismarine/minecraft';
import type { MoveMode } from '../player/presenter/SessionPresenter';
import { describe, expect, it } from 'vitest';

import HumanInventory from '../inventory/HumanInventory';
import type Server from '../Server';
import { sessionOnPrototype } from '../testing/storePlayer.test.helper';
import { Position } from '../world/Position';
import { Item } from './Item';
import { contentStackOf } from './contentStack';
import { testContent } from '../testing/entityServer';
import { stub } from '../testing/stub.test.helper';
import { createItemActorPort } from './actorPort';
import type { ContentEntityAccess, ContentItemDrop, ContentLevelFacts } from '../content/world/adapter';
import { unwiredWorld } from '../content/world/unwired';
import type { StoreActor } from '../entity/data/storeActors';
import type { EntityPosition } from '@jsprismarine/entities';
import type { StoredItemStack } from '../inventory/persistence';
import type { World } from '../world/World';
import type PlayerSession from '../player/PlayerSession';

/** Whoever is holding the item, as the item runtime names one. */
const SOURCE = { identifier: 'minecraft:player', runtimeId: 7 };

/** What one test drove the port with, read back afterwards. */
interface Recorded {
    readonly fed: { nutrition: number; saturation: number }[];
    readonly logged: string[];
    /** Every entity the world was asked to add. */
    readonly added: StoreActor[];
    /** Every actor sound the world was asked to play, by runtime id. */
    readonly actorSounds: { runtimeId: bigint; sound: number }[];
    readonly namedSounds: { sound: string; volume?: number; pitch?: number }[];
    /** Every item the world was asked to show breaking. */
    readonly broken: string[];
    /** Every structure search the world was asked for. */
    readonly searches: { name: string; origin: { x: number; z: number }; radius: number | undefined }[];
    /** Every eye of ender the store was asked to throw. */
    readonly eyes: { from: EntityPosition; target: EntityPosition; stack: StoredItemStack }[];
    /** Every position the player's session was asked to move the player to. */
    readonly moved: { position: Vector3; type?: MoveMode }[];
}

const recording = (): Recorded => ({
    fed: [],
    logged: [],
    added: [],
    actorSounds: [],
    namedSounds: [],
    broken: [],
    searches: [],
    eyes: [],
    moved: []
});

/** A player reduced to what the port reads and writes, over a store player, with its actor. */
const playerDouble = (recorded: Recorded): PlayerSession => {
    const entity = {
        getPosition: () => new Vector3(1.5, 65, 1.5),
        // A player reports its eyes; the body starts 1.62 below and stands 1.8 tall.
        getFeetY: () => 65 - 1.62,
        getBox: () => ({ width: 0.6, height: 1.8 }),
        getStatusEffects: () => []
    };
    const player = sessionOnPrototype(
        {
            getFeetY: entity.getFeetY,
            getBox: entity.getBox,
            getStatusEffects: entity.getStatusEffects,
            getPosition: () => Position.fromVector3(entity.getPosition(), stub<World>()),
            getFallDistance: () => 3,
            getFood: () => 11,
            isOnGround: () => true,
            addFood: (nutrition: number, saturation: number) => void recorded.fed.push({ nutrition, saturation }),
            // The two advancement triggers the port raises read these. With no content built there
            // is nothing listening, which is what `enabled` checks first.
            getInventory: () => new HumanInventory(),
            getServer: () => stub<Server>({ getContent: () => testContent() }),
            setPlayerPosition: async (options: { position: Vector3; type?: MoveMode }) =>
                void recorded.moved.push(options)
        },
        { runtimeId: 7n, actor: entity }
    );
    player.getPlayer().gamemode = Gametype.SURVIVAL;
    return player;
};

/** A world reduced to the entity lookup, the block read, the logger, and what a thrown eye needs. */
const worldDouble = (player: PlayerSession, recorded: Recorded, target?: StoreActor): World =>
    ({
        getActor: (runtimeId: bigint) =>
            runtimeId === 7n ? (player.getActor() ?? null) : runtimeId === 9n ? (target ?? null) : null,
        // The player's session, which is how the port tells a player from any other entity.
        viewerOf: (runtimeId: bigint) => (runtimeId === 7n ? player : undefined),
        loadedBlockAt: () => ({ name: 'minecraft:air', states: {} }),
        // Every column's surface is at y 70.
        getLoadedChunk: () => ({ getHighestBlockAt: () => 70 }),
        getServer: () => ({
            getLogger: () => ({ debug: (message: string) => void recorded.logged.push(message) }),
            getContent: () => testContent(),
            getRandom: () => () => 0.5
        }),
        addEntity: async (entity: StoreActor) => void recorded.added.push(entity),
        dataEntities: () => ({
            runtime: {
                eyesOfEnder: {
                    launch: (from: EntityPosition, target: EntityPosition, stack: StoredItemStack) => {
                        recorded.eyes.push({ from, target, stack });
                        return { id: recorded.eyes.length };
                    }
                }
            }
        }),
        entityRelocated: () => {},
        broadcastMove: async () => {},
        showItemBreak: (_entity: StoreActor, item: string) => void recorded.broken.push(item),
        sendActorSound: (entity: StoreActor, sound: number) =>
            void recorded.actorSounds.push({ runtimeId: entity.getRuntimeId(), sound }),
        playNamedSoundAt: (_position: Vector3, sound: string, options?: { volume?: number; pitch?: number }) =>
            void recorded.namedSounds.push({ sound, ...options }),
        locateStructure: (name: string, origin: { x: number; z: number }, radius?: number) => {
            recorded.searches.push({ name, origin, radius });
            // The world resolves a `#tag` through the generator's members; this double stands in
            // for a generator whose `eye_of_ender_located` tag holds the stronghold.
            return name === '#minecraft:eye_of_ender_located'
                ? { structure: 'minecraft:stronghold', x: 400, y: 0, z: -96 }
                : undefined;
        }
    }) as unknown as World;

/**
 * The clock the cooldowns are measured against, which a test moves by hand.
 *
 * Built over {@link unwiredWorld}'s level rather than over a cast, so the port can only ever
 * reach the one member this names: everything else throws and says which subsystem owes it,
 * and a member added to `ContentLevelFacts` arrives here without the test being touched.
 */
const clock = (): ContentLevelFacts & { tick: number } => {
    const level = { ...unwiredWorld().level, tick: 0, gameTime: () => level.tick };
    return level;
};

const entityAccess = (): ContentEntityAccess =>
    ({
        drop: () => {}
    }) as unknown as ContentEntityAccess;

const portUnderTest = () => {
    const recorded = recording();
    const player = playerDouble(recorded);
    const level = clock();
    const port = createItemActorPort({ world: () => worldDouble(player, recorded), entities: entityAccess(), level });

    return { port, level, recorded };
};

describe('the item actor port', () => {
    it('reads the source off the live player', () => {
        const { port } = portUnderTest();
        const state = port.stateOf(SOURCE);

        expect(state.position).toEqual({ x: 1, y: 65, z: 1 });
        expect(state.foodLevel).toBe(11);
        expect(state.fallDistance).toBe(3);
        expect(state.creative).toBe(false);
        expect(state.onGround).toBe(true);
        expect(state.eyeInWater).toBe(false);
    });

    it("teleports a player at random through its session, so the player's own client is told", () => {
        const { port, recorded } = portUnderTest();

        port.perform({ kind: 'teleport-randomly', target: SOURCE, radius: 8 });

        // The random source answers 0.5, which lands on the column the player stands in.
        expect(recorded.moved).toHaveLength(1);
        expect(recorded.moved[0]?.type).toBe('teleport');
        expect(recorded.moved[0]?.position.getY()).toBeCloseTo(71 + 1.62);
    });

    it('keeps an item cooldown until the clock passes it', () => {
        const { port, level } = portUnderTest();
        port.perform({ kind: 'start-cooldown', source: SOURCE, group: 'minecraft:goat_horn', ticks: 140 });

        expect(port.stateOf(SOURCE).cooldownGroups).toEqual(['minecraft:goat_horn']);

        level.tick = 140;
        expect(port.stateOf(SOURCE).cooldownGroups).toEqual([]);
    });

    it('feeds the player a consumable restores', () => {
        const { port, recorded } = portUnderTest();
        port.perform({ kind: 'feed', target: SOURCE, nutrition: 6, saturation: 7.2 });

        expect(recorded.fed).toEqual([{ nutrition: 6, saturation: 7.2 }]);
    });

    it('answers targetOf only for the interaction that found the target', () => {
        const { port } = portUnderTest();
        const target = { identifier: 'minecraft:sheep', runtimeId: 9 };

        expect(port.duringInteraction(SOURCE, target, () => port.targetOf(SOURCE))).toBe(target);
        expect(port.targetOf(SOURCE)).toBeUndefined();
    });

    it('moves an entity item into an empty selected hand', () => {
        const recorded = recording();
        const inventory = new HumanInventory();
        const player = sessionOnPrototype(
            {
                getPosition: () => Position.fromVector3(new Vector3(1.5, 65, 1.5), stub<World>()),
                gamemode: Gametype.SURVIVAL,
                getInventory: () => inventory,
                getServer: () => stub<Server>({ getContent: () => testContent() })
            },
            { runtimeId: 7n, actor: { getPosition: () => new Vector3(1.5, 65, 1.5) } }
        );
        const target = stub<StoreActor>();
        const offered: { itemIdentifier: string; heldItem: ContentItemDrop }[] = [];
        const port = createItemActorPort({
            world: () => worldDouble(player, recorded, target),
            entities: entityAccess(),
            level: clock(),
            interactWithEntity: (_target, _player, itemIdentifier, heldItem) => {
                offered.push({ itemIdentifier, heldItem });
                return {
                    accepted: true,
                    takenItem: {
                        identifier: 'minecraft:diamond_sword',
                        count: 1,
                        damage: 5,
                        customName: 'Returned sword'
                    }
                };
            }
        });
        const targetSource = { identifier: 'minecraft:zombie', runtimeId: 9 };

        expect(port.duringInteraction(SOURCE, targetSource, () => port.interactWithEntity(SOURCE))).toBe(true);
        expect(offered).toEqual([
            { itemIdentifier: 'minecraft:air', heldItem: { identifier: 'minecraft:air', count: 0 } }
        ]);
        expect(inventory.equipment('mainhand')?.getName()).toBe('minecraft:diamond_sword');
        expect(inventory.equipment('mainhand')?.getCustomName()).toBe('Returned sword');
    });

    it('keeps the wear an interaction dealt when it also uses one of the stack', () => {
        const recorded = recording();
        const inventory = new HumanInventory();
        const shears = new Item({ name: 'minecraft:shears' });
        inventory.container('inventory').set(0, shears.withCount(2));
        const player = sessionOnPrototype(
            {
                getPosition: () => Position.fromVector3(new Vector3(1.5, 65, 1.5), stub<World>()),
                gamemode: Gametype.SURVIVAL,
                getInventory: () => inventory,
                getServer: () => stub<Server>({ getContent: () => testContent() })
            },
            { runtimeId: 7n, actor: { getPosition: () => new Vector3(1.5, 65, 1.5) } }
        );
        const port = createItemActorPort({
            world: () => worldDouble(player, recorded, stub<StoreActor>()),
            entities: entityAccess(),
            level: clock(),
            interactWithEntity: () => ({ accepted: true, hurtItem: 3, consumeItem: true })
        });
        const targetSource = { identifier: 'minecraft:sheep', runtimeId: 9 };

        expect(port.duringInteraction(SOURCE, targetSource, () => port.interactWithEntity(SOURCE))).toBe(true);

        expect(inventory.container('inventory').get(0)?.getAmount()).toBe(1);
        expect(inventory.equipment('mainhand')?.getDurability()).toBe(shears.getMaxDurability() - 3);
    });

    const feeding = (count: number) => {
        const recorded = recording();
        const inventory = new HumanInventory();
        inventory.container('inventory').set(0, new Item({ name: 'minecraft:wheat', count: count }).withCount(count));
        const player = sessionOnPrototype(
            {
                getPosition: () => Position.fromVector3(new Vector3(1.5, 65, 1.5), stub<World>()),
                gamemode: Gametype.SURVIVAL,
                getInventory: () => inventory,
                getServer: () => stub<Server>({ getContent: () => testContent() })
            },
            { runtimeId: 7n, actor: { getPosition: () => new Vector3(1.5, 65, 1.5) } }
        );
        const port = createItemActorPort({
            world: () => worldDouble(player, recorded, stub<StoreActor>()),
            entities: entityAccess(),
            level: clock(),
            interactWithEntity: () => ({ accepted: true, consumeItem: true })
        });
        port.duringInteraction(SOURCE, { identifier: 'minecraft:cow', runtimeId: 9 }, () =>
            port.interactWithEntity(SOURCE)
        );
        return inventory;
    };

    it('empties the hand when an interaction uses its last item', () => {
        const inventory = feeding(1);

        expect(inventory.container('inventory').isEmpty(0)).toBe(true);
    });

    it('gives the stack left after an interaction the count its slot holds', () => {
        const inventory = feeding(3);

        expect(inventory.container('inventory').get(0)?.getAmount()).toBe(2);
        // The wire writes the item's own count, so the two have to agree.
        expect(inventory.equipment('mainhand')?.getAmount()).toBe(2);
    });

    /** Right-clicks the held armor on, from a hand of `count`, over whatever is already worn. */
    const wearing = (count: number, worn?: Item, gamemode = Gametype.SURVIVAL) => {
        const recorded = recording();
        const inventory = new HumanInventory();
        const chestplate = new Item({ name: 'minecraft:diamond_chestplate' }).withDisplay('Held plate');
        const held = chestplate.withCount(count);
        held.stackNetworkId = 7;
        inventory.container('inventory').set(0, held);
        if (worn !== undefined) inventory.container('armor').set(ArmorSlot.TORSO, worn);
        const player = sessionOnPrototype(
            {
                getPosition: () => Position.fromVector3(new Vector3(1.5, 65, 1.5), stub<World>()),
                gamemode,
                getInventory: () => inventory,
                getServer: () => stub<Server>({ getContent: () => testContent() })
            },
            { runtimeId: 7n, actor: { getPosition: () => new Vector3(1.5, 65, 1.5) } }
        );
        const port = createItemActorPort({
            world: () => worldDouble(player, recorded),
            entities: entityAccess(),
            level: clock()
        });
        // The fixture content carries no armor. A swap moves the hand's own entry and never
        // reads the action's stack, so any stack the content has stands in for it.
        const item = contentStackOf(testContent(), new Item({ name: 'minecraft:diamond_pickaxe', runtimeId: 1 }))!;
        port.perform({ kind: 'equip', target: SOURCE, slot: 'chest', item: item.copy(1), fromHand: true });
        return { inventory, worn: inventory.container('armor').get(ArmorSlot.TORSO) };
    };

    it('moves worn armor out of the hand rather than copying it', () => {
        const { inventory, worn } = wearing(1);

        expect(worn?.getName()).toBe('minecraft:diamond_chestplate');
        expect(worn?.getCustomName()).toBe('Held plate');
        expect(worn?.stackNetworkId).toBe(7);
        expect(inventory.container('inventory').isEmpty(0)).toBe(true);
    });

    it('swaps the armor already worn into the hand', () => {
        const old = new Item({ name: 'minecraft:iron_chestplate' });
        const { inventory, worn } = wearing(1, old);

        expect(worn?.getName()).toBe('minecraft:diamond_chestplate');
        expect(inventory.equipment('mainhand')?.getName()).toBe('minecraft:iron_chestplate');
        expect(
            inventory
                .container('inventory')
                .stacks()
                .filter((entry) => entry.getName() === 'minecraft:diamond_chestplate')
        ).toEqual([]);
    });

    it('wears one of a stack and puts the old armor in the inventory', () => {
        const { inventory, worn } = wearing(2, new Item({ name: 'minecraft:iron_chestplate' }));

        expect(worn?.getName()).toBe('minecraft:diamond_chestplate');
        expect(inventory.container('inventory').get(0)?.getAmount()).toBe(1);
        // The piece worn is a new stack; the hand keeps the id.
        expect(worn?.stackNetworkId).toBe(0);
        expect(inventory.container('inventory').get(0)?.stackNetworkId).toBe(7);
        expect(
            inventory
                .container('inventory')
                .stacks()
                .some((entry) => entry.getName() === 'minecraft:iron_chestplate')
        ).toBe(true);
    });

    it('leaves a creative hand holding the armor it put on an empty slot', () => {
        const { inventory, worn } = wearing(1, undefined, Gametype.CREATIVE);

        expect(worn?.getName()).toBe('minecraft:diamond_chestplate');
        expect(inventory.equipment('mainhand')?.getName()).toBe('minecraft:diamond_chestplate');
        expect(worn?.stackNetworkId).toBe(0);
        expect(inventory.equipment('mainhand')?.stackNetworkId).toBe(7);
    });

    it('wears the held tool by writing a worn copy into the hand slot', () => {
        const recorded = recording();
        const inventory = new HumanInventory();
        const pickaxe = new Item({ name: 'minecraft:iron_pickaxe' });
        inventory.container('inventory').set(0, pickaxe);
        const written: number[] = [];
        inventory.observe({ slot: (_container, slot) => void written.push(slot), handSlot: () => {} });
        const player = sessionOnPrototype(
            { getInventory: () => inventory, getServer: () => stub<Server>({ getContent: () => testContent() }) },
            { runtimeId: 7n, actor: {} }
        );
        const port = createItemActorPort({
            world: () => worldDouble(player, recorded),
            entities: entityAccess(),
            level: clock()
        });

        port.perform({ kind: 'consume-durability', source: SOURCE, amount: 2, broke: false });

        expect(written).toEqual([0]);
        expect(inventory.equipment('mainhand')?.getDurability()).toBe(pickaxe.getMaxDurability() - 2);
        // The stack that was in the hand is not changed in place.
        expect(pickaxe.getDurability()).toBe(pickaxe.getMaxDurability());
        expect(recorded.broken).toEqual([]);
    });

    it('empties the hand of a tool that wore through, and shows it breaking', () => {
        const recorded = recording();
        const inventory = new HumanInventory();
        inventory.container('inventory').set(0, new Item({ name: 'minecraft:iron_pickaxe' }));
        const player = sessionOnPrototype(
            { getInventory: () => inventory, getServer: () => stub<Server>({ getContent: () => testContent() }) },
            { runtimeId: 7n, actor: {} }
        );
        const port = createItemActorPort({
            world: () => worldDouble(player, recorded),
            entities: entityAccess(),
            level: clock()
        });

        port.perform({ kind: 'consume-durability', source: SOURCE, amount: 1, broke: true });

        expect(inventory.equipment('mainhand')).toBeNull();
        expect(recorded.broken).toEqual(['minecraft:iron_pickaxe']);
    });

    it('asks the world for the eye of ender tag itself, a hundred chunks out', () => {
        // Java's `EnderEyeItem.use` searches `#minecraft:eye_of_ender_located` with radius 100
        // and `skipKnownStructures` false. The tag reaches `World.locateStructure` as written,
        // which resolves its members through the generator, so no table here names the
        // stronghold.
        const { port, recorded } = portUnderTest();

        expect(port.locate?.('#minecraft:eye_of_ender_located', { x: 10, y: 64, z: 20 })).toEqual({
            x: 400,
            y: 0,
            z: -96
        });
        expect(recorded.searches).toEqual([
            { name: '#minecraft:eye_of_ender_located', origin: { x: 10, z: 20 }, radius: 100 }
        ]);
        expect(port.locate?.('#minecraft:on_trial_chambers_maps', { x: 10, y: 64, z: 20 })).toBeUndefined();
    });

    it('throws an eye of ender signal from the middle of the thrower and plays the launch', () => {
        const { port, recorded } = portUnderTest();
        // The fixture content carries no eye of ender; the port does not care what flies, only
        // that the content has an item for it to drop.
        const item = contentStackOf(testContent(), new Item({ name: 'minecraft:diamond_pickaxe', runtimeId: 1 }))!;

        port.perform({ kind: 'signal', source: SOURCE, item, target: { x: 100, y: 0, z: 1.5 } });

        // Java spawns at `player.getY(0.5)`: half the body height above the feet. The store flies
        // it; `eyeOfEnderSignals.test.ts` covers the flight.
        expect(recorded.eyes).toHaveLength(1);
        const [eye] = recorded.eyes;
        expect(eye?.from.x).toBe(1.5);
        expect(eye?.from.y).toBeCloseTo(65 - 1.62 + 0.9);
        expect(eye?.from.z).toBe(1.5);
        expect(eye?.target).toEqual({ x: 100, y: 0, z: 1.5 });
        expect(eye?.stack.name).toBe('minecraft:diamond_pickaxe');
        expect(recorded.added).toEqual([]);
        // Named, not the actor's `LAUNCH`, which the client resolved to a firework: vanilla
        // Bedrock plays the bow at half volume, and the fixed 0.5 roll pitches it at 0.4.
        expect(recorded.actorSounds).toEqual([]);
        expect(recorded.namedSounds).toEqual([{ sound: 'random.bow', volume: 0.5, pitch: 0.4 }]);
    });

    it('says which actions this server performs, so a behavior can keep its item', () => {
        const { port } = portUnderTest();
        expect(port.supports('feed')).toBe(true);
        expect(port.supports('map')).toBe(true);
        expect(port.supports('open-screen')).toBe(false);
        // A projectile needs the live entity runtime, which this port was built without.
        expect(port.supports('launch-projectile')).toBe(false);

        const recorded = recording();
        const player = playerDouble(recorded);
        const launching = createItemActorPort({
            world: () => worldDouble(player, recorded),
            entities: entityAccess(),
            level: clock(),
            launchProjectile: () => true
        });
        expect(launching.supports('launch-projectile')).toBe(true);
    });

    it('reports an action whose system this server has not written, once', () => {
        const { port, recorded } = portUnderTest();
        const action = {
            kind: 'launch-projectile',
            identifier: 'minecraft:snowball',
            source: SOURCE,
            power: 1,
            inaccuracy: 0
        } as const;
        port.perform(action);
        port.perform(action);

        expect(recorded.logged).toHaveLength(1);
        expect(recorded.logged[0]).toContain('a live data-driven projectile runtime');
    });
});
