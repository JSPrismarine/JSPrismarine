import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import AddBehaviorTreePacket from './AddBehaviorTreePacket';

import type { AddBehaviorTree } from './AddBehaviorTreePacket';

const DATA: AddBehaviorTree = { behaviorTreeStructure: '{}' };
const BYTES = Buffer.from([0x59, 0x02, 0x7b, 0x7d]);

describe('AddBehaviorTreePacket', () => {
    it('writes the JSON string', () => {
        const buffer = new AddBehaviorTreePacket(DATA).serialize(new NetworkBinaryStream());

        expect(buffer).toEqual(BYTES);
    });

    it('reads a hand-built JSON string to the end of the packet', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new AddBehaviorTreePacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
