import { describe, expect, it } from 'vitest';

import type { ContentEntity, ContentPosition } from '../../content/world/adapter';
import { PhantomSpawner } from './phantomSpawner';
import type { PhantomSpawnWorld } from './phantomSpawner';

/** A world at midnight on normal difficulty, with every random draw at `draw` of its range. */
const night = (
    players: readonly ContentEntity[],
    options: { readonly draw?: number; readonly skyDarken?: number; readonly canSeeSky?: boolean } = {}
) => {
    const spawned: ContentPosition[] = [];
    const draw = options.draw ?? 0.99;
    const world: PhantomSpawnWorld = {
        random: { nextFloat: () => 0, nextInt: (bound) => Math.floor(draw * bound) },
        spawnsPhantoms: () => true,
        hasSkyLight: () => true,
        seaLevel: () => 63,
        skyDarken: () => options.skyDarken ?? 11,
        players: () => players,
        canSeeSky: () => options.canSeeSky ?? true,
        regionalDifficulty: () => 1.5,
        difficultyId: () => 2,
        isValidEmptySpawnBlock: () => true,
        spawnPhantom: (at) => spawned.push(at)
    };
    return { world, spawned };
};

const player = (timeSinceRest: number, rest: Partial<ContentEntity> = {}): ContentEntity => ({
    id: 1,
    identifier: 'minecraft:player',
    position: { x: 0.5, y: 70, z: 0.5 },
    timeSinceRest,
    ...rest
});

describe('PhantomSpawner', () => {
    it('sends a group overhead to a player three days without rest, and none to a rested one', () => {
        const sleepless = night([player(200_000)]);
        new PhantomSpawner().tick(sleepless.world);
        // One plus a draw up to normal's id of 2, 20 to 34 blocks up.
        expect(sleepless.spawned).toHaveLength(3);
        expect(sleepless.spawned[0]?.y).toBe(70 + 20 + 14);

        const rested = night([player(71_999)]);
        new PhantomSpawner().tick(rested.world);
        expect(rested.spawned).toEqual([]);
    });

    it('looks again only after its 60 to 119 second countdown', () => {
        const { world, spawned } = night([player(200_000)], { draw: 0 });
        // A draw of 0 refuses the rest check, so only the countdown is under test.
        const spawner = new PhantomSpawner();
        let looks = 0;
        const counting: PhantomSpawnWorld = {
            ...world,
            skyDarken: () => {
                looks += 1;
                return 11;
            }
        };
        // The first look comes at once and sets the countdown to 1200 from -1, as Java's starts at 0.
        for (let tick = 0; tick < 1199; tick += 1) spawner.tick(counting);
        expect(looks).toBe(1);
        spawner.tick(counting);
        expect(looks).toBe(2);
        expect(spawned).toEqual([]);
    });

    it('spares a spectator, a player under cover or below sea level, and everyone while the sky is light', () => {
        for (const [players, options] of [
            [[player(200_000, { spectator: true })], {}],
            [[player(200_000)], { canSeeSky: false }],
            [[player(200_000, { position: { x: 0, y: 40, z: 0 } })], {}],
            [[player(200_000)], { skyDarken: 4 }]
        ] as const) {
            const { world, spawned } = night(players, options);
            new PhantomSpawner().tick(world);
            expect(spawned).toEqual([]);
        }
    });
});
