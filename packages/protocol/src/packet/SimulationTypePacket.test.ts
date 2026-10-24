import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import SimulationTypePacket, { SimulationType } from './SimulationTypePacket';

import type { SimulationTypeData } from './SimulationTypePacket';

const DATA: SimulationTypeData = {
    simType: SimulationType.Test
};

/** `DATA` on the wire, header byte included. */
const BYTES = Buffer.from([
    ...[0xa8, 0x01], // packet id header, 168 as a varuint32
    0x02 // Sim Type, uint8: Test
]);

describe('SimulationTypePacket', () => {
    it('writes the header and the one enum byte', () => {
        const buffer = new SimulationTypePacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new SimulationTypePacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips every enum member', () => {
        for (const simType of [
            SimulationType.Game,
            SimulationType.Editor,
            SimulationType.Test,
            SimulationType.Invalid
        ]) {
            const buffer = new SimulationTypePacket({ simType }).serialize(new NetworkBinaryStream());
            const data = new SimulationTypePacket().deserialize(new NetworkBinaryStream(buffer));

            expect(data).toEqual({ simType });
        }
    });
});
