import { describe, expect, it } from 'vitest';

import { GoalHarness, testMob } from '../harness';

/** The looking family, which holds the `look` flag and nothing else. */

describe('minecraft:behavior.look_at_player', () => {
    it('claims only the look flag and points the head at the nearest player', () => {
        const player = testMob('player', { x: 3, y: 0, z: 0 });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.look_at_player': { priority: 7, look_distance: 6, probability: 1 } },
            world: { players: () => [player] }
        });

        harness.tick();

        expect(harness.holderOf('look')).toBe('minecraft:behavior.look_at_player');
        expect(harness.holderOf('move')).toBeUndefined();
        expect(harness.actuator.log).toContain('lookAt 3,0,0');
    });

    it('does not start when the probability roll fails', () => {
        const player = testMob('player', { x: 3, y: 0, z: 0 });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.look_at_player': { priority: 7, probability: 0.02 } },
            world: { players: () => [player] },
            random: () => 0.5
        });

        harness.tick(5);

        expect(harness.running()).toEqual([]);
    });

    it('does not start when no player is in range', () => {
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.look_at_player': { priority: 7, probability: 1 } },
            world: { players: () => [] }
        });

        harness.tick();

        expect(harness.running()).toEqual([]);
    });
});

describe('minecraft:behavior.random_look_around', () => {
    it('looks somewhere on the unit circle for the drawn time', () => {
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.random_look_around': { priority: 8 } },
            random: () => 0.01
        });

        harness.tick(3);

        expect(harness.holderOf('look')).toBe('minecraft:behavior.random_look_around');
        expect(harness.actuator.count('lookAt')).toBe(3);
    });
});

describe('minecraft:behavior.look_at_trading_player', () => {
    it('watches whoever has the trade screen open', () => {
        const player = testMob('player', { x: 2, y: 0, z: 1 });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.look_at_trading_player': { priority: 2 } },
            world: { tradingPlayer: () => player }
        });

        harness.tick();

        expect(harness.actuator.log).toContain('lookAt 2,0,1');
    });

    it('does nothing when nobody is trading', () => {
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.look_at_trading_player': { priority: 2 } },
            world: {}
        });

        harness.tick();

        expect(harness.actuator.count('lookAt')).toBe(0);
    });
});

describe('minecraft:behavior.look_at_entity', () => {
    it('only looks at an entity its filters accept', () => {
        const cat = testMob('cat', { x: 2, y: 0, z: 0 }, { families: ['cat'] });
        const cow = testMob('cow', { x: 1, y: 0, z: 0 }, { families: ['cow'] });
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.look_at_entity': {
                    priority: 10,
                    look_distance: 6,
                    probability: 1,
                    filters: { test: 'is_family', subject: 'other', value: 'cat' }
                }
            },
            world: { mobs: () => [cow, cat] }
        });

        harness.tick();

        expect(harness.actuator.log).toContain('lookAt 2,0,0');
    });
});
