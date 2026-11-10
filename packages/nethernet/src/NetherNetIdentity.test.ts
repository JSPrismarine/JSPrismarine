import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { isRecord } from './isRecord';
import { BEDROCK_CURVE } from './es384';
import { canonicalFingerprints, NetherNetIdentity } from './NetherNetIdentity';
import { sdpFingerprints } from './sdp';

/** An answer in the shape werift writes, trimmed to what the identity touches. */
const ANSWER = [
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

const part = (encoded: string): unknown => JSON.parse(Buffer.from(encoded, 'base64url').toString());

const es384Verifies = (signingInput: string, signature: string, key: ReturnType<typeof createPublicKey>) =>
    verify(
        'sha384',
        Buffer.from(signingInput),
        { key, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url')
    );

/**
 * What a NetherNet client does with the answer before it trusts it, as go-nethernet's
 * `RemoteIdentity` does: decode `a=identity`, read `cpk` from the token, check the token's
 * self-signature and expiry with it, then the detached signature over the answer's fingerprints.
 * @returns The `idp` and the token's claims.
 */
const clientVerifies = (answer: string, nowSeconds: number) => {
    const line = answer.split('\r\n').find((candidate) => candidate.startsWith('a=identity:'));
    if (line === undefined) throw new Error('no a=identity');
    const identity: unknown = JSON.parse(Buffer.from(line.slice('a=identity:'.length), 'base64').toString());
    if (!isRecord(identity) || typeof identity.assertion !== 'string') throw new Error('no assertion string');
    const assertion: unknown = JSON.parse(identity.assertion);
    if (!isRecord(assertion) || typeof assertion.token !== 'string' || typeof assertion.fingerprints !== 'string') {
        throw new Error('malformed assertion');
    }

    const [header, payload, signature] = assertion.token.split('.');
    const claims = part(payload!);
    if (!isRecord(claims) || !isRecord(claims.cpk) || typeof claims.exp !== 'number') throw new Error('no cpk');
    const { kty, crv, x, y } = claims.cpk;
    if (typeof kty !== 'string' || typeof crv !== 'string' || typeof x !== 'string' || typeof y !== 'string') {
        throw new Error('cpk is not an EC JWK');
    }
    const cpk = createPublicKey({ key: { kty, crv, x, y }, format: 'jwk' });
    if (!es384Verifies(`${header}.${payload}`, signature!, cpk)) throw new Error('token not self-signed');
    if (claims.exp < nowSeconds) throw new Error('token expired');

    const [fingerprintHeader, detached, fingerprintSignature] = assertion.fingerprints.split('.');
    if (detached !== '') throw new Error('fingerprints signature is not detached');
    const rebuilt = Buffer.from(canonicalFingerprints(sdpFingerprints(answer))).toString('base64url');
    if (!es384Verifies(`${fingerprintHeader}.${rebuilt}`, fingerprintSignature!, cpk)) {
        throw new Error('fingerprints not signed by cpk');
    }
    return { idp: identity.idp, header: part(header!), claims };
};

describe('NetherNetIdentity', () => {
    const now = 1_794_000_000_000;
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: BEDROCK_CURVE });

    it('signs an answer a NetherNet client accepts', () => {
        const signed = new NetherNetIdentity(privateKey, 'self', () => now).sign(ANSWER);

        const { idp, header, claims } = clientVerifies(signed, now / 1000);
        expect(idp).toStrictEqual({ domain: 'self', protocol: 'default' });
        expect(header).toMatchObject({ alg: 'ES384' });
        expect(claims).toMatchObject({ iat: now / 1000, exp: now / 1000 + 60, cpk: { kty: 'EC', crv: 'P-384' } });
    });

    it('fails a client check once the token has expired', () => {
        const signed = new NetherNetIdentity(privateKey, 'self', () => now).sign(ANSWER);

        expect(() => clientVerifies(signed, now / 1000 + 61)).toThrow('token expired');
    });

    it('fails a client check when the fingerprints were swapped after signing', () => {
        const signed = new NetherNetIdentity(privateKey, 'self', () => now).sign(ANSWER);

        expect(() => clientVerifies(signed.replace('3B:6F', '00:00'), now / 1000)).toThrow(
            'fingerprints not signed by cpk'
        );
    });

    it('puts a=identity at session level, before the media section', () => {
        const lines = new NetherNetIdentity(privateKey).sign(ANSWER).split('\r\n');

        expect(lines.findIndex((line) => line.startsWith('a=identity:'))).toBe(
            lines.findIndex((line) => line.startsWith('m=')) - 1
        );
    });

    it('refuses an answer with no fingerprint to sign', () => {
        expect(() => new NetherNetIdentity(privateKey).sign('v=0\r\nm=application 9 UDP/DTLS/SCTP x\r\n')).toThrow(
            'without a fingerprint'
        );
    });

    it('keeps one key across restarts, in a file only its owner can read', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-nethernet-identity-'));
        try {
            const file = path.join(directory, 'nethernet-identity.pem');
            const tokenKey = (identity: NetherNetIdentity) => {
                const { claims } = clientVerifies(identity.sign(ANSWER), Date.now() / 1000);
                return claims.cpk;
            };

            const first = tokenKey(NetherNetIdentity.loadOrCreate(file));
            const second = tokenKey(NetherNetIdentity.loadOrCreate(file));

            expect(second).toStrictEqual(first);
            if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);
        } finally {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });
});
