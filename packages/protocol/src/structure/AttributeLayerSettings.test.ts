import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import AttributeLayerSettings from './AttributeLayerSettings';

/** Settings on the wire: Priority -2, Weight 1.5, Enabled, transitions running. */
const SETTINGS = Buffer.from([
    ...[0xfe, 0xff, 0xff, 0xff], // Priority -2, little-endian int32
    ...[0x00, 0x00, 0xc0, 0x3f], // Weight 1.5, little-endian float
    0x01, // Enabled
    0x00 // TransitionsPaused
]);

describe('AttributeLayerSettings', () => {
    it('writes priority, weight, then the two flags', () => {
        const stream = new NetworkBinaryStream();
        new AttributeLayerSettings(-2, 1.5, true, false).serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...SETTINGS]);
    });

    it('writes ten zero bytes by default', () => {
        const stream = new NetworkBinaryStream();
        new AttributeLayerSettings().serialize(stream);

        expect([...stream.getBuffer()]).toEqual(Array.from({ length: 10 }, () => 0x00));
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(SETTINGS);
        const settings = AttributeLayerSettings.deserialize(stream);

        expect(settings).toEqual(new AttributeLayerSettings(-2, 1.5, true, false));
        expect(stream.feof()).toBe(true);
    });
});
