import { describe, expect, it } from 'vitest';

import type { EntityEnvironment, EntityInstance } from '../entityInstance';
import { EntityTypes } from '../entityTypes';
import { ATTACK_PEEK, IDLE_PEEK, peekAmount } from './peek';

/** `minecraft:peek` by Java's `ShulkerPeekGoal` and `ShulkerAttackGoal`. */

const definition = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:shell' },
        components: { 'minecraft:peek': {} }
    }
};

const spawn = (environment: EntityEnvironment): EntityInstance => {
    const types = new EntityTypes();
    types.load([{ data: definition, pack: 'vanilla', path: 'entities/test.json' }]);
    return types.spawn('test:shell', { environment });
};

describe('minecraft:peek', () => {
    it('peeks 30 on a winning roll of its every-other-tick check and closes after 20 to 60 ticks', () => {
        // Every draw is 0: the one-in-twenty roll wins and the peek lasts the shortest 20 ticks.
        const entity = spawn({ random: { next: () => 0 } });
        entity.tick();
        expect(peekAmount(entity)).toBe(0);
        entity.tick();
        expect(peekAmount(entity)).toBe(IDLE_PEEK);
        for (let tick = 0; tick < 19; tick += 1) entity.tick();
        expect(peekAmount(entity)).toBe(IDLE_PEEK);
        entity.tick();
        expect(peekAmount(entity)).toBe(0);
    });

    it('never peeks on a losing roll, and opens fully while it has a target', () => {
        let target: { id: number; distance: number; visible: boolean } | undefined;
        const entity = spawn({ random: { next: () => 0.5 }, targetProximity: () => target });
        for (let tick = 0; tick < 40; tick += 1) entity.tick();
        expect(peekAmount(entity)).toBe(0);
        target = { id: 1, distance: 4, visible: true };
        entity.tick();
        expect(peekAmount(entity)).toBe(ATTACK_PEEK);
        target = undefined;
        entity.tick();
        expect(peekAmount(entity)).toBe(0);
    });
});
