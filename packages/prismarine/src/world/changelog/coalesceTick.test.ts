import { describe, expect, it } from 'vitest';

import type { ChangeEntry, FieldEntry } from './ChangeEntry';
import { ChangeLog } from './ChangeLog';
import type { SealedTick } from './ChangeLog';
import { coalesceTick } from './coalesceTick';

const entityField = (entity: bigint, field: string, before: number, after: number): FieldEntry<'entity'> => ({
    kind: 'field',
    field: 'entity',
    address: { entity, field },
    before,
    after
});
const blockSet = (x: number, layer: number, before: number, after: number): FieldEntry<'block'> => ({
    kind: 'field',
    field: 'block',
    address: { x, y: 64, z: 0, layer },
    before,
    after
});

const sealedWith = (entries: readonly ChangeEntry[]): SealedTick => {
    const log = new ChangeLog();
    log.begin(7);
    for (const entry of entries) log.append(entry);
    return log.seal();
};

describe('coalesceTick', () => {
    it('reads an idle tick as no changes', () => {
        const changes = coalesceTick(sealedWith([]));
        expect(changes.tick).toBe(7);
        expect(changes.entities.size).toBe(0);
        expect(changes.fields).toEqual({});
        expect([changes.memberships, changes.chunks, changes.occurrences]).toEqual([[], [], []]);
    });

    it('keeps one final value per entity field when an entity is written twice', () => {
        const changes = coalesceTick(
            sealedWith([
                entityField(1n, 'x', 0, 1),
                entityField(2n, 'x', 0, 5),
                entityField(1n, 'x', 1, 2),
                entityField(1n, 'health', 20, 18)
            ])
        );

        expect([...changes.entities.keys()]).toEqual([1n, 2n]);
        const first = changes.entities.get(1n);
        expect([...(first?.keys() ?? [])]).toEqual(['x', 'health']);
        expect(first?.get('x')?.after).toBe(2);
        expect(first?.get('health')?.after).toBe(18);
        expect(changes.entities.get(2n)?.get('x')?.after).toBe(5);
    });

    it('keeps N final values for N entities written once each', () => {
        const entries = Array.from({ length: 30 }, (_, index) => entityField(BigInt(index), 'x', 0, index));
        expect(coalesceTick(sealedWith(entries)).entities.size).toBe(30);
    });

    it('keeps the last write to each block, per layer', () => {
        const changes = coalesceTick(
            sealedWith([blockSet(0, 0, 0, 1), blockSet(0, 1, 0, 8), blockSet(0, 0, 1, 2), blockSet(3, 0, 0, 4)])
        );

        expect(
            [...(changes.fields.block?.values() ?? [])].map(({ address, after }) => [address.x, address.layer, after])
        ).toEqual([
            [0, 0, 2],
            [0, 1, 8],
            [3, 0, 4]
        ]);
        expect(changes.fields['block-entity']).toBeUndefined();
    });

    it('keeps memberships, chunks and occurrences in order', () => {
        const hurt: ChangeEntry = {
            kind: 'occurrence',
            occurrence: 'actor-event',
            data: { entity: 1n, event: 2, data: 0 }
        };
        const swing: ChangeEntry = { kind: 'occurrence', occurrence: 'animate', data: { entity: 1n, action: 1 } };
        const enter: ChangeEntry = { kind: 'membership', change: 'enter', entity: 3n, saved: { health: 4 } };
        const leave: ChangeEntry = { kind: 'membership', change: 'leave', entity: 1n, saved: { health: 0 } };
        const chunk: ChangeEntry = { kind: 'chunk', change: 'enter', x: 1, z: 1 };

        const changes = coalesceTick(sealedWith([swing, enter, chunk, hurt, entityField(3n, 'x', 0, 1), leave]));
        expect(changes.occurrences).toEqual([swing, hurt]);
        expect(changes.memberships).toEqual([enter, leave]);
        expect(changes.chunks).toEqual([chunk]);
        expect(changes.entities.get(3n)?.get('x')?.after).toBe(1);
    });
});
