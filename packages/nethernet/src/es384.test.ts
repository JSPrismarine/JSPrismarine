import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { BEDROCK_CURVE, compactEs384, detachedEs384, verifiesEs384 } from './es384';

const keys = generateKeyPairSync('ec', { namedCurve: BEDROCK_CURVE });

const verifies = (header: string, payload: string, signature: string): boolean =>
    verifiesEs384(`${header}.${payload}`, signature, keys.publicKey);

const json = (part: string): unknown => JSON.parse(Buffer.from(part, 'base64url').toString());

describe('es384', () => {
    it('signs a compact JWS with ES384 and the extra header fields', () => {
        const [header, payload, signature] = compactEs384({ x5u: 'key' }, { salt: 'abc' }, keys.privateKey).split('.');

        expect(json(header!)).toStrictEqual({ alg: 'ES384', x5u: 'key' });
        expect(json(payload!)).toStrictEqual({ salt: 'abc' });
        // `r || s` is 96 bytes for P-384, where DER would be about 102 and vary.
        expect(Buffer.from(signature!, 'base64url')).toHaveLength(96);
        expect(verifies(header!, payload!, signature!)).toBe(true);
    });

    it('signs a detached JWS over the exact payload bytes and leaves them out', () => {
        const payload = '{"fingerprint":[{"algorithm":"sha-256","digest":"AB:CD"}]}';
        const [header, empty, signature] = detachedEs384(payload, keys.privateKey).split('.');

        expect(json(header!)).toStrictEqual({ alg: 'ES384' });
        expect(empty).toBe('');
        expect(verifies(header!, Buffer.from(payload).toString('base64url'), signature!)).toBe(true);
    });
});
