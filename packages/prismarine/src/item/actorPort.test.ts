import { Vector3 } from '@jsprismarine/math';
import { Gametype, LevelSoundEvent } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import HumanInventory from '../inventory/HumanInventory';
import Player from '../Player';
import { EyeOfEnderSignal } from '../entity/other/EyeOfEnderSignal';
import { Item } from './Item';
import { contentStackOf } from './contentStack';
import { testContent } from '../testing/entityServer';
import { stub } from '../testing/stub.test.helper';
import { createItemActorPort } from './actorPort';
import type { ContentEntityAccess, ContentItemDrop, ContentLevelFacts } from '../content/world/adapter';
import { unwiredWorld } from '../content/world/unwired';
import type { Entity } from '../entity/Entity';
import type { World } from '../world/World';

/** Whoever is holding the item, as the item runtime names one. */
const SOURCE = { identifier: 'minecraft:player', runtimeId: 7 };

/** What one test drove the port with, read back afterwards. */
interface Recorded {
    readonly fed: { nutrition: number; saturation: number }[];
    readonly logged: string[];
    /** Every entity the world was asked to add. */
    readonly added: Entity[];
    /** Every actor sound the world was asked to play, by runtime id. */
    readonly actorSounds: { runtimeId: bigint; sound: number }[];
    /** Every structure search the world was asked for. */
    readonly searches: { name: string; origin: { x: number; z: number }; radius: number | undefined }[];
}

const recording = (): Recorded => ({ fed: [], logged: [], added: [], actorSounds: [], searches: [] });

/** A player reduced to what the port reads and writes, still a `Player` to `instanceof`. */
const playerDouble = (recorded: Recorded): Player =>
    Object.assign(Object.create(Player.prototype), {
        getPosition: () => new Vector3(1.5, 65, 1.5),
        // A player reports its eyes; the body starts 1.62 below and stands 1.8 tall.
        getFeetY: () => 65 - 1.62,
        getBox: () => ({ width: 0.6, height: 1.8 }),
        getFallDistance: () => 3,
        getFood: () => 11,
        getStatusEffects: () => [],
        isOnGround: () => true,
        gamemode: Gametype.SURVIVAL,
        addFood: (nutrition: number, saturation: number) => void recorded.fed.push({ nutrition, saturation }),
        // The two advancement triggers the port raises read these. With no content built there
        // is nothing listening, which is what `enabled` checks first.
        getInventory: () => new HumanInventory(),
        getServer: () => ({ getContent: () => testContent() })
    });

/** A world reduced to the entity lookup, the block read, the logger, and what a thrown eye needs. */
const worldDouble = (player: Player, recorded: Recorded, target?: Entity): World =>
    ({
        getEntity: (runtimeId: bigint) =>
            runtimeId === 7n ? (player as unknown as Entity) : runtimeId === 9n ? (target ?? null) : null,
        loadedBlockAt: () => ({ name: 'minecraft:air', states: {} }),
        getServer: () => ({
            getLogger: () => ({ debug: (message: string) => void recorded.logged.push(message) }),
            getContent: () => testContent(),
            getRandom: () => () => 0.5
        }),
        addEntity: async (entity: Entity) => void recorded.added.push(entity),
        broadcastMove: async () => {},
        sendActorSound: async (entity: Entity, sound: number) =>
            void recorded.actorSounds.push({ runtimeId: entity.getRuntimeId(), sound }),
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
        const player = Object.assign(Object.create(Player.prototype), {
            getPosition: () => new Vector3(1.5, 65, 1.5),
            gamemode: Gametype.SURVIVAL,
            getInventory: () => inventory,
            getServer: () => ({ getContent: () => testContent() })
        });
        const target = stub<Entity>();
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
        expect(inventory.getItemInHand().getName()).toBe('minecraft:diamond_sword');
        expect(inventory.getItemInHand().getCustomName()).toBe('Returned sword');
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

    it('throws an eye of ender signal from the middle of the thrower and plays the launch', async () => {
        const { port, recorded } = portUnderTest();
        // The fixture content carries no eye of ender; the port does not care what flies, only
        // that the content has an item for it to drop.
        const item = contentStackOf(testContent(), new Item({ name: 'minecraft:diamond_pickaxe', runtimeId: 1 }))!;

        port.perform({ kind: 'signal', source: SOURCE, item, target: { x: 100, y: 0, z: 1.5 } });
        await Promise.resolve();

        const [eye] = recorded.added;
        expect(eye).toBeInstanceOf(EyeOfEnderSignal);
        // Java spawns at `player.getY(0.5)`: half the body height above the feet.
        expect(eye?.getPosition().getX()).toBe(1.5);
        expect(eye?.getPosition().getY()).toBeCloseTo(65 - 1.62 + 0.9);
        expect(eye?.getPosition().getZ()).toBe(1.5);
        expect(recorded.actorSounds).toEqual([{ runtimeId: eye?.getRuntimeId(), sound: LevelSoundEvent.LAUNCH }]);

        // Signaled: the first tick after a signal sets the eye off toward its target.
        await eye?.update(1);
        await eye?.update(2);
        expect(eye?.getVelocity().getX()).toBeGreaterThan(0);
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
