import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../../NetworkBinaryStream';
import CurrentStructureFeaturePacket from '../../packet/CurrentStructureFeaturePacket';
import { layoutAt } from '../WireLayout';
import { currentStructureFeaturePacket } from './currentStructureFeature';

/** A serialized packet without its id header, which is what the layout describes. */
const bodyOf = (buffer: Buffer): Buffer => {
    const stream = new BinaryStream(buffer);
    stream.readUnsignedVarInt();
    return stream.readRemaining();
};

describe('the declarative CurrentStructureFeature layout', () => {
    for (const currentStructureFeature of ['', 'minecraft:village']) {
        it(`writes the bytes the packet class writes for "${currentStructureFeature}"`, () => {
            const classBytes = bodyOf(
                new CurrentStructureFeaturePacket({ currentStructureFeature }).serialize(new NetworkBinaryStream())
            );
            const stream = new BinaryStream();
            layoutAt(currentStructureFeaturePacket, 2193).encode(stream, { currentStructureFeature });

            expect(stream.getBuffer()).toEqual(classBytes);
        });

        it(`reads back "${currentStructureFeature}"`, () => {
            const stream = new BinaryStream();
            layoutAt(currentStructureFeaturePacket, 2225).encode(stream, { currentStructureFeature });
            const read = new BinaryStream(stream.getBuffer());

            expect(layoutAt(currentStructureFeaturePacket, 2225).decode(read)).toEqual({ currentStructureFeature });
            expect(read.feof()).toBe(true);
        });
    }
});
