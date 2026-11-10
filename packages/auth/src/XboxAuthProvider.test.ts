import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import { describe, expect, it, vi } from 'vitest';

import { IdentityKey } from './IdentityKey';
import { verifyLogin } from './LoginVerifier';
import { MOJANG_ROOT_KEY, TOKEN_ISSUER } from './protocol';
import XboxAuthProvider from './XboxAuthProvider';
import type { XboxTokenSource } from './XboxAuthProvider';

/** A JWT's claims, unchecked; the tests read what the provider signed. */
const decode = (token: string) => decodeJwt(token);
/** A JWT's header and claims, unchecked. */
const decodeComplete = (token: string) => ({ header: decodeProtectedHeader(token), payload: decode(token) });

const NOW = 1_800_000_000_000;
const KID = 'issuer-key';
const ACCOUNT = { XUID: '2535400000000001', identity: 'b3b4e1c2-0000-4000-8000-000000000001', displayName: 'Steve' };

const issuer = generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64 = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

/** A JWT signed as Minecraft services signs its multiplayer token. */
const issuedToken = (cpk: string, exp: number): string => {
    const head = b64({ alg: 'RS256', kid: KID });
    const body = b64({ iss: TOKEN_ISSUER, exp, xid: ACCOUNT.XUID, xname: ACCOUNT.displayName, cpk });
    return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), issuer.privateKey).toString('base64url')}`;
};

/** A chain link; only its claims matter here, since the server no longer reads the chain. */
const link = (claims: Record<string, unknown>): string => `${b64({ alg: 'ES384' })}.${b64(claims)}.c2ln`;

/** Xbox Live, as far as a provider sees it: a chain naming the account, and a token for the key. */
const fakeXbox = (
    options: { expiresIn?: number; token?: string; extraData?: Record<string, unknown> } = {}
): XboxTokenSource & { calls: KeyObject[] } => {
    const calls: KeyObject[] = [];
    return {
        calls,
        getMinecraftBedrockToken: async (publicKey) => {
            calls.push(publicKey);
            const cpk = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
            return {
                chain: [
                    link({ identityPublicKey: 'intermediate' }),
                    link({ identityPublicKey: cpk, extraData: options.extraData ?? ACCOUNT })
                ],
                token: options.token ?? issuedToken(cpk, NOW / 1000 + (options.expiresIn ?? 3600))
            };
        }
    };
};

const REQUEST = { serverAddress: 'example.com:19132', protocolVersion: 2193 };

describe('XboxAuthProvider', () => {
    it("names the account the chain's last link carries", async () => {
        const auth = new XboxAuthProvider({ tokens: fakeXbox(), now: () => NOW });

        expect(await auth.getIdentity()).toStrictEqual({
            xuid: ACCOUNT.XUID,
            identity: ACCOUNT.identity,
            displayName: ACCOUNT.displayName
        });
    });

    it('asks Xbox Live for tokens bound to its own key', async () => {
        const tokens = fakeXbox();
        const auth = new XboxAuthProvider({ tokens, now: () => NOW });
        await auth.getIdentity();

        expect(tokens.calls).toHaveLength(1);
        expect(tokens.calls[0]!.export({ type: 'spki', format: 'der' }).toString('base64')).toBe(
            await auth.getIdentityPublicKey()
        );
        expect(decode(await auth.getMultiplayerToken()).cpk).toBe(await auth.getIdentityPublicKey());
    });

    it('puts its own link, naming Mojang as the next signer, in front of the chain and carries the token', async () => {
        const auth = new XboxAuthProvider({ tokens: fakeXbox(), now: () => NOW });
        const { chainData } = await auth.createLoginCredentials(REQUEST);

        const request = JSON.parse(chainData);
        expect(request.AuthenticationType).toBe(0);
        expect(request.Token).toBe(await auth.getMultiplayerToken());

        const chain: string[] = JSON.parse(request.Certificate).chain;
        expect(chain).toHaveLength(3);
        const own = decodeComplete(chain[0]!);
        expect(own.header.x5u).toBe(await auth.getIdentityPublicKey());
        expect(own.payload.identityPublicKey).toBe(MOJANG_ROOT_KEY);
        expect(own.payload.certificateAuthority).toBe(true);
    });

    it('sends the bare chain to a server from before the token', async () => {
        const auth = new XboxAuthProvider({ tokens: fakeXbox(), now: () => NOW });
        const { chainData } = await auth.createLoginCredentials({ ...REQUEST, protocolVersion: 748 });

        expect(Object.keys(JSON.parse(chainData))).toStrictEqual(['chain']);
        expect(JSON.parse(chainData).chain).toHaveLength(3);
    });

    it('signs the client data with its key, leaving the name to what Xbox Live issued', async () => {
        const auth = new XboxAuthProvider({ tokens: fakeXbox(), now: () => NOW });
        const { clientData } = await auth.createLoginCredentials(REQUEST);

        const { header, payload } = decodeComplete(clientData);
        expect(header.x5u).toBe(await auth.getIdentityPublicKey());
        expect(payload.SelfSignedId).toBe(ACCOUNT.identity);
        expect(payload.ThirdPartyName).toBe('');
        expect(payload.ServerAddress).toBe(REQUEST.serverAddress);
    });

    it("produces a login the server's verifier admits as the account", async () => {
        const auth = new XboxAuthProvider({ tokens: fakeXbox(), now: () => NOW });
        const credentials = await auth.createLoginCredentials(REQUEST);

        const verified = await verifyLogin(
            credentials,
            { keyFor: async (kid) => (kid === KID ? issuer.publicKey : undefined) },
            NOW
        );

        expect(verified).toMatchObject({ xuid: ACCOUNT.XUID, displayName: ACCOUNT.displayName });
        expect(verified.identityPublicKey).toBe(await auth.getIdentityPublicKey());
    });

    it('signs in once, and again only when the token is about to expire', async () => {
        const tokens = fakeXbox({ expiresIn: 3600 });
        let now = NOW;
        const auth = new XboxAuthProvider({ tokens, now: () => now });

        await auth.createLoginCredentials(REQUEST);
        await Promise.all([auth.createLoginCredentials(REQUEST), auth.getMultiplayerToken()]);
        expect(tokens.calls).toHaveLength(1);

        now = NOW + 3600 * 1000 - 60 * 1000;
        await Promise.all([auth.getMultiplayerToken(), auth.getMultiplayerToken()]);
        expect(tokens.calls).toHaveLength(2);
    });

    it('tries again after a failed sign-in instead of keeping the failure', async () => {
        const working = fakeXbox();
        let attempts = 0;
        const auth = new XboxAuthProvider({
            now: () => NOW,
            tokens: {
                getMinecraftBedrockToken: async (key) => {
                    attempts += 1;
                    if (attempts === 1) throw new Error('offline');
                    return working.getMinecraftBedrockToken(key);
                }
            }
        });

        await expect(auth.getIdentity()).rejects.toThrow('offline');
        expect((await auth.getIdentity()).xuid).toBe(ACCOUNT.XUID);
    });

    it('refuses an issuance without a token or without an account', async () => {
        await expect(new XboxAuthProvider({ tokens: fakeXbox({ token: '' }) }).getIdentity()).rejects.toThrow(
            'no multiplayer token'
        );
        await expect(
            new XboxAuthProvider({ tokens: fakeXbox({ extraData: { XUID: '1' } }), now: () => NOW }).getIdentity()
        ).rejects.toThrow('names no account');
    });

    it('keeps a key it is given', async () => {
        const key = IdentityKey.generate();
        const auth = new XboxAuthProvider({ key, tokens: fakeXbox(), now: () => NOW });

        expect(await auth.getIdentityPublicKey()).toBe(key.publicKeyDer);
        expect(
            createPublicKey(await auth.getIdentityPrivateKey()).export({ type: 'spki', format: 'der' })
        ).toStrictEqual(key.publicKey.export({ type: 'spki', format: 'der' }));
    });
});

describe('XboxAuthProvider signing in through prismarine-auth', () => {
    it('signs in as the Switch title under the account name and reports the device code', async () => {
        const constructed: unknown[][] = [];
        vi.doMock('prismarine-auth', () => ({
            Titles: { MinecraftNintendoSwitch: 'switch-title' },
            Authflow: class {
                public constructor(...args: unknown[]) {
                    constructed.push(args);
                    const onCode = args[3];
                    if (typeof onCode === 'function') {
                        onCode({
                            user_code: 'ABCD',
                            verification_uri: 'https://microsoft.com/link',
                            expires_in: 900,
                            message: 'Go'
                        });
                    }
                }

                public getMinecraftBedrockToken(publicKey: KeyObject) {
                    return fakeXbox().getMinecraftBedrockToken(publicKey);
                }
            }
        }));
        try {
            const codes: unknown[] = [];
            const auth = new XboxAuthProvider({
                account: 'me',
                cacheDirectory: '/cache',
                onDeviceCode: (code) => void codes.push(code),
                now: () => NOW
            });

            expect((await auth.getIdentity()).xuid).toBe(ACCOUNT.XUID);
            await auth.getMultiplayerToken();

            expect(constructed).toHaveLength(1);
            expect(constructed[0]!.slice(0, 3)).toStrictEqual([
                'me',
                '/cache',
                { authTitle: 'switch-title', deviceType: 'Nintendo', flow: 'live' }
            ]);
            expect(codes).toStrictEqual([
                {
                    userCode: 'ABCD',
                    verificationUri: 'https://microsoft.com/link',
                    expiresInSeconds: 900,
                    message: 'Go'
                }
            ]);
        } finally {
            vi.doUnmock('prismarine-auth');
        }
    });
});
