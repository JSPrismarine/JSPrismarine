import { describe, expect, it } from 'vitest';

import { sdpFingerprints, withoutIdentity, withSessionAttribute } from './sdp';

const OFFER = [
    'v=0',
    'a=identity:abc',
    'a=fingerprint:sha-256 AA:BB',
    'm=application 9 UDP/DTLS/SCTP x',
    'a=mid:0',
    ''
].join('\r\n');

describe('sdp', () => {
    it('reads every fingerprint, session or media level, in order', () => {
        const sdp = `${OFFER}a=fingerprint:sha-384 CC:DD\r\n`;

        expect(sdpFingerprints(sdp)).toStrictEqual([
            { algorithm: 'sha-256', digest: 'AA:BB' },
            { algorithm: 'sha-384', digest: 'CC:DD' }
        ]);
    });

    it('removes the identity WebRTC does not know, keeping CRLF line ends', () => {
        expect(withoutIdentity(OFFER)).toBe(
            ['v=0', 'a=fingerprint:sha-256 AA:BB', 'm=application 9 UDP/DTLS/SCTP x', 'a=mid:0', ''].join('\r\n')
        );
    });

    it('reads a description with bare LF line ends the same way', () => {
        expect(withoutIdentity(OFFER.replaceAll('\r\n', '\n'))).toBe(withoutIdentity(OFFER));
    });

    it('adds a session attribute before the first media section, or at the end without one', () => {
        expect(withSessionAttribute('v=0\r\nm=x\r\n', 'a=new')).toBe('v=0\r\na=new\r\nm=x\r\n');
        expect(withSessionAttribute('v=0\r\n', 'a=new')).toBe('v=0\r\na=new\r\n');
    });
});
