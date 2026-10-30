import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, levelChunkPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import LevelChunkPacket from './LevelChunkPacket';

/**
 * The declarative layout must produce the same bytes as the classes it replaces, at both
 * versions, before anything switches over to it. The old 2225 sibling class wrote the 2193
 * fields and then one trailing Is Client Biome Update boolean; the 2193 class wrote the
 * seven documented fields.
 */
describe('the declarative LevelChunk layout against the packet class it replaces', () => {
    const fill = (packet: LevelChunkPacket): LevelChunkPacket => {
        packet.chunkX = 4;
        packet.chunkZ = -3;
        packet.dimension = 1;
        packet.subChunkCount = 2;
        packet.data = Buffer.from([1, 2, 3]);
        return packet;
    };

    const payload = {
        chunkX: 4,
        chunkZ: -3,
        dimension: 1,
        subChunkRequest: { clientRequestsEnabled: false, count: 2 },
        cacheEnabled: false,
        cacheBlobIds: [],
        data: Buffer.from([1, 2, 3]),
        isClientBiomeUpdate: true
    };

    it('matches the 2193 class byte for byte', () => {
        const classPacket = fill(new LevelChunkPacket());
        classPacket.encodePayload();

        const stream = new BinaryStream();
        layoutAt(levelChunkPacket, 2193).encode(stream, payload);

        expect(stream.getBuffer()).toEqual(classPacket.getBuffer());
    });

    it('matches the 2193 class in sub-chunk request mode', () => {
        const classPacket = fill(new LevelChunkPacket());
        classPacket.clientSubChunkRequestsEnabled = true;
        classPacket.encodePayload();

        const stream = new BinaryStream();
        layoutAt(levelChunkPacket, 2193).encode(stream, {
            ...payload,
            subChunkRequest: { clientRequestsEnabled: true, count: 2 }
        });

        expect(stream.getBuffer()).toEqual(classPacket.getBuffer());
    });

    it('appends exactly the trailing Is Client Biome Update boolean at 2225', () => {
        const base = new BinaryStream();
        layoutAt(levelChunkPacket, 2193).encode(base, payload);

        const extended = new BinaryStream();
        layoutAt(levelChunkPacket, 2225).encode(extended, payload);

        expect(extended.getBuffer()).toEqual(Buffer.concat([base.getBuffer(), Buffer.from([1])]));
    });

    it('decodes what the class encoded, at the version the class speaks', () => {
        const classPacket = fill(new LevelChunkPacket());
        classPacket.encodePayload();

        const read = layoutAt(levelChunkPacket, 2193).decode(new BinaryStream(classPacket.getBuffer()));
        expect(read).toEqual({ ...payload, isClientBiomeUpdate: false });
    });
});
