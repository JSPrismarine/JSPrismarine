import { Vector3 } from '@jsprismarine/math';
import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import Player from '../Player';
import { createItemActorPort } from './actorPort';
import type { ContentEntityAccess, ContentLevelFacts } from '../content/world/adapter';
import { unwiredWorld } from '../content/world/unwired';
import type { Entity } from '../entity/Entity';
import type { World } from '../world/World';

/** Whoever is holding the item, as the item runtime names one. */
const SOURCE = { identifier: 'minecraft:player', runtimeId: 7 };

/** What one test drove the port with, read back afterwards. */
interface Recorded {
    readonly fed: { nutrition: number; saturation: number }[];
    readonly logged: string[];
}

/** A player reduced to what the port reads and writes, still a `Player` to `instanceof`. */
const playerDouble = (recorded: Recorded): Player =>
    Object.assign(Object.create(Player.prototype), {
        getPosition: () => new Vector3(1.5, 65, 1.5),
        getFallDistance: () => 3,
        getFood: () => 11,
        isOnGround: () => true,
        gamemode: Gametype.SURVIVAL,
        addFood: (nutrition: number, saturation: number) => void recorded.fed.push({ nutrition, saturation })
    });

/** A world reduced to the entity lookup, the block read and the logger. */
const worldDouble = (player: Player, recorded: Recorded): World =>
    ({
        getEntity: (runtimeId: bigint) => (runtimeId === 7n ? (player as unknown as Entity) : null),
        loadedBlockAt: () => ({ name: 'minecraft:air', states: {} }),
        getServer: () => ({
            getLogger: () => ({ debug: (message: string) => void recorded.logged.push(message) })
        })
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
    const recorded: Recorded = { fed: [], logged: [] };
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

    it('reports an action whose system this server has not written, once', () => {
        const { port, recorded } = portUnderTest();
        port.perform({ kind: 'apply-effects', target: SOURCE, effects: [] });
        port.perform({ kind: 'apply-effects', target: SOURCE, effects: [] });

        expect(recorded.logged).toHaveLength(1);
        expect(recorded.logged[0]).toContain('a status effect system');
    });
});
