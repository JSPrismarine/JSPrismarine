import { NetworkUtil } from '../../network/NetworkUtil';
import ResourcePackStatusType from '../type/ResourcePackStatusType';
import DataPacket from './DataPacket';

/**
 * The `Response Type` string of each alternative, indexed by the alternative index.
 *
 * Real clients and gophertunnel send these in lower case. Mojang's docs list them as `Cancel`,
 * `Downloading`, `DownloadingFinished` and `ResourcePackStackFinished`. The lower case form is
 * the one proven on the wire, so it stays. Decoding discards the string, so either casing reads.
 */
const RESPONSE_TYPE_NAMES = ['cancel', 'downloading', 'downloadingfinished', 'resourcepackstackfinished'];

/**
 * What separates a status from its alternative index: `Refused` is 1 and `Cancel` is alternative 0.
 *
 * Protocol 2207 renumbers the docs enum to 1..4, which matches the status values. A bump past 2193
 * has to drop this offset.
 */
const ALTERNATIVE_OFFSET = 1;

/**
 * The client's answer to the resource pack exchange, packet 8.
 *
 * The payload is one field, `Response`, a `oneOf` of four alternatives. It starts with the
 * alternative index as a varuint32 (0 `Cancel`, 1 `Downloading`, 2 `DownloadingFinished`,
 * 3 `ResourcePackStackFinished`), then the alternative's `Response Type` as a string. Only
 * `Downloading` continues with `Downloading Packs`, a varuint32 count followed by that many
 * strings. The status is {@link ResourcePackStatusType}, which is the alternative index plus one.
 *
 * The schema types `Response Type` as an int8 and caps `Downloading Packs` at 65535 entries,
 * which reads like a one byte status and a uint16 count. That is the layout before protocol
 * 2193. Since the Cereal conversion the bytes are the ones above: a 1.26.51 client's
 * `DownloadingFinished` is `02 13` followed by the 19 bytes of `downloadingfinished`, and
 * gophertunnel at protocol 2193 writes the same. Until protocol 748 the list was written after
 * every alternative; a real server reads the two stray bytes as the next packet.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/resource-pack-client-response-packet/
 */
export default class ResourcePackClientResponsePacket extends DataPacket {
    public status!: ResourcePackStatusType;
    public packIds: string[] = [];

    /**
     * Reads `Response`. The `Response Type` string is read and discarded; the alternative index
     * alone decides the status.
     * @throws when the alternative index names none of the four alternatives.
     */
    public decodePayload(): void {
        const selector = this.readUnsignedVarInt();
        if (selector >= RESPONSE_TYPE_NAMES.length) {
            throw new Error(`Unknown resource pack response alternative ${selector}`);
        }

        this.status = selector + ALTERNATIVE_OFFSET;
        NetworkUtil.readString(this);

        if (this.status !== ResourcePackStatusType.SendPacks) return;

        let entryCount = this.readUnsignedVarInt();
        while (entryCount-- > 0) {
            this.packIds.push(NetworkUtil.readString(this));
        }
    }

    /**
     * Writes `Response` for the current status. The server never sends this packet; the client
     * package does, through its own copy in `@jsprismarine/protocol`.
     * @throws when the status has no alternative, which includes an unset status of 0.
     */
    public encodePayload(): void {
        const selector = this.status - ALTERNATIVE_OFFSET;
        const name = RESPONSE_TYPE_NAMES[selector];
        if (name === undefined) throw new Error(`No resource pack response alternative for status ${this.status}`);

        this.writeUnsignedVarInt(selector);
        NetworkUtil.writeString(this, name);

        if (this.status !== ResourcePackStatusType.SendPacks) return;

        this.writeUnsignedVarInt(this.packIds.length);
        for (const id of this.packIds) {
            NetworkUtil.writeString(this, id);
        }
    }
}
