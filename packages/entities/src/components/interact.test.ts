import { describe, expect, it } from 'vitest';

import { interact } from './vanilla';

describe('minecraft:interact schema', () => {
    it('parses supported interaction fields and reports fields it does not run', () => {
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
                    repair_entity_item: { amount: 1, slot: 'slot.weapon.mainhand' },
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
        expect(result.value.interactions[1]?.unsupportedFields).toEqual([
            'admire',
            'barter',
            'particle_on_start',
            'repair_entity_item',
            'swing',
            'take_item'
        ]);
    });
});
