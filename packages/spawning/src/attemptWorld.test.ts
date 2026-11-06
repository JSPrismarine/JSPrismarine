import { describe, expect, it, vi } from 'vitest';

import { attemptWorldOf } from './attemptWorld';
import type { SpawnPosition, SpawnSiteFlag, SpawnWorld } from './world';

const world = (overrides: Partial<SpawnWorld> = {}): SpawnWorld => ({
    site: (flag: SpawnSiteFlag, at: SpawnPosition) => flag === 'surface' && at.y >= 64,
    block: (at: SpawnPosition) => (at.y <= 63 ? 'minecraft:grass_block' : 'minecraft:air'),
    solid: (at: SpawnPosition) => at.y === 63,
    light: (at: SpawnPosition) => at.y % 16,
    biomeTags: () => ['plains'],
    surfaceY: () => 64,
    minY: () => -64,
    players: () => [],
    poolCount: () => 0,
    typeCount: () => 3,
    difficulty: () => 'normal',
    weather: () => 'clear',
    age: () => 0,
    mobEventActive: () => false,
    ...overrides
});

const AT = { x: 4, y: 64, z: 9 } as const;

describe('attemptWorldOf', () => {
    it('reads each fact about a position from the world once, however often it is asked', () => {
        const light = vi.fn((at: SpawnPosition) => at.y % 16);
        const block = vi.fn(() => 'minecraft:grass_block');
        const site = vi.fn(() => true);
        const view = attemptWorldOf(world({ light, block, site }));
        view.begin(AT);

        for (let rule = 0; rule < 25; rule++) {
            expect(view.light(AT)).toBe(0);
            expect(view.block({ x: 4, y: 63, z: 9 })).toBe('minecraft:grass_block');
            expect(view.site('underwater', AT)).toBe(true);
            expect(view.site('lava', AT)).toBe(true);
        }

        expect(light).toHaveBeenCalledOnce();
        expect(block).toHaveBeenCalledOnce();
        expect(site).toHaveBeenCalledTimes(2);
        expect(view.misses).toBe(4);
    });

    it('keeps density counts apart by identifier, center and radius', () => {
        const typeCount = vi.fn(
            (identifier: string, at: SpawnPosition, radius: number) => at.x + radius + identifier.length
        );
        const view = attemptWorldOf(world({ typeCount }));
        view.begin(AT);

        const first = view.typeCount('minecraft:cow', AT, 16);
        expect(view.typeCount('minecraft:cow', AT, 16)).toBe(first);
        view.typeCount('minecraft:pig', AT, 16);
        view.typeCount('minecraft:cow', AT, 32);
        view.typeCount('minecraft:cow', { ...AT, x: 5 }, 16);

        expect(typeCount).toHaveBeenCalledTimes(4);
    });

    it('answers a position it has not seen from the world, and never from another position', () => {
        const view = attemptWorldOf(world());
        view.begin({ x: 0, y: 0, z: 0 });

        expect(view.light({ x: 0, y: 5, z: 0 })).toBe(5);
        expect(view.light({ x: 0, y: 6, z: 0 })).toBe(6);
        expect(view.solid({ x: 0, y: 63, z: 0 })).toBe(true);
        expect(view.solid({ x: 0, y: 64, z: 0 })).toBe(false);
    });

    it('leaves optional members absent when the world has none, and caches them when it has them', () => {
        expect(attemptWorldOf(world()).biome).toBeUndefined();
        expect(attemptWorldOf(world()).villageBorderDistance).toBeUndefined();

        const biome = vi.fn(() => 'minecraft:plains');
        const view = attemptWorldOf(world({ biome }));
        view.begin(AT);
        view.biome?.(AT);
        view.biome?.(AT);
        expect(biome).toHaveBeenCalledOnce();
    });

    it('forgets everything when the next attempt begins', () => {
        let brightness = 3;
        const view = attemptWorldOf(world({ light: () => brightness }));
        view.begin(AT);
        expect(view.light(AT)).toBe(3);

        brightness = 9;
        expect(view.light(AT)).toBe(3);
        view.begin(AT);
        expect(view.light(AT)).toBe(9);
    });

    it('reads another column from the world instead of answering with this one', () => {
        const light = vi.fn((at: SpawnPosition) => at.x);
        const view = attemptWorldOf(world({ light }));
        view.begin(AT);

        expect(view.light(AT)).toBe(4);
        expect(view.light({ ...AT, x: 7 })).toBe(7);
        expect(view.light({ ...AT, x: 7 })).toBe(7);
        expect(light).toHaveBeenCalledTimes(3);
    });

    it('does not cache what a call can change between attempts', () => {
        let count = 0;
        const view = attemptWorldOf(world({ poolCount: () => ++count }));
        view.begin(AT);

        expect(view.poolCount('monster')).toBe(1);
        expect(view.poolCount('monster')).toBe(2);
    });
});
