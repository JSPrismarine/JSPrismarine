import { ComponentRegistry } from '@jsprismarine/content';
import { describe, expect, it } from 'vitest';

import type { ComponentStateWrite } from '../componentState';
import { observing, tickThenUndo } from '../componentState.test.helper';
import type { EntityEnvironment, EntityInstance } from '../entityInstance';
import { EntityTypes } from '../entityTypes';
import type { EntityHooks, EntityStatusEffect } from '../hooks';
import { mobEffect } from './effects';

/** `minecraft:mob_effect`'s cooldown, asserted by the effects it applies and the state it keeps. */

const pufferfish = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:puffer' },
        components: {
            'minecraft:mob_effect': { mob_effect: 'poison', effect_range: 1, effect_time: 5, cooldown_time: 1 }
        }
    }
};

/** A world with one entity in range that records every effect applied to it. */
const world = () => {
    const applied: EntityStatusEffect[] = [];
    const environment: EntityEnvironment = {
        entitySensorCandidates: () => [{ view: {} }],
        effects: { applyStatusEffect: (_entity, _target, effect) => applied.push(effect) > 0 }
    };
    return { applied, environment };
};

const spawn = (environment: EntityEnvironment): EntityInstance => {
    // `DATA_COMPONENTS` claims `minecraft:mob_effect` before the default registry reaches this
    // factory, so the test builds a registry of the factory alone.
    const components = new ComponentRegistry<EntityHooks>();
    components.register(mobEffect);
    const types = new EntityTypes({ components });
    types.load([{ data: pufferfish, pack: 'vanilla', path: 'entities/test.json' }]);
    return types.spawn('test:puffer', { environment });
};

describe('minecraft:mob_effect state', () => {
    it('applies its effect once per cooldown', () => {
        const { applied, environment } = world();
        const entity = spawn(environment);
        for (let tick = 0; tick < 41; tick += 1) entity.tick();

        expect(applied.map((effect) => effect.id)).toEqual(['poison', 'poison', 'poison']);
    });

    it('reports its cooldown and undoes it exactly', () => {
        const { environment } = world();
        const writes: ComponentStateWrite[] = [];
        const entity = spawn(observing(writes, environment));
        const run = tickThenUndo(entity, writes, 5);

        expect(run.writes[0]).toEqual({
            component: 'minecraft:mob_effect',
            before: { cooldownTicks: 0 },
            after: { cooldownTicks: 19 }
        });
        expect(run.ticked).toEqual({ 'minecraft:mob_effect': { cooldownTicks: 15 } });
        expect(run.undone).toEqual(run.before);
    });
});
