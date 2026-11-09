import { generateKeyPairSync, sign } from 'node:crypto';

import type { KeyObject } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { Login } from '@jsprismarine/protocol/packet/LoginPacket';

import type { LoginKeySource } from './LoginVerifier';
import { LoginRefused, MojangKeys, TOKEN_ISSUER, verifyLogin } from './LoginVerifier';

const NOW = 1_800_000_000_000;
const KID = 'test-key';

const issuer = generateKeyPairSync('rsa', { modulusLength: 2048 });
const client = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
const clientKey = client.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

const keys = (known: Record<string, KeyObject> = { [KID]: issuer.publicKey }): LoginKeySource => ({
    keyFor: async (kid) => known[kid]
});

const b64 = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

/** A token signed the way Minecraft services signs one, with claims a test can bend. */
const token = (
    claims: Record<string, unknown> = {},
    { header = {}, key = issuer.privateKey }: { header?: Record<string, unknown>; key?: KeyObject } = {}
): string => {
    const head = b64({ alg: 'RS256', kid: KID, ...header });
    const body = b64({
        iss: TOKEN_ISSUER,
        exp: NOW / 1000 + 3600,
        xid: '2535400000000001',
        xname: 'Steve',
        cpk: clientKey,
        ...claims
    });
    const signature = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url');
    return `${head}.${body}.${signature}`;
};

/** Client data signed by the account key, as a client signs its own. */
const clientData = (privateKey: KeyObject = client.privateKey, claims: Record<string, unknown> = {}): string => {
    const head = b64({ alg: 'ES384', x5u: clientKey });
    const body = b64({ ThirdPartyName: 'Steve', ...claims });
    const signature = sign('sha384', Buffer.from(`${head}.${body}`), { key: privateKey, dsaEncoding: 'ieee-p1363' });
    return `${head}.${body}.${signature.toString('base64url')}`;
};

const login = (request: Record<string, unknown>, data = clientData()): Login => ({
    protocolVersion: 2193,
    chainData: JSON.stringify(request),
    clientData: data
});

const full = (tokenText = token()): Login => login({ AuthenticationType: 0, Token: tokenText });

const refusal = async (attempt: Promise<unknown>): Promise<string> => {
    try {
        await attempt;
    } catch (error: unknown) {
        if (error instanceof LoginRefused) return error.detail;
        throw error;
    }
    throw new Error('the login was accepted');
};

describe('verifyLogin', () => {
    it('accepts a token the issuer signed and client data its key signed', async () => {
        const verified = await verifyLogin(full(token({ leguuid: 'a-uuid' })), keys(), NOW);

        expect(verified).toEqual({
            xuid: '2535400000000001',
            displayName: 'Steve',
            identity: 'a-uuid',
            identityPublicKey: clientKey
        });
    });

    it('refuses a token whose claims were changed after it was signed', async () => {
        const [head, , signature] = token().split('.');
        const forged = `${head}.${b64({ iss: TOKEN_ISSUER, exp: NOW / 1000 + 3600, xid: '1', xname: 'Notch', cpk: clientKey })}.${signature}`;

        expect(await refusal(verifyLogin(full(forged), keys(), NOW))).toContain('signature');
    });

    it('refuses a token signed by a key the issuer did not publish', async () => {
        const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 });

        expect(await refusal(verifyLogin(full(token({}, { key: stranger.privateKey })), keys(), NOW))).toContain(
            'signature'
        );
        expect(await refusal(verifyLogin(full(token({}, { header: { kid: 'other' } })), keys(), NOW))).toContain(
            'unknown token key'
        );
    });

    it('does not let a token pick its own algorithm', async () => {
        expect(await refusal(verifyLogin(full(token({}, { header: { alg: 'none' } })), keys(), NOW))).toContain(
            'algorithm'
        );
        expect(await refusal(verifyLogin(full(token({}, { header: { alg: 'HS256' } })), keys(), NOW))).toContain(
            'algorithm'
        );
    });

    it('refuses an expired token, a foreign issuer and one missing its account', async () => {
        expect(await refusal(verifyLogin(full(token({ exp: NOW / 1000 - 1 })), keys(), NOW))).toContain('expired');
        expect(await refusal(verifyLogin(full(token({ iss: 'https://example.com/' })), keys(), NOW))).toContain(
            'issuer'
        );
        expect(await refusal(verifyLogin(full(token({ xid: undefined })), keys(), NOW))).toContain('lacks');
        expect(await refusal(verifyLogin(full(token({ nbf: NOW / 1000 + 3600 })), keys(), NOW))).toContain('yet');
    });

    it('refuses client data the account key did not sign', async () => {
        const stranger = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });

        const forged = login({ AuthenticationType: 0, Token: token() }, clientData(stranger.privateKey));

        expect(await refusal(verifyLogin(forged, keys(), NOW))).toContain('not signed by the account key');
    });

    it('refuses a login that is not a signed-in account', async () => {
        expect(await refusal(verifyLogin(login({ AuthenticationType: 2 }), keys(), NOW))).toContain(
            'authentication type 2'
        );
        expect(await refusal(verifyLogin(login({ AuthenticationType: 1, Token: token() }), keys(), NOW))).toContain(
            'authentication type 1'
        );
        expect(await refusal(verifyLogin(login({ AuthenticationType: 0 }), keys(), NOW))).toContain('no token');
        // A certificate chain naming an XUID is a claim, not evidence.
        expect(
            await refusal(
                verifyLogin(
                    login({ AuthenticationType: 0, chain: [b64({}) + '.' + b64({ extraData: { XUID: '1' } }) + '.x'] }),
                    keys(),
                    NOW
                )
            )
        ).toContain('no token');
        expect(await refusal(verifyLogin({ ...full(), chainData: 'not json' }, keys(), NOW))).toContain('JSON');
    });

    it('fails closed when the issuer cannot be reached', async () => {
        const unreachable: LoginKeySource = {
            keyFor: async () => {
                throw new Error('connect ETIMEDOUT');
            }
        };

        expect(await refusal(verifyLogin(full(), unreachable, NOW))).toContain('could not be fetched');
    });
});

describe('MojangKeys', () => {
    const jwk = { ...issuer.publicKey.export({ format: 'jwk' }), kid: KID };

    it('fetches once and serves the key from memory', async () => {
        let fetches = 0;
        const source = new MojangKeys(
            async () => {
                fetches++;
                return { keys: [jwk] };
            },
            () => NOW
        );

        expect(await source.keyFor(KID)).toBeDefined();
        expect(await source.keyFor(KID)).toBeDefined();
        expect(fetches).toBe(1);
    });

    it('fetches again for an unknown key at most once a minute', async () => {
        let fetches = 0;
        let clock = NOW;
        const source = new MojangKeys(
            async () => {
                fetches++;
                return { keys: [jwk] };
            },
            () => clock
        );
        await source.keyFor(KID);

        expect(await source.keyFor('rotated')).toBeUndefined();
        expect(fetches).toBe(1);
        clock += 61_000;
        expect(await source.keyFor('rotated')).toBeUndefined();
        expect(fetches).toBe(2);
    });
});
