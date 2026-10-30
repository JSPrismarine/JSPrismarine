import { describe, expect, it } from 'vitest';
import SetDisplayObjectivePacket, { ObjectiveSortOrder } from './SetDisplayObjectivePacket';

const ENCODED = Buffer.concat([
    Buffer.from([0x6b]), // Header: id 107 as LEB128.
    Buffer.from([0x07]),
    Buffer.from('sidebar', 'utf8'), // DisplaySlotName.
    Buffer.from([0x03]),
    Buffer.from('obj', 'utf8'), // ObjectiveName.
    Buffer.from([0x03]),
    Buffer.from('Obj', 'utf8'), // ObjectiveDisplayName.
    Buffer.from([0x05]),
    Buffer.from('dummy', 'utf8'), // CriteriaName.
    Buffer.from([0x02]) // SortOrder Descending (1) as a ZigZag varint32.
]);

describe('SetDisplayObjectivePacket', () => {
    it('encodes the four strings then the sort order as a ZigZag varint32', () => {
        const packet = Object.assign(new SetDisplayObjectivePacket(), {
            displaySlotName: 'sidebar',
            objectiveName: 'obj',
            objectiveDisplayName: 'Obj',
            criteriaName: 'dummy',
            sortOrder: ObjectiveSortOrder.Descending
        });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new SetDisplayObjectivePacket(ENCODED);
        packet.decode();

        expect(packet.displaySlotName).toBe('sidebar');
        expect(packet.objectiveName).toBe('obj');
        expect(packet.objectiveDisplayName).toBe('Obj');
        expect(packet.criteriaName).toBe('dummy');
        expect(packet.sortOrder).toBe(ObjectiveSortOrder.Descending);
        expect(packet.feof()).toBe(true);
    });
});
