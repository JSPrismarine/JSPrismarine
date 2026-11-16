import { describe, expect, it } from 'vitest';

import type { EntityEnvironment, EntityInstance } from '../entityInstance';
import { EntityTypes } from '../entityTypes';
import type { EntityStatusEffect } from '../hooks';

/** `minecraft:combat_regeneration`, as Java's axolotl rewards the player who kills its target. */

const definition = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:helper' },
        components: { 'minecraft:combat_regeneration': {}, 'minecraft:type_family': { family: ['axolotl'] } }
    }
};

const spawn = (environment: EntityEnvironment): EntityInstance => {
    const types = new EntityTypes();
    types.load([{ data: definition, pack: 'vanilla', path: 'entities/test.json' }]);
    return types.spawn('test:helper', { environment });
};

describe('minecraft:combat_regeneration', () => {
    it('gives a player who kills its target Regeneration for 100 ticks, and nothing to another mob', () => {
        const applied: { target: number | undefined; effect: EntityStatusEffect }[] = [];
        const entity = spawn({
            effects: {
                applyStatusEffect: (_entity, target, effect) => applied.push({ target: target.id?.(), effect }) > 0,
                removeStatusEffect: () => true
            }
        });
        entity.notifyAttackTargetKilled({
            id: () => 2,
            names: (name) => (name === 'is_family' ? ['zombie'] : undefined)
        });
        entity.notifyAttackTargetKilled({
            id: () => 7,
            names: (name) => (name === 'is_family' ? ['player'] : undefined)
        });

        expect(applied).toEqual([
            { target: 7, effect: { id: 'minecraft:regeneration', durationTicks: 100, amplifier: 0 } }
        ]);
    });
});
