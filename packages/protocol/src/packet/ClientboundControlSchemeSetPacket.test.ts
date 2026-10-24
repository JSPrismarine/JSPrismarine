import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import { PacketIdentifier } from '../PacketIdentifier';
import { ControlScheme } from '../structure/CameraPreset';
import ClientboundControlSchemeSetPacket from './ClientboundControlSchemeSetPacket';

import type { ClientboundControlSchemeSet } from './ClientboundControlSchemeSetPacket';

/** Header bytes: 327 as a varuint32, both subclient ids zero. */
const HEADER = [0xc7, 0x02];

const CAMERA_RELATIVE: ClientboundControlSchemeSet = { controlScheme: ControlScheme.CAMERA_RELATIVE };

/** `CAMERA_RELATIVE` on the wire: the header, then the one `Control Scheme` byte. */
const CAMERA_RELATIVE_BYTES = Buffer.from([
    ...HEADER,
    0x01 // Control Scheme: camera_relative
]);

const encode = (data: ClientboundControlSchemeSet) => [
    ...new ClientboundControlSchemeSetPacket(data).serialize(new NetworkBinaryStream())
];

const decode = (bytes: Buffer) => {
    const stream = new NetworkBinaryStream(bytes);
    const data = new ClientboundControlSchemeSetPacket().deserialize(stream);
    return { data, stream };
};

describe('ClientboundControlSchemeSetPacket', () => {
    it('uses packet id 327', () => {
        expect(new ClientboundControlSchemeSetPacket().id).toBe(PacketIdentifier.CLIENTBOUND_CONTROL_SCHEME_SET);
        expect(new ClientboundControlSchemeSetPacket().id).toBe(327);
    });

    it('numbers the schemes as the docs do', () => {
        expect(ControlScheme.LOCKED_PLAYER_RELATIVE_STRAFE).toBe(0);
        expect(ControlScheme.CAMERA_RELATIVE).toBe(1);
        expect(ControlScheme.CAMERA_RELATIVE_STRAFE).toBe(2);
        expect(ControlScheme.PLAYER_RELATIVE).toBe(3);
        expect(ControlScheme.PLAYER_RELATIVE_STRAFE).toBe(4);
    });

    it('writes the scheme as one byte after the header', () => {
        expect(encode(CAMERA_RELATIVE)).toEqual([...CAMERA_RELATIVE_BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const { data, stream } = decode(CAMERA_RELATIVE_BYTES);

        expect(data).toEqual(CAMERA_RELATIVE);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips every scheme', () => {
        for (const controlScheme of [
            ControlScheme.LOCKED_PLAYER_RELATIVE_STRAFE,
            ControlScheme.CAMERA_RELATIVE,
            ControlScheme.CAMERA_RELATIVE_STRAFE,
            ControlScheme.PLAYER_RELATIVE,
            ControlScheme.PLAYER_RELATIVE_STRAFE
        ]) {
            const bytes = Buffer.from(encode({ controlScheme }));
            expect([...bytes]).toEqual([...HEADER, controlScheme]);

            const { data, stream } = decode(bytes);
            expect(data).toEqual({ controlScheme });
            expect(stream.feof()).toBe(true);
        }
    });
});
