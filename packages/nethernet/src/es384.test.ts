import { generateKeyPairSync } from 'node:crypto';
import { compactVerify, decodeProtectedHeader } from 'jose';
import { describe, expect, it } from 'vitest';

import { BEDROCK_CURVE, compactEs384, detachedEs384, verifiesDetachedEs384 } from './es384';

const keys = generateKeyPairSync('ec', { namedCurve: BEDROCK_CURVE });
const other = generateKeyPairSync('ec', { namedCurve: BEDROCK_CURVE });

describe('es384', () => {
    it('signs a compact JWS with ES384 and the extra header fields', async () => {
        const jws = await compactEs384({ x5u: 'key' }, { salt: 'abc' }, keys.privateKey);

        expect(decodeProtectedHeader(jws)).toStrictEqual({ alg: 'ES384', x5u: 'key' });
        const { payload } = await compactVerify(jws, keys.publicKey, { algorithms: ['ES384'] });
        expect(JSON.parse(Buffer.from(payload).toString())).toStrictEqual({ salt: 'abc' });
        // `r || s` is 96 bytes for P-384, where DER would be about 102 and vary.
        expect(Buffer.from(jws.split('.')[2]!, 'base64url')).toHaveLength(96);
    });

    it('signs a detached JWS over the exact payload bytes and leaves them out', async () => {
        const payload = '{"fingerprint":[{"algorithm":"sha-256","digest":"AB:CD"}]}';
        const jws = await detachedEs384(payload, keys.privateKey);

        expect(jws.split('.')[1]).toBe('');
        expect(await verifiesDetachedEs384(jws, payload, keys.publicKey)).toBe(true);
        expect(await verifiesDetachedEs384(jws, payload.replace('AB', '00'), keys.publicKey)).toBe(false);
        expect(await verifiesDetachedEs384(jws, payload, other.publicKey)).toBe(false);
        expect(await verifiesDetachedEs384(`${jws}.extra`, payload, keys.publicKey)).toBe(false);
    });
});
