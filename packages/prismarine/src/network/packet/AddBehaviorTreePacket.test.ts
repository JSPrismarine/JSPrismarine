import { describe, expect, it } from 'vitest';
import AddBehaviorTreePacket from './AddBehaviorTreePacket';

describe('AddBehaviorTreePacket', () => {
    // One Buffer per docs field, in wire order.
    const encoded = Buffer.concat([
        Buffer.from([0x59]), // Header, packet 89
        Buffer.from([0x02]),
        Buffer.from('{}') // Behavior Tree Structure (JSON)
    ]);

    it('decodes the tree and consumes the whole buffer', () => {
        const packet = new AddBehaviorTreePacket(encoded);
        packet.decode();

        expect(packet.behaviorTreeStructure).toBe('{}');
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = new AddBehaviorTreePacket();
        packet.behaviorTreeStructure = '{}';
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
