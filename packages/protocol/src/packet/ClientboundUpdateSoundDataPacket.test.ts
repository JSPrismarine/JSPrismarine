import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ClientboundUpdateSoundDataPacket, { SoundDataUpdateType } from './ClientboundUpdateSoundDataPacket';

import type { ClientboundUpdateSoundData } from './ClientboundUpdateSoundDataPacket';

/** Every slot holding the alternative it is named after, so each alternative's fields are on the wire once. */
const DATA: ClientboundUpdateSoundData = {
    serverSoundHandle: 0x0102030405060708n,
    stop: { type: SoundDataUpdateType.Stop },
    setVolume: { type: SoundDataUpdateType.SetVolume, volume: 0.5 },
    setPitch: { type: SoundDataUpdateType.SetPitch, pitch: 1 },
    fade: { type: SoundDataUpdateType.Fade, duration: 2, targetVolume: 0.25 },
    seekTo: { type: SoundDataUpdateType.SeekTo, seconds: 1.5 },
    pause: { type: SoundDataUpdateType.Pause },
    resume: { type: SoundDataUpdateType.Resume }
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xdc, 0x02], // packet id header: 348 as a varuint32
    ...[0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01], // Server Sound Handle, little-endian uint64
    0x00, // Stop slot: alternative 0, no fields
    ...[0x01, 0x00, 0x00, 0x00, 0x3f], // SetVolume slot: alternative 1, Volume 0.5 as a little-endian float32
    ...[0x02, 0x00, 0x00, 0x80, 0x3f], // SetPitch slot: alternative 2, Pitch 1.0
    ...[0x03, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x80, 0x3e], // Fade slot: alternative 3, Duration 2.0 then Target Volume 0.25
    ...[0x04, 0x00, 0x00, 0xc0, 0x3f], // SeekTo slot: alternative 4, Seconds 1.5
    0x05, // Pause slot: alternative 5, no fields
    0x06 // Resume slot: alternative 6, no fields
]);

/** The same alternative in every slot: the slot names do not constrain what a slot carries. */
const STOP_EVERYWHERE: ClientboundUpdateSoundData = {
    serverSoundHandle: 7n,
    stop: { type: SoundDataUpdateType.Stop },
    setVolume: { type: SoundDataUpdateType.Stop },
    setPitch: { type: SoundDataUpdateType.Stop },
    fade: { type: SoundDataUpdateType.Stop },
    seekTo: { type: SoundDataUpdateType.Stop },
    pause: { type: SoundDataUpdateType.Stop },
    resume: { type: SoundDataUpdateType.Stop }
};

/** `STOP_EVERYWHERE` on the wire: the header, the handle, then seven zero alternative indexes. */
const STOP_EVERYWHERE_BYTES = Buffer.from([
    ...[0xdc, 0x02],
    ...[0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    ...[0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
]);

describe('ClientboundUpdateSoundDataPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new ClientboundUpdateSoundDataPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ClientboundUpdateSoundDataPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes a slot as the alternative it holds, whatever the slot is named', () => {
        const buffer = new ClientboundUpdateSoundDataPacket(STOP_EVERYWHERE).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...STOP_EVERYWHERE_BYTES]);
    });

    it('reads seven Stop slots to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(STOP_EVERYWHERE_BYTES);

        expect(new ClientboundUpdateSoundDataPacket().deserialize(stream)).toEqual(STOP_EVERYWHERE);
        expect(stream.feof()).toBe(true);
    });

    it('rejects an alternative index past Resume', () => {
        const stream = new NetworkBinaryStream(
            Buffer.from([0xdc, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x07])
        );

        expect(() => new ClientboundUpdateSoundDataPacket().deserialize(stream)).toThrow(/alternative 7/);
    });
});
