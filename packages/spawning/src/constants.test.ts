import { describe, expect, it } from 'vitest';

import { SPAWN_CONSTANTS, poolCapFor } from './constants';
import { POPULATION_POOLS } from './rules';

describe('the constants table', () => {
    it('carries one entry per population pool', () => {
        for (const pool of POPULATION_POOLS) expect(SPAWN_CONSTANTS.pools[pool]).toBeDefined();
    });

    it('states where every number came from', () => {
        for (const pool of POPULATION_POOLS) expect(SPAWN_CONSTANTS.pools[pool]?.source.length).toBeGreaterThan(20);
        expect(SPAWN_CONSTANTS.provenance).toContain('Mojang publishes no spawn attempt rate');
        expect(SPAWN_CONSTANTS.minimumSpawnDistance).toBe(24);
        expect(SPAWN_CONSTANTS.minimumSpawnDistanceSource).toContain(
            'NaturalSpawner.isRightDistanceToPlayerAndSpawnPoint'
        );
    });

    it('scales a per-player cap with the player count and leaves a regional cap alone', () => {
        expect(poolCapFor('animal', 3, SPAWN_CONSTANTS)).toBe(30);
        expect(poolCapFor('monster', 3, SPAWN_CONSTANTS)).toBe(70);
    });

    it('reports no cap for the pools the documentation leaves to the patrol machinery', () => {
        expect(poolCapFor('pillager', 3, SPAWN_CONSTANTS)).toBeUndefined();
    });

    it('treats a pool no table entry names as uncapped', () => {
        expect(poolCapFor('bees', 1, SPAWN_CONSTANTS)).toBeUndefined();
    });
});
