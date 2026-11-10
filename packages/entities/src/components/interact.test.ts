import { describe, expect, it } from 'vitest';

import type { ComponentStateWrite } from '../componentState';
import { observing, tickThenUndo } from '../componentState.test.helper';
import type { EntityInstance } from '../entityInstance';
import { EntityTypes } from '../entityTypes';
import { interact } from './vanilla';

describe('minecraft:interact schema', () => {
    it('parses supported interaction fields and reports unsupported fields', () => {
        const result = interact.schema({
            interactions: [
                {
                    equip_item_slot: '1',
                    drop_item_slot: 'slot.armor.body',
                    drop_item_y_offset: 0.75,
                    give_item: true
                },
                {
                    interact_text: 'action.interact.test',
                    admire: true,
                    barter: true,
                    particle_on_start: { particle_type: 'heart' },
                    repair_entity_item: { amount: 3, slot: 'slot.weapon.mainhand' },
                    swing: false,
                    take_item: true
                }
            ]
        });

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('the valid interaction definitions were rejected');

        expect(result.value.interactions[0]).toMatchObject({
            equipItemSlot: '1',
            dropItemSlot: 'slot.armor.body',
            dropItemYOffset: 0.75,
            giveItem: true,
            unsupportedFields: []
        });
        expect(result.value.interactions[1]).toMatchObject({
            repairEntityItem: { amount: 3, slot: 'slot.weapon.mainhand' },
            takeItem: true,
            admire: true,
            barter: true,
            swing: false,
            particleOnStart: {
                particleType: 'heart',
                yOffset: 0,
                offsetTowardsInteractor: false
            },
            unsupportedFields: []
        });
    });
});

const cow = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:cow' },
        components: {
            'minecraft:health': { value: 10, max: 10 },
            'minecraft:interact': {
                interactions: [
                    {
                        on_interact: { event: 'test:milked', target: 'self' },
                        cooldown: 1,
                        cooldown_after_being_attacked: 2
                    }
                ]
            }
        },
        events: { 'test:milked': {} }
    }
};

const spawnCow = (writes: ComponentStateWrite[] = []): EntityInstance => {
    const types = new EntityTypes();
    types.load([{ data: cow, pack: 'vanilla', path: 'entities/cow.json' }]);
    return types.spawn('test:cow', { environment: observing(writes) });
};

const tick = (entity: EntityInstance, times: number): void => {
    for (let count = 0; count < times; count += 1) entity.tick();
};

describe('minecraft:interact cooldowns', () => {
    it('refuses an interaction during its cooldown and after a hurt', () => {
        const entity = spawnCow();

        expect(entity.interactWithItem('minecraft:bucket')).toBe(true);
        expect(entity.interactWithItem('minecraft:bucket')).toBe(false);
        tick(entity, 20);
        expect(entity.interactWithItem('minecraft:bucket')).toBe(true);

        tick(entity, 20);
        entity.damage({ cause: 'none', amount: 1 });
        tick(entity, 39);
        expect(entity.interactWithItem('minecraft:bucket')).toBe(false);
        tick(entity, 1);
        expect(entity.interactWithItem('minecraft:bucket')).toBe(true);
    });

    it('reports its cooldowns as writes and undoes them exactly', () => {
        const writes: ComponentStateWrite[] = [];
        const entity = spawnCow(writes);
        writes.length = 0;
        entity.interactWithItem('minecraft:bucket');

        expect(writes).toEqual([
            {
                component: 'minecraft:interact',
                before: { interactions: [0], attacked: [0] },
                after: { interactions: [20], attacked: [0] }
            }
        ]);

        const run = tickThenUndo(entity, writes, 5);

        expect(run.ticked).toEqual({ 'minecraft:interact': { interactions: [15], attacked: [0] } });
        expect(run.undone).toEqual(run.before);
    });

    it('writes nothing while every cooldown is idle', () => {
        const writes: ComponentStateWrite[] = [];
        const entity = spawnCow(writes);

        expect(tickThenUndo(entity, writes, 20).writes).toEqual([]);
    });
});
