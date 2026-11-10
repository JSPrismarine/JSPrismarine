import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { BEDROCK_CURVE } from './es384';
import { NetherNetIdentity, verifySelfSignedIdentity } from './NetherNetIdentity';

/** A description in the shape werift writes, trimmed to what the identity touches. */
const DESCRIPTION = [
    'v=0',
    'o=- 1 0 IN IP4 0.0.0.0',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=fingerprint:sha-256 3B:6F:00:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    'a=setup:active',
    'a=mid:0',
    'a=sctp-port:5000',
    ''
].join('\r\n');

/** The token's claims, read without checking anything. */
const claimsOf = (description: string): unknown => {
    const line = description.split('\r\n').find((candidate) => candidate.startsWith('a=identity:'))!;
    const identity = JSON.parse(Buffer.from(line.slice('a=identity:'.length), 'base64').toString());
    const { token } = JSON.parse(identity.assertion);
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
};

describe('NetherNetIdentity', () => {
    const now = 1_794_000_000_000;
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: BEDROCK_CURVE });

    it('signs an answer a NetherNet client accepts, with the key as a JWK', () => {
        const signed = new NetherNetIdentity(privateKey, { now: () => now }).sign(DESCRIPTION);

        const verified = verifySelfSignedIdentity(signed, now);
        expect(verified.domain).toBe('self');
        expect(verified.description).toBe(DESCRIPTION);
        expect(claimsOf(signed)).toMatchObject({
            iat: now / 1000,
            exp: now / 1000 + 60,
            cpk: { kty: 'EC', crv: 'P-384' }
        });
    });

    it('signs an offer the way a client does, with the key as base64 DER', () => {
        const identity = NetherNetIdentity.client('example.test');
        const signed = identity.sign(DESCRIPTION);

        const verified = verifySelfSignedIdentity(signed);
        expect(verified.domain).toBe('example.test');
        expect(claimsOf(signed)).toMatchObject({ cpk: expect.stringMatching(/^MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAE/) });
    });

    it('refuses an identity once its token has expired', () => {
        const signed = new NetherNetIdentity(privateKey, { now: () => now }).sign(DESCRIPTION);

        expect(() => verifySelfSignedIdentity(signed, now + 61_000)).toThrow('expired');
    });

    it('refuses an identity whose fingerprints were swapped after signing', () => {
        const signed = new NetherNetIdentity(privateKey, { now: () => now }).sign(DESCRIPTION);

        expect(() => verifySelfSignedIdentity(signed.replace('3B:6F', '00:00'), now)).toThrow(
            "does not sign this description's fingerprints"
        );
    });

    it('refuses a description with no identity at all', () => {
        expect(() => verifySelfSignedIdentity(DESCRIPTION)).toThrow('carries no a=identity');
    });

    it('puts a=identity at session level, before the media section', () => {
        const lines = new NetherNetIdentity(privateKey).sign(DESCRIPTION).split('\r\n');

        expect(lines.findIndex((line) => line.startsWith('a=identity:'))).toBe(
            lines.findIndex((line) => line.startsWith('m=')) - 1
        );
    });

    it('refuses to sign a description with no fingerprint', () => {
        expect(() => new NetherNetIdentity(privateKey).sign('v=0\r\nm=application 9 UDP/DTLS/SCTP x\r\n')).toThrow(
            'without a fingerprint'
        );
    });

    it('keeps one key across restarts, in a file only its owner can read', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-nethernet-identity-'));
        try {
            const file = path.join(directory, 'nethernet-identity.pem');
            const key = (identity: NetherNetIdentity) =>
                verifySelfSignedIdentity(identity.sign(DESCRIPTION)).publicKey.export({ format: 'jwk' });

            expect(key(NetherNetIdentity.loadOrCreate(file))).toStrictEqual(key(NetherNetIdentity.loadOrCreate(file)));
            if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);
        } finally {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });
});
