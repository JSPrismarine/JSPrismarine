import { describe, expect, it } from 'vitest';

import { withLegacyStates, withoutLegacyStates } from './legacyStates';
import type { ScriptLegacyStates } from './world';

/** A slab as BDS's capture reports it: its half twice, under the old name and the new. */
const SLAB: ScriptLegacyStates = {
    defaults: { 'minecraft:vertical_half': 'bottom', top_slot_bit: false, wood_type: 'oak' },
    follows: {
        top_slot_bit: [{ state: 'minecraft:vertical_half', values: { bottom: false, top: true } }],
        'minecraft:vertical_half': [{ state: 'top_slot_bit', values: { false: 'bottom', true: 'top' } }]
    }
};

describe('legacy block states', () => {
    it('reads an old name from the state it mirrors, and a variant state as the type has it', () => {
        expect(withLegacyStates(SLAB, { 'minecraft:vertical_half': 'top' })).toEqual({
            'minecraft:vertical_half': 'top',
            top_slot_bit: true,
            wood_type: 'oak'
        });
    });

    it('turns an old name a script writes into the state the world keeps, and drops a variant state', () => {
        const kept = { 'minecraft:vertical_half': 'bottom' };

        expect(withoutLegacyStates(SLAB, kept, { top_slot_bit: true, wood_type: 'oak' })).toEqual({
            'minecraft:vertical_half': 'top'
        });
        // The new name wins when the script names both.
        expect(withoutLegacyStates(SLAB, kept, { 'minecraft:vertical_half': 'bottom', top_slot_bit: true })).toEqual({
            'minecraft:vertical_half': 'bottom'
        });
    });

    it('leaves a world without the table alone', () => {
        expect(withLegacyStates(undefined, { age: 1 })).toEqual({ age: 1 });
        expect(withoutLegacyStates(undefined, {}, { age: 1 })).toEqual({ age: 1 });
    });
});
