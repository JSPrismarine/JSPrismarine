import { describe, expect, expectTypeOf, it } from 'vitest';

import type { ChangeEntry, FieldEntry, StateEntry } from './ChangeEntry';
import { fieldKey, inverseOf } from './ChangeEntry';
import type { PlainData } from './PlainData';

const position: FieldEntry<'entity'> = {
    kind: 'field',
    field: 'entity',
    address: { entity: 7n, field: 'position' },
    before: new Float64Array([0, 64, 0]),
    after: new Float64Array([0.5, 64, 0])
};
const block: FieldEntry<'block'> = {
    kind: 'field',
    field: 'block',
    address: { x: 1, y: -60, z: 2, layer: 0 },
    before: 0,
    after: 12
};
const slot: FieldEntry<'inventory-slot'> = {
    kind: 'field',
    field: 'inventory-slot',
    address: { entity: 7n, container: 'inventory', slot: 3 },
    before: null,
    after: { id: 'minecraft:stone', count: 4 }
};
const sign: FieldEntry<'block-entity'> = {
    kind: 'field',
    field: 'block-entity',
    address: { x: 1, y: 70, z: 2, field: 'text' },
    before: '',
    after: 'hello'
};
const removal: StateEntry = {
    kind: 'membership',
    change: 'leave',
    entity: 9n,
    saved: { type: 'minecraft:zombie', health: 20, position: [1, 2, 3] }
};
const everyKind: readonly ChangeEntry[] = [
    position,
    block,
    slot,
    sign,
    removal,
    { kind: 'chunk', change: 'enter', x: -3, z: 4 },
    { kind: 'occurrence', occurrence: 'actor-event', data: { entity: 9n, event: 2, data: 0 } },
    {
        kind: 'occurrence',
        occurrence: 'emote',
        data: { entity: 7n, emote: 'wave', lengthTicks: 20, xuid: '', platformId: '', flags: 0 }
    }
];

describe('change entries', () => {
    it('survive a structured clone unchanged, for every kind', () => {
        for (const entry of everyKind) expect(structuredClone(entry)).toEqual(entry);
    });

    it('are plain data at the type level', () => {
        expectTypeOf<ChangeEntry>().toExtend<PlainData>();

        class Vector {
            public constructor(public readonly x: number) {}
            public length(): number {
                return Math.abs(this.x);
            }
        }
        const entity: FieldEntry<'entity'> = {
            kind: 'field',
            field: 'entity',
            address: { entity: 1n, field: 'position' },
            before: null,
            // @ts-expect-error a class instance with behavior is not plain data
            after: new Vector(1)
        };
        void entity;
    });

    it('narrow on the kind without casts', () => {
        const narrow = (entry: ChangeEntry): void => {
            if (entry.kind === 'field' && entry.field === 'block') {
                expectTypeOf(entry.after).toEqualTypeOf<number>();
                expectTypeOf(entry.address.layer).toEqualTypeOf<number>();
            }
            if (entry.kind === 'occurrence' && entry.occurrence === 'emote')
                expectTypeOf(entry.data.emote).toEqualTypeOf<string>();
        };
        for (const entry of everyKind) narrow(entry);
    });
});

describe('inverseOf', () => {
    it('writes the before-value back for a field', () => {
        expect(inverseOf(block)).toEqual({ ...block, before: 12, after: 0 });
    });

    it('adds a removed entity back from its saved form', () => {
        expect(inverseOf(removal)).toEqual({ ...removal, change: 'enter' });
    });

    it('undoes itself when applied twice', () => {
        for (const entry of [position, block, slot, sign, removal]) expect(inverseOf(inverseOf(entry))).toEqual(entry);
    });
});

describe('fieldKey', () => {
    it('is equal for the same field and different for another', () => {
        expect(fieldKey(block)).toBe(fieldKey({ ...block, after: 3 }));
        expect(fieldKey(block)).not.toBe(fieldKey({ ...block, address: { ...block.address, layer: 1 } }));
        expect(fieldKey(position)).not.toBe(fieldKey({ ...position, address: { entity: 7n, field: 'health' } }));
        expect(fieldKey(slot)).not.toBe(fieldKey({ ...slot, address: { ...slot.address, slot: 4 } }));
    });
});
