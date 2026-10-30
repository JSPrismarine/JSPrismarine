import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import Vec3 from '../structure/Vec3';
import SpawnExperienceOrbPacket from './SpawnExperienceOrbPacket';

import type { SpawnExperienceOrb } from './SpawnExperienceOrbPacket';

const DATA: SpawnExperienceOrb = { position: new Vec3(1.5, 2, 3), xpValue: 5 };
const BYTES = Buffer.from([0x42, 0x00, 0x00, 0xc0, 0x3f, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x40, 0x40, 0x0a]);

describe('SpawnExperienceOrbPacket', () => {
    it('writes the position and experience value', () => {
        const buffer = new SpawnExperienceOrbPacket(DATA).serialize(new NetworkBinaryStream());

        expect(buffer).toEqual(BYTES);
    });

    it('reads a hand-built packet to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new SpawnExperienceOrbPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
