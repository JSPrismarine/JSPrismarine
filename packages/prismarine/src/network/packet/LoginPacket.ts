import BinaryStream from '@jsprismarine/binaryutils';
import { createHash } from 'node:crypto';
import { NetworkUtil } from '../../network/NetworkUtil';
import Device from '../../utils/Device';
import Skin from '@jsprismarine/protocol/wire/structures/skin/Skin';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/** The skin fields `Skin.fromJWT` reads, named from its parameter so the two cannot drift. */
type SkinData = Parameters<typeof Skin.fromJWT>[0];

/** The client data fields this packet reads, on top of what the skin reader takes. */
interface ClientData extends SkinData {
    /** The name the player typed. The only name an unauthenticated client sends. */
    ThirdPartyName?: string;
    /** The uuid the client made up for itself. Only used when nothing else identifies it. */
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

/** The claims of one link of the certificate chain. Only the last link carries `extraData`. */
interface ChainLink {
    identityPublicKey?: string;
    extraData?: {
        XUID: string;
        identity: string;
        displayName: string;
    };
}

/** The claims of the multiplayer token that clients from 1.26.10 send beside the chain. */
interface TokenClaims {
    /** The client's public key. */
    cpk?: string;
    /** The Xbox Live id, empty when the player is not signed in. */
    xid?: string;
    /** The gamertag, empty when the player is not signed in. */
    xname?: string;
    /** A uuid, sent only when there is no XUID to derive one from. */
    leguuid?: string;
}

/** `{"chain": [...]}`, one JWT per link. Clients before 1.26.10 send this directly. */
interface Certificate {
    chain?: string[];
}

/**
 * The chain JSON as a 1.26.51 client sends it. `Certificate` holds a {@link Certificate} as a
 * JSON string. The `chain` member is only present when an older client sent the bare shape.
 */
interface ConnectionRequest extends Certificate {
    Certificate?: string;
    /** 0 is Xbox Live, 1 is guest, 2 is self-signed. */
    AuthenticationType?: number;
    Token?: string;
}

/**
 * `JSON.parse` returns `any`. This is the one place a parsed shape takes a type the compiler
 * cannot check, so callers name the interface they expect here and work with the typed value.
 */
const parseJSON = <T>(json: string): T => JSON.parse(json);

/**
 * The claims of a JWT, read without checking its signature. The identity chain is verified
 * elsewhere. Here a token is three base64url segments and the middle one is JSON.
 */
const claimsOf = <T>(token: string): T => {
    const payload = token.split('.')[1];
    if (!payload) {
        throw new Error('The login token is not a JWT');
    }
    return parseJSON(Buffer.from(payload, 'base64url').toString('utf8'));
};

/**
 * The uuid that goes with an Xbox Live id.
 *
 * Not sent, and not free to choose. It is an MD5 of the XUID under a fixed namespace, stamped
 * as a version 3 uuid, and every implementation derives the same one. A server that invents a
 * uuid instead hands the player an identity the client has never heard of, which is the same
 * failure as sending none, only later and harder to see.
 * @param {string} xuid - the Xbox Live id, or empty for a player who has none.
 * @returns {string} the uuid, or an empty string when there was no XUID to derive it from.
 */
const identityFromXUID = (xuid: string): string => {
    if (!xuid) return '';

    const hash = createHash('md5').update('pocket-auth-1-xuid:').update(xuid).digest();
    // Version 3 in the high nibble of byte 6, and the RFC 4122 variant in the top bits of byte 8.
    hash.writeUInt8((hash.readUInt8(6) & 0x0f) | 0x30, 6);
    hash.writeUInt8((hash.readUInt8(8) & 0x3f) | 0x80, 8);

    const hex = hash.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * Who is connecting, and as what. Sent once by the client after the network settings.
 *
 * Wire layout at protocol 2193:
 * - `Client Network Version`: a big endian int32. The one field a server of another version can
 *   read, so that it can refuse the connection for the right reason.
 * - `Connection Request`: a varuint byte length, then that many bytes. Inside are two strings,
 *   each a little endian uint32 length followed by ASCII bytes: the chain JSON, then the client
 *   data JWT. Nothing may follow them.
 *
 * The chain JSON has two shapes. Clients before 1.26.10 send `{"chain": [...]}` with one JWT per
 * link and the identity in the last link's `extraData`. Clients from 1.26.10 send the envelope
 * `{"Certificate": "<that JSON as a string>", "AuthenticationType": n, "Token": "<JWT>"}`, where
 * the chain holds one empty link and the identity is in the token's `xid`, `xname`, `cpk` and
 * `leguuid` claims. Decoding reads both shapes.
 *
 * Decoding reads the claims only when `Client Network Version` is this server's protocol.
 * For any other version it stops after the framing, leaving the identity, skin and device
 * fields unset, so that the handler can refuse the login with the matching `PlayStatus`.
 *
 * Encoding writes `chainData` and `clientData` back as they arrived, so a decoded packet
 * reproduces its own bytes.
 */
export default class LoginPacket extends FieldNetworkPacket {
    /**
     * The client's xbox live ID.
     */
    public XUID!: string;
    public identity!: string;

    /**
     * The client's username.
     */
    public displayName!: string;
    public protocol!: number;
    public identityPublicKey!: string;

    /**
     * The envelope's `AuthenticationType`: 0 is Xbox Live, 1 is guest, 2 is self-signed. 0 when
     * the client sent the bare `{"chain": [...]}` shape, which has no such field.
     */
    public authenticationType = 0;

    /** The chain JSON exactly as it arrived, before any parsing. */
    public chainData = '';
    /** The client data JWT exactly as it arrived, before any parsing. */
    public clientData = '';

    public clientRandomId!: number;
    public serverAddress!: string;
    public languageCode!: string;

    public device!: Device;
    public skin!: Skin;

    public decodePayload(): void {
        this.protocol = this.readInt();

        // Read through the declared length rather than past it. A request claiming more bytes
        // than the packet carries fails on the read, and one carrying more than its two strings
        // is refused below. gophertunnel refuses both the same way.
        const request = new BinaryStream(this.read(this.readUnsignedVarInt()));
        this.chainData = NetworkUtil.readLELengthASCIIString(request);
        this.clientData = NetworkUtil.readLELengthASCIIString(request);
        if (!request.feof()) {
            const unread = request.readRemaining().byteLength;
            throw new Error(`The connection request has ${unread} unread bytes after the client data`);
        }

        // Nothing past the framing is read for a client of another protocol. The handler
        // refuses it on the version alone, and the chain and client data of another version
        // need not have this shape: parsing them here would throw, and a decode error drops
        // the packet before the handler can send the `PlayStatus` that tells the player to
        // update. The docs mark the version big endian for this reason, so that any server
        // can read it and answer. The comparison is against the codec that built this
        // packet - the session's negotiated version - not a global constant.
        if (this.protocol !== this.codecProtocol) return;

        const envelope = parseJSON<ConnectionRequest>(this.chainData);
        this.authenticationType = envelope.AuthenticationType ?? 0;

        // Two shapes, and which one arrives depends on the client's version rather than on
        // anything it chose. Up to 1.26.10 the identity was a link in the chain carrying
        // `extraData`; from 1.26.10 the chain holds one empty string and the identity is a
        // token beside it, under an identity provider's short claim names. Both are read
        // because a server that only knows one refuses half the clients that can reach it.
        const certificate =
            typeof envelope.Certificate === 'string' ? parseJSON<Certificate>(envelope.Certificate) : envelope;

        for (const link of certificate.chain ?? []) {
            if (!link) continue;

            const { extraData, identityPublicKey } = claimsOf<ChainLink>(link);

            if (extraData) {
                this.XUID = extraData.XUID;
                this.identity = extraData.identity;
                this.displayName = extraData.displayName;
            }

            this.identityPublicKey = identityPublicKey ?? this.identityPublicKey;
        }

        if (envelope.Token) {
            const token = claimsOf<TokenClaims>(envelope.Token);

            // Each of these only when the token actually carries it. An authenticated login
            // has both a chain and a token, and the chain is the better source. Overwriting
            // its XUID with an absent one leaves a signed in player looking unauthenticated.
            this.XUID = token.xid || this.XUID;
            // `leguuid` is only sent when there is no XUID to derive a uuid from, which for an
            // unauthenticated client is always.
            this.identity = token.leguuid || this.identity;
            this.displayName = token.xname || this.displayName;
            this.identityPublicKey = token.cpk || this.identityPublicKey;
        }

        // An authenticated login on the token format sends an XUID and no uuid, because the
        // uuid is not a fact to be sent. It is derived from the XUID, and both ends derive
        // the same one. A server that waits to be told refuses every signed in player.
        this.identity ||= identityFromXUID(this.XUID);

        const clientData = claimsOf<ClientData>(this.clientData);

        // The last place a name and an identity can be, and for a real client that is not
        // signed in to Xbox Live it is the only place. The chain holds one empty link and the
        // token names nobody, because there is nobody to name. What the player typed lives in
        // the client data as `ThirdPartyName`, beside the id it made up for itself.
        //
        // A server that does not look here refuses every unauthenticated client with "invalid
        // username", having been handed the username in the same packet.
        this.displayName ||= clientData.ThirdPartyName ?? '';
        this.identity ||= clientData.SelfSignedId ?? '';
        this.skin = Skin.fromJWT(clientData);
        this.device = new Device({
            id: clientData.DeviceId,
            os: clientData.DeviceOS,
            model: clientData.DeviceModel,
            inputMode: clientData.CurrentInputMode,
            guiScale: clientData.GuiScale
        });

        this.clientRandomId = clientData.ClientRandomId;
        this.serverAddress = clientData.ServerAddress;
        this.languageCode = clientData.LanguageCode;
    }

    public encodePayload(): void {
        this.writeInt(this.protocol);

        const request = new BinaryStream();
        NetworkUtil.writeLELengthASCIIString(request, this.chainData);
        NetworkUtil.writeLELengthASCIIString(request, this.clientData);

        const body = request.getWriteBuffer();
        this.writeUnsignedVarInt(body.byteLength);
        this.write(body);
    }
}
