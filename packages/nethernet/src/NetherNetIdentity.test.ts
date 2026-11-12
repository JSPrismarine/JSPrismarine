import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { BEDROCK_CURVE } from './es384';
import { identityProofOf, NetherNetIdentity, provesKey, verifySelfSignedIdentity } from './NetherNetIdentity';

/** A description in the shape a WebRTC stack writes, trimmed to what the identity touches. */
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

    it('signs an answer a NetherNet client accepts, with the key as a JWK', async () => {
        const signed = await new NetherNetIdentity(privateKey, { now: () => now }).sign(DESCRIPTION);

        const verified = await verifySelfSignedIdentity(signed, now);
        expect(verified.domain).toBe('self');
        expect(verified.description).toBe(DESCRIPTION);
        expect(claimsOf(signed)).toMatchObject({
            iat: now / 1000,
            exp: now / 1000 + 60,
            cpk: { kty: 'EC', crv: 'P-384' }
        });
    });

    it('signs an offer the way a client does, with the key as base64 DER', async () => {
        const identity = NetherNetIdentity.client('example.test');
        const signed = await identity.sign(DESCRIPTION);

        const verified = await verifySelfSignedIdentity(signed);
        expect(verified.domain).toBe('example.test');
        expect(claimsOf(signed)).toMatchObject({ cpk: expect.stringMatching(/^MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAE/) });
    });

    it("carries an authority's token instead of signing one, and still signs the fingerprints", async () => {
        // A signed-in client: its multiplayer token names its key, issued by Minecraft's services.
        const issued = 'eyJhbGciOiJSUzI1NiJ9.eyJjcGsiOiJrZXkifQ.signature';
        const signed = await new NetherNetIdentity(privateKey, { keyFormat: 'der', token: issued }).sign(DESCRIPTION);

        const line = signed.split('\r\n').find((candidate) => candidate.startsWith('a=identity:'))!;
        const identity = JSON.parse(Buffer.from(line.slice('a=identity:'.length), 'base64').toString());
        const assertion = JSON.parse(identity.assertion);
        expect(assertion.token).toBe(issued);
        expect(assertion.fingerprints).toMatch(/^[\w-]+\.\.[\w-]+$/);
    });

    it('refuses an identity once its token has expired', async () => {
        const signed = await new NetherNetIdentity(privateKey, { now: () => now }).sign(DESCRIPTION);

        await expect(verifySelfSignedIdentity(signed, now + 61_000)).rejects.toThrow('expired');
    });

    it('refuses an identity whose fingerprints were swapped after signing', async () => {
        const signed = await new NetherNetIdentity(privateKey, { now: () => now }).sign(DESCRIPTION);

        await expect(verifySelfSignedIdentity(signed.replace('3B:6F', '00:00'), now)).rejects.toThrow(
            "does not sign this description's fingerprints"
        );
    });

    it.each([
        ['an identity that is not an object', '"text"', 'has no assertion'],
        ['an assertion that is not a token and fingerprints', { assertion: '{}', idp: {} }, 'assertion is malformed'],
        [
            'a token with no key in it',
            {
                assertion: JSON.stringify({
                    token: `${Buffer.from('{}').toString('base64url')}.${Buffer.from('{"exp":1}').toString('base64url')}.x`,
                    fingerprints: 'a..b'
                }),
                idp: {}
            },
            'no usable cpk claim'
        ]
    ])('refuses %s', async (_name, identity, reason) => {
        const value = typeof identity === 'string' ? identity : JSON.stringify(identity);
        const forged = DESCRIPTION.replace(
            'm=application',
            `a=identity:${Buffer.from(value).toString('base64')}\r\nm=application`
        );

        await expect(verifySelfSignedIdentity(forged)).rejects.toThrow(reason);
    });

    it('refuses a token signed by a key other than the one it names', async () => {
        const { privateKey: other } = generateKeyPairSync('ec', { namedCurve: BEDROCK_CURVE });
        const genuine = await new NetherNetIdentity(privateKey, { now: () => now }).sign(DESCRIPTION);
        const impostor = await new NetherNetIdentity(other, { now: () => now }).sign(DESCRIPTION);
        const identityOf = (description: string) =>
            JSON.parse(
                Buffer.from(
                    description
                        .split('\r\n')
                        .find((line) => line.startsWith('a=identity:'))!
                        .slice(11),
                    'base64'
                ).toString()
            );
        // The genuine token's claims, carrying the genuine key, under the impostor's signature.
        const [, claims] = JSON.parse(identityOf(genuine).assertion).token.split('.');
        const [header, , signature] = JSON.parse(identityOf(impostor).assertion).token.split('.');
        const forgedAssertion = {
            ...JSON.parse(identityOf(genuine).assertion),
            token: `${header}.${claims}.${signature}`
        };
        const forged = genuine.replace(
            /a=identity:\S+/,
            `a=identity:${Buffer.from(JSON.stringify({ ...identityOf(genuine), assertion: JSON.stringify(forgedAssertion) })).toString('base64')}`
        );

        await expect(verifySelfSignedIdentity(forged, now)).rejects.toThrow('not signed by its own key');
    });

    describe('a proof of the key behind a description', () => {
        const der = (key: typeof privateKey): string =>
            createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64');
        const other = generateKeyPairSync('ec', { namedCurve: BEDROCK_CURVE }).privateKey;

        it('proves the key that signed the fingerprints, and no other', async () => {
            const proof = identityProofOf(
                await new NetherNetIdentity(privateKey, { keyFormat: 'der' }).sign(DESCRIPTION)
            );

            expect(proof).toBeDefined();
            expect(await provesKey(proof!, der(privateKey))).toBe(true);
            expect(await provesKey(proof!, der(other))).toBe(false);
            expect(await provesKey(proof!, 'not a key')).toBe(false);
        });

        it("proves the key under an authority's token, which a signed-in client carries", async () => {
            const issued = new NetherNetIdentity(privateKey, { keyFormat: 'der', token: 'issued.by.authority' });

            expect(await provesKey(identityProofOf(await issued.sign(DESCRIPTION))!, der(privateKey))).toBe(true);
        });

        it("proves nothing once the fingerprint is another certificate's", async () => {
            const signed = await new NetherNetIdentity(privateKey, { keyFormat: 'der' }).sign(DESCRIPTION);
            const swapped = signed.replace('a=fingerprint:sha-256 3B:6F', 'a=fingerprint:sha-256 00:00');

            expect(await provesKey(identityProofOf(swapped)!, der(privateKey))).toBe(false);
        });

        it.each([
            ['no identity', DESCRIPTION],
            [
                'an identity that is not an assertion',
                DESCRIPTION.replace('m=application', 'a=identity:bm9wZQ==\r\nm=application')
            ]
        ])('has none for a description with %s', (_name, description) => {
            expect(identityProofOf(description)).toBeUndefined();
        });
    });

    it('refuses a description with no identity at all', async () => {
        await expect(verifySelfSignedIdentity(DESCRIPTION)).rejects.toThrow('carries no a=identity');
    });

    it('puts a=identity at session level, before the media section', async () => {
        const lines = (await new NetherNetIdentity(privateKey).sign(DESCRIPTION)).split('\r\n');

        expect(lines.findIndex((line) => line.startsWith('a=identity:'))).toBe(
            lines.findIndex((line) => line.startsWith('m=')) - 1
        );
    });

    it('refuses to sign a description with no fingerprint', async () => {
        await expect(
            new NetherNetIdentity(privateKey).sign('v=0\r\nm=application 9 UDP/DTLS/SCTP x\r\n')
        ).rejects.toThrow('without a fingerprint');
    });

    it('keeps one key across restarts, in a file only its owner can read', async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-nethernet-identity-'));
        try {
            const file = path.join(directory, 'nethernet-identity.pem');
            const key = async (identity: NetherNetIdentity) =>
                (await verifySelfSignedIdentity(await identity.sign(DESCRIPTION))).publicKey.export({ format: 'jwk' });

            expect(await key(NetherNetIdentity.loadOrCreate(file))).toStrictEqual(
                await key(NetherNetIdentity.loadOrCreate(file))
            );
            if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);
        } finally {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });
});
