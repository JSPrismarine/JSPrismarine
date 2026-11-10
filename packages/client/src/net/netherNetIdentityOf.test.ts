import { describe, expect, it } from 'vitest';

import { OfflineAuthProvider, TOKEN_ISSUER, XboxAuthProvider } from '@jsprismarine/auth';
import { netherNetIdentityOf } from './netherNetIdentityOf';

const DESCRIPTION = [
    'v=0',
    'a=fingerprint:sha-256 3B:6F:00:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    ''
].join('\r\n');

const b64 = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

/** The `a=identity` attribute of a signed description, decoded. */
const identityIn = (signed: string) => {
    const line = signed.split('\r\n').find((candidate) => candidate.startsWith('a=identity:'))!;
    const identity = JSON.parse(Buffer.from(line.slice('a=identity:'.length), 'base64').toString());
    return { domain: identity.idp.domain, token: JSON.parse(identity.assertion).token };
};

describe('netherNetIdentityOf', () => {
    it("signs a signed-in provider's offer with its multiplayer token, under the token's issuer", async () => {
        const token = `${b64({ alg: 'RS256' })}.${b64({ exp: 4_000_000_000 })}.c2ln`;
        const auth = new XboxAuthProvider({
            tokens: {
                getMinecraftBedrockToken: async () => ({
                    chain: [
                        `${b64({})}.${b64({ extraData: { XUID: '1', identity: 'u', displayName: 'Steve' } })}.c2ln`
                    ],
                    token
                })
            }
        });

        const identity = await netherNetIdentityOf(auth);

        expect(identity).toBeDefined();
        expect(identityIn(await identity!.sign(DESCRIPTION))).toStrictEqual({ domain: TOKEN_ISSUER, token });
    });

    it('leaves a provider nobody vouches for to a self-signed identity', async () => {
        expect(await netherNetIdentityOf(new OfflineAuthProvider({ displayName: 'Steve' }))).toBeUndefined();
    });
});
