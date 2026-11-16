import { describe, expect, it } from 'vitest';

import type { ComponentStateWrite } from '../componentState';
import { observing, tickThenUndo } from '../componentState.test.helper';
import type { EntityEnvironment, EntityInstance } from '../entityInstance';
import { EntityTypes } from '../entityTypes';
import type { EntityStatusEffect } from '../hooks';

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

// The default registry, which is what a server spawns from.
const spawn = (environment: EntityEnvironment): EntityInstance => {
    const types = new EntityTypes();
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

describe('minecraft:spell_effects', () => {
    it('removes before it adds, so an effect named in both lists is refreshed rather than ended', () => {
        // The bee's feeding groups add poison or wither and name the same effect under remove_effects.
        const active = new Map<string, number>();
        const environment: EntityEnvironment = {
            effects: {
                applyStatusEffect: (_entity, _target, effect) => active.set(effect.id, effect.durationTicks).size > 0,
                removeStatusEffect: (_entity, _target, identifier) => active.delete(identifier)
            }
        };
        const types = new EntityTypes();
        types.load([
            {
                data: {
                    format_version: '1.26.50',
                    'minecraft:entity': {
                        description: { identifier: 'test:bee' },
                        components: {
                            'minecraft:spell_effects': {
                                add_effects: [{ effect: 'poison', duration: 25 }],
                                remove_effects: 'poison'
                            }
                        }
                    }
                },
                pack: 'vanilla',
                path: 'entities/bee.json'
            }
        ]);
        types.spawn('test:bee', { environment });

        expect([...active]).toEqual([['poison', 25 * 20]]);
    });
});
