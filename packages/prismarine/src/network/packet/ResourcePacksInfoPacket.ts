import { NetworkUtil } from '../NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Tells the client which resource packs it has to download before joining.
 *
 * The layout follows protocol {@link Identifiers.Protocol} (2168, Minecraft 1.26.40): four
 * flags, the world template's identity, then the texture pack list counted by a varint.
 * Earlier versions also carried a `forceServerPacks` flag, a separate behaviour pack
 * list and a trailing CDN url list; all three are gone, and the CDN url now lives on
 * each entry instead. Writing them anyway leaves four bytes the client cannot account
 * for, and it drops the connection right after this packet.
 * @see https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/1.21.42/proto.yml
 */
export default class ResourcePacksInfoPacket extends DataPacket {
    public static NetID = Identifiers.ResourcePacksInfoPacket;

    public resourcePackRequired!: boolean;
    public hasAddonPacks!: boolean;
    public hasScripts!: boolean;

    public resourcePackEntries = [];

    public encodePayload(): void {
        this.writeBoolean(this.resourcePackRequired);
        this.writeBoolean(this.hasAddonPacks);
        this.writeBoolean(this.hasScripts);
        // Added after the three above, so a client on the newer layout reads this flag where
        // an older server wrote the world template. Off: nothing here has an opinion on how
        // the client renders.
        this.writeBoolean(false);

        // The world template's identity - a uuid as two 64 bit halves, then its version.
        // All zeroes and an empty version: these worlds come from no template.
        this.writeUnsignedLongLE(0n);
        this.writeUnsignedLongLE(0n);
        NetworkUtil.writeString(this, '');

        // A varint count, where 748 wrote a little endian short.
        this.writeUnsignedVarInt(this.resourcePackEntries.length);
        for (const _resourceEntry of this.resourcePackEntries) {
            // TODO: we don't need them for now
        }
    }
}
