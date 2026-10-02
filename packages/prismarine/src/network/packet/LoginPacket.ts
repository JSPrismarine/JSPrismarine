import fastJWT from 'fast-jwt';
import { createHash } from 'node:crypto';
import { NetworkUtil } from '../../network/NetworkUtil';
import Device from '../../utils/Device';
import Skin from '../../utils/skin/Skin';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * The uuid that goes with an Xbox Live id.
 *
 * Not sent, and not free to choose: it is an MD5 of the XUID under a fixed namespace, stamped
 * as a version 3 uuid, and every implementation derives the same one. A server that invents a
 * uuid instead hands the player an identity the client has never heard of - which is the same
 * failure as sending none, only later and harder to see.
 * @param {string} xuid - the Xbox Live id, or empty for a player who has none.
 * @returns {string} the uuid, or an empty string when there was no XUID to derive it from.
 */
const identityFromXUID = (xuid: string): string => {
    if (!xuid) return '';

    const hash = createHash('md5').update('pocket-auth-1-xuid:').update(xuid).digest();
    hash[6] = (hash[6]! & 0x0f) | 0x30;
    hash[8] = (hash[8]! & 0x3f) | 0x80;

    const hex = hash.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export default class LoginPacket extends DataPacket {
    public static NetID = Identifiers.LoginPacket;

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

    public clientRandomId!: number;
    public serverAddress!: string;
    public languageCode!: string;

    public device!: Device;
    public skin!: Skin;

    public decodePayload(): void {
        this.protocol = this.readInt();

        // TODO: content length, to validate it's lenght...
        this.readUnsignedVarInt();
        const chainData = JSON.parse(NetworkUtil.readLELengthASCIIString(this)) as any;
        const decode = fastJWT.createDecoder();

        // Two shapes, and which one arrives depends on the client's version rather than on
        // anything it chose. Up to 1.26.10 the identity was a link in the chain carrying
        // `extraData`; from 1.26.10 the chain holds one empty string and the identity is a
        // token beside it, under an identity provider's short claim names. Both are read
        // because a server that only knows one refuses half the clients that can reach it.
        const certificate = typeof chainData.Certificate === 'string' ? JSON.parse(chainData.Certificate) : chainData;

        for (const link of certificate.chain ?? []) {
            if (!link) continue;

            const decodedChain = decode(link);

            if (decodedChain.extraData) {
                this.XUID = decodedChain.extraData.XUID;
                this.identity = decodedChain.extraData.identity;
                this.displayName = decodedChain.extraData.displayName;
            }

            this.identityPublicKey = decodedChain.identityPublicKey;
        }

        if (chainData.Token) {
            const token = decode(chainData.Token);

            // Each of these only when the token actually carries it. An authenticated login
            // has both a chain and a token, and the chain is the better source - overwriting
            // its XUID with an absent one leaves a signed in player looking unauthenticated.
            this.XUID = token.xid || this.XUID;
            // `leguuid` is only sent when there is no XUID to derive a uuid from, which for an
            // unauthenticated client is always.
            this.identity = token.leguuid || this.identity;
            this.displayName = token.xname || this.displayName;
            this.identityPublicKey = token.cpk || this.identityPublicKey;
        }

        // An authenticated login on the token format sends an XUID and no uuid, because the
        // uuid is not a fact to be sent - it is derived from the XUID, and both ends derive
        // the same one. A server that waits to be told it refuses every signed in player.
        this.identity ||= identityFromXUID(this.XUID);

        const decodedJWT = decode(NetworkUtil.readLELengthASCIIString(this));

        // The last place a name and an identity can be, and for a real client that is not
        // signed in to Xbox Live it is the only place. The chain holds one empty link and the
        // token names nobody, because there is nobody to name - what the player typed lives in
        // the client data as `ThirdPartyName`, beside the id it made up for itself.
        //
        // A server that does not look here refuses every unauthenticated client with "invalid
        // username", having been handed the username in the same packet.
        this.displayName ||= decodedJWT.ThirdPartyName;
        this.identity ||= decodedJWT.SelfSignedId;
        this.skin = Skin.fromJWT(decodedJWT);
        this.device = new Device({
            id: decodedJWT.DeviceId,
            os: decodedJWT.DeviceOS,
            model: decodedJWT.DeviceModel,
            inputMode: decodedJWT.CurrentInputMode,
            guiScale: decodedJWT.GuiScale
        });

        this.clientRandomId = decodedJWT.ClientRandomId;
        this.serverAddress = decodedJWT.ServerAddress;
        this.languageCode = decodedJWT.LanguageCode;
    }

    public encodePayload(): void {
        /*
        TODO
        this.writeInt(Identifiers.Protocol);

        const stream = new BinaryStream();
        const data = JSON.stringify({
            chain: [
                "eyJhbGciOiJFUzM4NCIsIng1dSI6Ik1IWXdFQVlIS29aSXpqMENBUVlGSzRFRUFDSURZZ0FFZitQNy94REozUFFTK2Vsb1M5WjhDdzczMG0vcndFZlZmaWg1QjBQZmtEdWR2QmlIeXJxUjhmaEg5YWJkRWRELzE3Sk9xZVdwZTRzcjB3Sk9FZDRRV05wbm5kYk90V0YzTXo1bk5aVU1rekEwaWE2V28vQnBQQ0hXR093Q3R5bWwifQo.eyJjZXJ0aWZpY2F0ZUF1dGhvcml0eSI6dHJ1ZSwiZXhwIjoxNjA2NDY5OTg4LCJpZGVudGl0eVB1YmxpY0tleSI6Ik1IWXdFQVlIS29aSXpqMENBUVlGSzRFRUFDSURZZ0FFOEVMa2l4eUxjd2xacnlVUWN1MVR2UE9tSTJCN3ZYODNuZG5XUlVhWG03NHdGZmE1Zi9sd1FOVGZyTFZIYTJQbWVucEdJNkpoSU1VSmFXWnJqbU1qOTBOb0tORlNOQnVLZG04cllpWHNmYXozSzM2eC8xVTI2SHBHMFp4Sy9WMVYiLCJuYmYiOjE2MDYyOTcxMjh9Cg.2zvxWED0umE0fYgZlx6h3dIfPw1hv50Ug5DvtOXqVHBv2sfriTB7jkJSMGp2rnuNYS_Ir_Q4e9CSWA5AzuuuJ82Z3pp2SQuX7Yh1LplmvjAoiXfQqQr4_TaukBtGXmLd",
                "eyJ4NXUiOiJNSFl3RUFZSEtvWkl6ajBDQVFZRks0RUVBQ0lEWWdBRThFTGtpeHlMY3dsWnJ5VVFjdTFUdlBPbUkyQjd2WDgzbmRuV1JVYVhtNzR3RmZhNWZcL2x3UU5UZnJMVkhhMlBtZW5wR0k2SmhJTVVKYVdacmptTWo5ME5vS05GU05CdUtkbThyWWlYc2ZhejNLMzZ4XC8xVTI2SHBHMFp4S1wvVjFWIiwiYWxnIjoiRVMzODQifQ.eyJuYmYiOjE2MDYyOTcxMjgsInJhbmRvbU5vbmNlIjotMjUxNjAzNDQ4NjM0NTA5NTk1NywiaXNzIjoiTW9qYW5nIiwiZXhwIjoxNjA2NDY5OTg4LCJjZXJ0aWZpY2F0ZUF1dGhvcml0eSI6dHJ1ZSwiaWF0IjoxNjA2Mjk3MTg4LCJpZGVudGl0eVB1YmxpY0tleSI6Ik1IWXdFQVlIS29aSXpqMENBUVlGSzRFRUFDSURZZ0FFYUJTbjlvSWxsNm9Hdk5sTm1wXC9zRFJZTEZFVTlTZDJhZUFYNThSSGpLKzB0Nmx0WWVtWGFubXY1NVwvWlNqbjBXNUdZZkFHS0Y0T1lncWN0WWVieGxERWVYMFwvcDBYT1wvdytNUlwvS3ZwanFWejZZemdYNlRmQTc3c3dvTXVNUDRzSSJ9.FMfiGRUOjw6bI3H4ChYqgsHY4t8yWimq3Qu27D68wQwlBUiBeOdAFVb2NHLWKBXKBP3y3txbn9A65Xvrg9BWhVZPZz5pGLxwiRNl9f8iJJflfi3QfKMMaiLrjj8ZYQwl",
                "eyJ4NXUiOiJNSFl3RUFZSEtvWkl6ajBDQVFZRks0RUVBQ0lEWWdBRWFCU245b0lsbDZvR3ZObE5tcFwvc0RSWUxGRVU5U2QyYWVBWDU4UkhqSyswdDZsdFllbVhhbm12NTVcL1pTam4wVzVHWWZBR0tGNE9ZZ3FjdFllYnhsREVlWDBcL3AwWE9cL3crTVJcL0t2cGpxVno2WXpnWDZUZkE3N3N3b011TVA0c0kiLCJhbGciOiJFUzM4NCJ9.eyJuYmYiOjE2MDYyOTk0MDksImV4dHJhRGF0YSI6eyJYVUlEIjoiMjUzNTQxMzY2MTMxMTUwMiIsImlkZW50aXR5IjoiZDRmNmQwNmItNDk4OS0zYWIwLTlkMDMtODA2OTRlMjQ3ZWJiIiwiZGlzcGxheU5hbWUiOiJIZXJyeVlUIiwidGl0bGVJZCI6Ijg5NjkyODc3NSJ9LCJyYW5kb21Ob25jZSI6LTYzOTA2MjgwNDA3MDg2MDkyNiwiaXNzIjoiTW9qYW5nIiwiZXhwIjoxNjA2Mzg1ODY5LCJpYXQiOjE2MDYyOTk0NjksImlkZW50aXR5UHVibGljS2V5IjoiTUhZd0VBWUhLb1pJemowQ0FRWUZLNEVFQUNJRFlnQUVmK1A3XC94REozUFFTK2Vsb1M5WjhDdzczMG1cL3J3RWZWZmloNUIwUGZrRHVkdkJpSHlycVI4ZmhIOWFiZEVkRFwvMTdKT3FlV3BlNHNyMHdKT0VkNFFXTnBubmRiT3RXRjNNejVuTlpVTWt6QTBpYTZXb1wvQnBQQ0hXR093Q3R5bWwifQ.ya515qoCGluYhSwMHGHKRGaeCarrBr6mp0H9gCxJQ_8xLTGjKdyNGKeQFldoRqDTLCZsEITrLuAKBQkgSwXiVIbAehO6HeIbjESio6hVELUA9C2eelBasQODL-lE8kax"
            ]
        });

        stream.writeUnsignedVarInt(55309);  // Full length

        stream.writeLInt(Buffer.byteLength(data));
        stream.append(Buffer.from(data, 'utf8'));
        */
    }
}
