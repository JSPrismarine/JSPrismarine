import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Whether the client is sitting on a loading screen waiting for ticking areas to preload.
 *
 * Ticking areas are the chunks a world keeps simulated whether or not anybody is standing
 * in them - a vanilla feature this server does not model, so there is nothing to wait for
 * and nothing to answer. It is decoded rather than ignored because a packet the registry
 * has never heard of is a warning on every one that arrives.
 * @see https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/1.21.42/protocol.json `packet_ticking_areas_load_status`
 */
export default class TickingAreasLoadStatusPacket extends DataPacket {
    public static NetID = Identifiers.TickingAreasLoadStatusPacket;

    /** `true` while the client is still waiting on the preload. */
    public preload: boolean = false;

    public decodePayload(): void {
        this.preload = this.readBoolean();
    }

    public encodePayload(): void {
        this.writeBoolean(this.preload);
    }
}
