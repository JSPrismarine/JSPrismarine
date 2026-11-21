import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, setDisplayObjectivePacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout. `SortOrder` is `Descending`, which a ZigZag varint writes as 2 and a
 * plain varint would write as 1.
 */
const BYTES = Buffer.from('0773696465626172036f626a055469746c650564756d6d7902', 'hex');

const payload = {
    displaySlotName: 'sidebar',
    objectiveName: 'obj',
    objectiveDisplayName: 'Title',
    criteriaName: 'dummy',
    sortOrder: 1
};

describe.each([2193, 2225])('the declarative SetDisplayObjective layout at %i', (protocol) => {
    const layout = layoutAt(setDisplayObjectivePacket, protocol);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
