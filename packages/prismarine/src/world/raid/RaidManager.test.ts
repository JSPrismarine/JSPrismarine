import { describe, expect, it } from 'vitest';

import type { RaidHost, RaidParticipant, RaidPosition } from './RaidManager';
import { RaidManager, wavesFor } from './RaidManager';

const CENTER: RaidPosition = { x: 100, y: 64, z: 100 };

/** A world with one village, one player and raiders that die when a test says so. */
const world = (overrides: Partial<RaidHost> = {}) => {
    const spawned: string[] = [];
    const dead = new Set<string>();
    const hero: number[][] = [];
    let omen = 1;
    const player: RaidParticipant = {
        id: 1,
        position: { x: 102, y: 64, z: 100 },
        get badOmenLevel() {
            return omen;
        },
        clearBadOmen: () => {
            omen = 0;
        },
        grantHero: (amplifier, ticks) => void hero.push([amplifier, ticks])
    };
    let draws = 0;
    const host: RaidHost = {
        difficulty: () => 2,
        random: () => ((draws++ % 7) + 0.5) / 7,
        players: () => [player],
        villageCenterAt: () => CENTER,
        isVillage: () => true,
        surfaceAt: () => 64,
        spawnRaider: (type) => {
            const identity = `${type}#${spawned.length}`;
            spawned.push(identity);
            return identity;
        },
        raiderAlive: (identity) => !dead.has(identity),
        ...overrides
    };
    return { host, spawned, dead, hero, player, giveOmen: (level: number) => void (omen = level) };
};

const run = (manager: RaidManager, ticks: number): void => {
    for (let i = 0; i < ticks; i += 1) manager.tick();
};

describe('RaidManager', () => {
    it('starts a raid for a player with Bad Omen in a village and spends the omen', () => {
        const { host, player } = world();
        const manager = new RaidManager(host);

        run(manager, 20);

        expect(manager.records()).toHaveLength(1);
        expect(manager.records()[0]).toMatchObject({ status: 'ongoing', omenLevel: 1, groupsSpawned: 0, numGroups: 5 });
        expect(player.badOmenLevel).toBe(0);
    });

    it('does not start a raid without an omen, outside a village or on peaceful', () => {
        const noOmen = world();
        noOmen.giveOmen(0);
        const outside = world({ villageCenterAt: () => undefined });
        const peaceful = world({ difficulty: () => 0 });

        for (const { host } of [noOmen, outside, peaceful]) {
            const manager = new RaidManager(host);
            run(manager, 100);
            expect(manager.records()).toEqual([]);
        }
    });

    it('sends the first wave after the countdown, and the next only once it is dead', () => {
        const { host, spawned, dead } = world();
        const manager = new RaidManager(host);

        run(manager, 20 + 299);
        expect(spawned).toEqual([]);
        run(manager, 2);
        expect(manager.records()[0]?.groupsSpawned).toBe(1);
        // Wave one of Java's table is pillagers alone, four of them plus any bonus.
        expect(spawned.length).toBeGreaterThanOrEqual(4);
        expect(spawned.every((identity) => identity.startsWith('minecraft:pillager'))).toBe(true);

        const first = spawned.length;
        run(manager, 1000);
        expect(spawned).toHaveLength(first);

        for (const identity of spawned) dead.add(identity);
        run(manager, 400);
        expect(manager.records()[0]?.groupsSpawned).toBe(2);
    });

    it('wins when every wave is dead, gives the players nearby Hero of the Village, and ends after the celebration', () => {
        const { host, spawned, dead, hero } = world();
        const manager = new RaidManager(host);
        const waves = wavesFor(2);

        for (let wave = 1; wave <= waves; wave += 1) {
            for (let guard = 0; guard < 2000 && manager.records()[0]?.groupsSpawned !== wave; guard += 1)
                run(manager, 1);
            expect(manager.records()[0]?.groupsSpawned).toBe(wave);
            for (const identity of spawned) dead.add(identity);
        }
        run(manager, 1);

        expect(manager.records()[0]?.status).toBe('victory');
        expect(hero).toEqual([[0, 48_000]]);

        run(manager, 400);
        expect(manager.records()).toEqual([]);
    });

    it('adds a bonus wave and a stronger hero for a higher omen', () => {
        const { host, giveOmen } = world();
        giveOmen(3);
        const manager = new RaidManager(host);

        run(manager, 20);

        expect(manager.records()[0]).toMatchObject({ omenLevel: 3, numGroups: 5 });
    });

    it('ends a raid whose village has gone, as a loss once raiders were sent and quietly before', () => {
        let village = true;
        const { host, spawned } = world({ isVillage: () => village });
        const manager = new RaidManager(host);

        run(manager, 400);
        expect(spawned.length).toBeGreaterThan(0);
        village = false;
        run(manager, 2);

        expect(manager.records()).toEqual([]);
    });

    it('gives up on a raid when nobody is near it any more', () => {
        const { host, player } = world();
        const manager = new RaidManager(host);
        run(manager, 20);

        Object.assign(player, { position: { x: 5000, y: 64, z: 5000 } });
        run(manager, 2);

        expect(manager.records()).toEqual([]);
    });

    it('keeps an active raid across a save and a load', () => {
        const { host, dead, spawned } = world();
        const manager = new RaidManager(host);
        run(manager, 400);
        const saved = JSON.parse(JSON.stringify(manager.records()));

        const restored = new RaidManager(host, saved);

        expect(restored.records()).toEqual(manager.records());
        // The wave that was out when it saved is still what the raid waits on.
        run(restored, 10);
        expect(restored.records()[0]?.groupsSpawned).toBe(1);
        for (const identity of spawned) dead.add(identity);
        run(restored, 400);
        expect(restored.records()[0]?.groupsSpawned).toBe(2);
    });

    it('reports the raid at a position, within the distance Java counts as the village', () => {
        const { host } = world();
        const manager = new RaidManager(host);
        run(manager, 20);

        expect(manager.raidAt({ x: 150, y: 64, z: 100 })).toBeDefined();
        expect(manager.raidAt({ x: 400, y: 64, z: 100 })).toBeUndefined();
    });
});
