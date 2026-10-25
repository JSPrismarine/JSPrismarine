import { describe, expect, it } from 'vitest';

import { despawnReason } from './despawn';
import type { SpawnPosition, SpawnSiteFlag, SpawnWorld } from './world';

const baseWorld = {
    site: (flag: SpawnSiteFlag) => flag === 'surface',
    block: () => 'minecraft:stone',
    light: () => 15,
    biomeTags: () => [],
    biome: () => 'minecraft:plains',
    // Hollow: nothing here is about where a draw landed.
    solid: () => false,
    surfaceY: () => 64,
    minY: () => -64,
    players: () => [{ position: { x: 0, y: 64, z: 0 } }],
    poolCount: () => 0,
    typeCount: () => 0,
    difficulty: () => 'normal' as const,
    weather: () => 'clear' as const,
    age: () => 0,
    mobEventActive: () => false
} satisfies SpawnWorld;

const worldWith = (overrides: Partial<SpawnWorld>): SpawnWorld => ({ ...baseWorld, ...overrides });

const at = (x: number, y: number, z = 0): SpawnPosition => ({ x, y, z });

describe('the population cull', () => {
    it('keeps an entity near a player', () => {
        expect(despawnReason({ position: at(20, 64) }, baseWorld)).toBeUndefined();
    });

    it('culls an entity past the simulation edge', () => {
        expect(despawnReason({ position: at(400, 64) }, baseWorld)).toBe('simulation_edge');
    });

    it('culls everything when no player is loaded', () => {
        expect(despawnReason({ position: at(0, 64) }, worldWith({ players: () => [] }))).toBe('simulation_edge');
    });

    it('culls at and below the published Y floor of -128', () => {
        expect(despawnReason({ position: at(0, -127) }, baseWorld)).toBeUndefined();
        expect(despawnReason({ position: at(0, -128) }, baseWorld)).toBe('below_floor');
    });

    it('leaves a persistent entity alone', () => {
        expect(despawnReason({ position: at(400, -200), persistent: true }, baseWorld)).toBeUndefined();
    });
});
