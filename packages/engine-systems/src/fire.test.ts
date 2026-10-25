import { beforeEach, describe, expect, it } from 'vitest';

import { burnOddsOf, igniteOddsOf } from './blockRules';
import { FIRE, FIRE_AGE_STATE, FIRE_TICK_DELAY_MIN, canBurn, fireTick, isValidFireLocation } from './fire';
import type { TestEngine } from './testing';
import { createTestEngine } from './testing';
import type { BlockPosition } from './world';
import { block } from './world';

const at = (x: number, y = 1, z = 0): BlockPosition => ({ x, y, z });
const planks = block('minecraft:oak_planks');
const stone = block('minecraft:stone');
const fire = (age = 0) => block(FIRE, { [FIRE_AGE_STATE]: age });

describe('flammability', () => {
    it('takes the jar odds out of the mapping table rather than its own list', () => {
        // The pairs `FireBlock.bootStrap` installs in the 26.3 jar.
        expect([igniteOddsOf(planks), burnOddsOf(planks)]).toEqual([5, 20]);
        expect([igniteOddsOf(block('minecraft:oak_leaves')), burnOddsOf(block('minecraft:oak_leaves'))]).toEqual([
            30, 60
        ]);
        expect([igniteOddsOf(block('minecraft:tnt')), burnOddsOf(block('minecraft:tnt'))]).toEqual([15, 100]);
        expect([igniteOddsOf(block('minecraft:hay_block')), burnOddsOf(block('minecraft:hay_block'))]).toEqual([
            60, 20
        ]);
        expect(canBurn(stone)).toBe(false);
    });
});

describe('fire tick', () => {
    let test: TestEngine;

    beforeEach(() => {
        // Every random draw returns 0, so each roll that can succeed does.
        test = createTestEngine();
    });

    it('schedules its next tick 30 to 40 ticks out, never sooner', () => {
        test.world.place(at(0, 0, 0), stone);
        test.world.place(at(0), fire());
        test.world.place(at(1), planks);

        fireTick(test.engine.updates, test.world, at(0));

        expect(test.world.hasScheduledTick('block', at(0), FIRE)).toBe(true);
        test.runGameTicks(FIRE_TICK_DELAY_MIN - 1);
        expect(test.world.hasScheduledTick('block', at(0), FIRE)).toBe(true);
    });

    it('lights the flammable blocks around it', () => {
        test.world.place(at(0, 0, 0), stone);
        test.world.place(at(0), fire());
        test.world.place({ x: 1, y: 1, z: 0 }, planks);
        test.world.place({ x: 0, y: 2, z: 0 }, planks);

        fireTick(test.engine.updates, test.world, at(0));

        // Both planks burned away and became fire of their own.
        expect(test.world.nameAt({ x: 1, y: 1, z: 0 })).toBe(FIRE);
        expect(test.world.nameAt({ x: 0, y: 2, z: 0 })).toBe(FIRE);
    });

    it('leaves stone alone, because its burn odds are zero', () => {
        test.world.place(at(0, 0, 0), stone);
        test.world.place(at(0), fire());
        test.world.place({ x: 0, y: 1, z: 1 }, planks);
        test.world.place(at(1), stone);

        fireTick(test.engine.updates, test.world, at(0));

        expect(test.world.nameAt(at(1))).toBe('minecraft:stone');
        expect(test.world.nameAt({ x: 0, y: 1, z: 1 })).toBe(FIRE);
    });

    it('goes out once it has no fuel and has aged past 3', () => {
        test.world.place(at(0, 0, 0), stone);
        test.world.place(at(0), fire(4));

        expect(isValidFireLocation(test.world, at(0))).toBe(false);
        fireTick(test.engine.updates, test.world, at(0));

        expect(test.world.nameAt(at(0))).toBe('minecraft:air');
    });

    it('stays while young on a solid floor even with no fuel', () => {
        test.world.place(at(0, 0, 0), stone);
        test.world.place(at(0), fire(2));

        fireTick(test.engine.updates, test.world, at(0));

        expect(test.world.nameAt(at(0))).toBe(FIRE);
    });

    it('goes out at full age over a block that does not burn', () => {
        test.world.place(at(0, 0, 0), stone);
        test.world.place(at(0), fire(15));
        test.world.place(at(1), planks);

        fireTick(test.engine.updates, test.world, at(0));

        expect(test.world.nameAt(at(0))).toBe('minecraft:air');
    });

    it('is put out by rain falling on it', () => {
        test = createTestEngine({ weather: 'rain' });
        test.world.place(at(0, 0, 0), stone);
        test.world.place(at(0), fire());
        test.world.place(at(1), planks);

        fireTick(test.engine.updates, test.world, at(0));

        expect(test.world.nameAt(at(0))).toBe('minecraft:air');
    });

    it('burns forever on netherrack, the overworld infinite fire source', () => {
        test.world.place(at(0, 0, 0), block('minecraft:netherrack'));
        test.world.place(at(0), fire(15));

        fireTick(test.engine.updates, test.world, at(0));

        expect(test.world.nameAt(at(0))).toBe(FIRE);
    });

    it('spreads on hard where it fails on easy, through the difficulty id times 7', () => {
        // `(igniteOdds + 40 + difficultyId * 7) / (age + 30)` with hay's ignite
        // odds of 60 and age 0 gives 3 on easy and 4 on hard, so a draw of 4
        // against the denominator of 100 separates the two.
        const litTheGap = (difficulty: 'easy' | 'hard'): boolean => {
            const run = createTestEngine({ difficulty, randomInt: (bound) => (bound === 100 ? 4 : 0) });
            run.world.place(at(0, 0, 0), stone);
            run.world.place(at(0), fire());
            run.world.place({ x: 0, y: 1, z: 1 }, planks);
            run.world.place(at(2), block('minecraft:hay_block'));
            fireTick(run.engine.updates, run.world, at(0));
            return run.world.nameAt(at(1)) === FIRE;
        };

        expect(litTheGap('hard')).toBe(true);
        expect(litTheGap('easy')).toBe(false);
    });
});
