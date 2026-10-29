import DataPacket from './DataPacket';

/**
 * Whether the client is sitting on a loading screen waiting for ticking areas to preload.
 *
 * Ticking areas are the chunks a world keeps simulated whether or not anybody is standing
 * in them, a vanilla feature this server does not model, so there is nothing to wait for
 * and nothing to answer. It is decoded rather than ignored because a packet the registry
 * has never heard of is a warning on every one that arrives.
 *
 * Protocol 2193 layout (docs id 179), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Waiting For Preload | boolean | |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/ticking-areas-load-status-packet/
 */
export default class TickingAreasLoadStatusPacket extends DataPacket {
    /** Waiting For Preload: `true` while the client is still waiting on the preload. */
    public preload: boolean = false;

    /** Reads the flag. */
    public decodePayload(): void {
        this.preload = this.readBoolean();
    }

    /** Writes the flag. */
    public encodePayload(): void {
        this.writeBoolean(this.preload);
    }
}
