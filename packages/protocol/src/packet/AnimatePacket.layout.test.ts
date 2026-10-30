import { animatePacket, layoutAt } from '@jsprismarine/protocol';
import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import AnimatePacket from './AnimatePacket';

/**
 * The declarative layout must produce the same bytes as the classes it replaces, at both
 * versions, before anything switches over to it. The old 2225 sibling class wrote the 2193
 * fields and then one trailing Hand byte; the 2193 class wrote the four documented fields.
 */
describe('the declarative Animate layout against the packet class it replaces', () => {
    const fill = (packet: AnimatePacket): AnimatePacket => {
        packet.action = 1;
        packet.runtimeEntityId = 42n;
        packet.data = 1.5;
        packet.swingSource = 'attack';
        return packet;
    };

    const payload = { action: 1, runtimeEntityId: 42n, data: 1.5, swingSource: 'attack', hand: 1 };

    it('matches the 2193 class byte for byte', () => {
        const classPacket = fill(new AnimatePacket());
        classPacket.encodePayload();

        const stream = new BinaryStream();
        layoutAt(animatePacket, 2193).encode(stream, payload);

        expect(stream.getBuffer()).toEqual(classPacket.getBuffer());
    });

    it('matches the 2193 class with the swing source absent', () => {
        const classPacket = fill(new AnimatePacket());
        classPacket.swingSource = null;
        classPacket.encodePayload();

        const stream = new BinaryStream();
        layoutAt(animatePacket, 2193).encode(stream, { ...payload, swingSource: null });

        expect(stream.getBuffer()).toEqual(classPacket.getBuffer());
    });

    it('appends exactly the trailing Hand byte at 2225', () => {
        const base = new BinaryStream();
        layoutAt(animatePacket, 2193).encode(base, payload);

        const extended = new BinaryStream();
        layoutAt(animatePacket, 2225).encode(extended, payload);

        expect(extended.getBuffer()).toEqual(Buffer.concat([base.getBuffer(), Buffer.from([1])]));
    });

    it('decodes what the class encoded, at the version the class speaks', () => {
        const classPacket = fill(new AnimatePacket());
        classPacket.encodePayload();

        const read = layoutAt(animatePacket, 2193).decode(new BinaryStream(classPacket.getBuffer()));
        expect(read).toEqual({ ...payload, hand: 0 });
    });
});
