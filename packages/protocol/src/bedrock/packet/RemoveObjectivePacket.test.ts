import { describe, expect, it } from 'vitest';
import RemoveObjectivePacket from './RemoveObjectivePacket';

const ENCODED = Buffer.concat([
    Buffer.from([0x6a]), // Header: id 106 as LEB128.
    Buffer.from([0x03, 0x6f, 0x62, 0x6a]) // Objective Name "obj".
]);

describe('RemoveObjectivePacket', () => {
    it('encodes the objective name as a length prefixed string', () => {
        const packet = Object.assign(new RemoveObjectivePacket(), { objectiveName: 'obj' });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('decodes the objective name and consumes the whole buffer', () => {
        const packet = new RemoveObjectivePacket(ENCODED);
        packet.decode();

        expect(packet.objectiveName).toBe('obj');
        expect(packet.feof()).toBe(true);
    });
});
