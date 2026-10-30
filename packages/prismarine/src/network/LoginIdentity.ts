import { createHash } from 'node:crypto';

import type { Login } from '@jsprismarine/protocol/packet/LoginPacket';
import Device from '../utils/Device';
import Skin from '@jsprismarine/protocol/wire/structures/skin/Skin';

/** The skin fields `Skin.fromJWT` reads, named from its parameter so the two cannot drift. */
type SkinData = Parameters<typeof Skin.fromJWT>[0];

/** The client data fields this server reads, on top of what the skin reader takes. */
interface ClientData extends SkinData {
    /** The name the player typed when not signed in to Xbox Live. */
    ThirdPartyName?: string;
    /** The client-generated identity used when no XUID is available. */
    SelfSignedId?: string;
    DeviceId: string;
    DeviceOS: number;
    DeviceModel: string;
    CurrentInputMode: number;
    GuiScale: number;
    ClientRandomId: number;
    ServerAddress: string;
    LanguageCode: string;
}

/** The claims in one link of the certificate chain. Only the last link carries `extraData`. */
interface ChainLink {
    identityPublicKey?: string;
    extraData?: {
        XUID: string;
        identity: string;
        displayName: string;
    };
}

/** Claims in the multiplayer token sent by clients from 1.26.10. */
interface TokenClaims {
    cpk?: string;
    xid?: string;
    xname?: string;
    leguuid?: string;
}

/** The certificate link list sent directly by clients before 1.26.10. */
interface Certificate {
    chain?: string[];
}

/** The current connection request envelope, which wraps the older certificate format. */
interface ConnectionRequest extends Certificate {
    Certificate?: string;
    AuthenticationType?: number;
    Token?: string;
}

/** `JSON.parse` cannot validate a payload shape, so callers name the expected shape here. */
const parseJSON = <T>(json: string): T => JSON.parse(json);

/** Reads the JSON segment of a JWT without validating its signature. */
const claimsOf = <T>(token: string): T => {
    const payload = token.split('.')[1];
    if (!payload) throw new Error('The login token is not a JWT');
    return parseJSON(Buffer.from(payload, 'base64url').toString('utf8'));
};

/** Derives the protocol's version 3 identity UUID from an Xbox Live id. */
const identityFromXUID = (xuid: string): string => {
    if (!xuid) return '';

    const hash = createHash('md5').update('pocket-auth-1-xuid:').update(xuid).digest();
    hash.writeUInt8((hash.readUInt8(6) & 0x0f) | 0x30, 6);
    hash.writeUInt8((hash.readUInt8(8) & 0x3f) | 0x80, 8);

    const hex = hash.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * Reads the player identity, skin, and device details in a framed Login payload.
 *
 * Call this only after confirming that the client's protocol version matches the connection
 * codec. Unsupported clients need the version refusal response without parsing their claims.
 * @param login - The wire-level Login body containing the raw connection request strings.
 * @returns The server's player identity and client details.
 */
export const parseLoginIdentity = (login: Login) => {
    const envelope = parseJSON<ConnectionRequest>(login.chainData);
    const authenticationType = envelope.AuthenticationType ?? 0;
    let xuid: string | undefined;
    let identity: string | undefined;
    let displayName: string | undefined;
    let identityPublicKey: string | undefined;

    const certificate =
        typeof envelope.Certificate === 'string' ? parseJSON<Certificate>(envelope.Certificate) : envelope;

    for (const link of certificate.chain ?? []) {
        if (!link) continue;

        const { extraData, identityPublicKey: linkPublicKey } = claimsOf<ChainLink>(link);
        if (extraData) {
            xuid = extraData.XUID;
            identity = extraData.identity;
            displayName = extraData.displayName;
        }

        identityPublicKey = linkPublicKey ?? identityPublicKey;
    }

    if (envelope.Token) {
        const token = claimsOf<TokenClaims>(envelope.Token);
        xuid = token.xid || xuid;
        identity = token.leguuid || identity;
        displayName = token.xname || displayName;
        identityPublicKey = token.cpk || identityPublicKey;
    }

    identity ||= identityFromXUID(xuid ?? '');

    const clientData = claimsOf<ClientData>(login.clientData);
    displayName ||= clientData.ThirdPartyName ?? '';
    identity ||= clientData.SelfSignedId ?? '';

    return {
        authenticationType,
        xuid: xuid ?? '',
        identity,
        displayName,
        identityPublicKey,
        skin: Skin.fromJWT(clientData),
        device: new Device({
            id: clientData.DeviceId,
            os: clientData.DeviceOS,
            model: clientData.DeviceModel,
            inputMode: clientData.CurrentInputMode,
            guiScale: clientData.GuiScale
        }),
        clientRandomId: clientData.ClientRandomId,
        serverAddress: clientData.ServerAddress,
        languageCode: clientData.LanguageCode
    };
};
