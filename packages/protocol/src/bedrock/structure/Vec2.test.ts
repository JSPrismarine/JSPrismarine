import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../../NetworkBinaryStream';
import type NetworkStructure from '../../NetworkStructure';
import BlockPos from './BlockPos';
import Vec2 from './Vec2';
import Vec3 from './Vec3';

const roundTrip = <T extends Vec2>(value: T, blank: T): T => {
    const stream = new BinaryStream();
    value.write(stream);
    blank.read(new BinaryStream(stream.getBuffer()));
    return blank;
};

describe('vector structures', () => {
    it('round-trip through a plain BinaryStream', () => {
        expect(roundTrip(new Vec2(1.5, -2), new Vec2(0, 0))).toEqual(new Vec2(1.5, -2));
        expect(roundTrip(new Vec3(1.5, -2, 3.25), new Vec3(0, 0, 0))).toEqual(new Vec3(1.5, -2, 3.25));
        expect(roundTrip(new BlockPos(-4, 64, 12), new BlockPos(0, 0, 0))).toEqual(new BlockPos(-4, 64, 12));
    });

    it('write the documented wire layout', () => {
        const floats = new BinaryStream();
        new Vec3(1, 2, 3).write(floats);
        expect(floats.getBuffer()).toEqual(Buffer.from([0, 0, 0x80, 0x3f, 0, 0, 0, 0x40, 0, 0, 0x40, 0x40]));

        const varints = new BinaryStream();
        new BlockPos(-1, 64, 1).write(varints);
        expect(varints.getBuffer()).toEqual(Buffer.from([0x01, 0x80, 0x01, 0x02]));
    });

    it('serialize through the NetworkStructure type with the same bytes as write', () => {
        const vectors: Vec2[] = [new Vec2(1, 2), new Vec3(1, 2, 3), new BlockPos(-4, 64, 12)];
        for (const vector of vectors) {
            const structure: NetworkStructure = vector;
            const network = new NetworkBinaryStream();
            structure.serialize(network);
            const plain = new BinaryStream();
            vector.write(plain);
            expect(network.getBuffer()).toEqual(plain.getBuffer());
        }
    });
});
