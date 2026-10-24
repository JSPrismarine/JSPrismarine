import { ContainerUiId } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import FullContainerName from './FullContainerName';

/** A dynamic container with id 0x01020304: the name byte, a true presence byte, then the id little-endian. */
const DYNAMIC_BYTES = Buffer.from([0x3f, 0x01, 0x04, 0x03, 0x02, 0x01]);

/** A barrel with no dynamic id: the name byte and a false presence byte. */
const STATIC_BYTES = Buffer.from([0x3a, 0x00]);

describe('FullContainerName', () => {
    it('writes a dynamic id as a presence byte and a little-endian uint32', () => {
        const stream = new NetworkBinaryStream();
        new FullContainerName(ContainerUiId.DYNAMIC_CONTAINER, 0x01020304).serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...DYNAMIC_BYTES]);
    });

    it('writes a missing dynamic id as a single false byte', () => {
        const stream = new NetworkBinaryStream();
        new FullContainerName(ContainerUiId.BARREL_CONTAINER).serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...STATIC_BYTES]);
    });

    it('reads a dynamic id, which is unsigned, to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(Buffer.from([0x3f, 0x01, 0xfe, 0xff, 0xff, 0xff]));
        const name = FullContainerName.deserialize(stream);

        expect(name).toEqual(new FullContainerName(ContainerUiId.DYNAMIC_CONTAINER, 0xfffffffe));
        expect(stream.feof()).toBe(true);
    });

    it('reads a missing dynamic id as null', () => {
        const stream = new NetworkBinaryStream(STATIC_BYTES);
        const name = FullContainerName.deserialize(stream);

        expect(name).toEqual(new FullContainerName(ContainerUiId.BARREL_CONTAINER, null));
        expect(stream.feof()).toBe(true);
    });
});
