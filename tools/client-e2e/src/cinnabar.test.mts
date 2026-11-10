import { describe, expect, it } from 'vitest';

import { parseTransport, pinMatrix, pinName, readPin, servedProtocols } from './cinnabar.mts';

describe('cinnabar pins', () => {
    it('names a RakNet pin by its protocol and a NetherNet pin apart from it', () => {
        expect(pinName({ protocol: 2225, transport: 'raknet' })).toBe('v2225');
        expect(pinName({ protocol: 2225, transport: 'nethernet' })).toBe('v2225-nethernet');
    });

    it('defaults the transport to RakNet and refuses an unknown one', () => {
        expect(parseTransport(undefined)).toBe('raknet');
        expect(parseTransport('nethernet')).toBe('nethernet');
        expect(() => parseTransport('udp')).toThrow('--transport must be raknet or nethernet');
    });

    it('lists a build for every served protocol, each under a cache name of its own', () => {
        const matrix = pinMatrix();

        for (const protocol of servedProtocols()) {
            expect(matrix.some((pin) => pin.protocol === protocol)).toBe(true);
        }
        expect(new Set(matrix.map((pin) => pin.name)).size).toBe(matrix.length);
        for (const pin of matrix) {
            expect(readPin(pin).commit).toBe(pin.commit);
            expect(pin.name).toBe(pinName(pin));
        }
    });

    it('keeps only the newest protocol for a latest-only run', () => {
        const newest = servedProtocols().at(-1);

        expect(pinMatrix(true).every((pin) => pin.protocol === newest)).toBe(true);
    });
});
