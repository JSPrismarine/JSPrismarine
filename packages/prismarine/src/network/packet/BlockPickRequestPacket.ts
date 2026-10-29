import { NetworkUtil } from '../NetworkUtil';
import BlockPosition from '../../world/BlockPosition';
import DataPacket from './DataPacket';

/**
 * A creative player middle-clicking a block to put it in the hotbar.
 *
 * Wire layout at protocol 2193: Position as a `BlockPos` (three ZigZag varint32), With Data?
 * as a boolean (whether to copy the block entity's NBT), then Max Slots as a uint8, the
 * number of empty hotbar slots the client has.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/block-pick-request-packet/
 */
export default class BlockPickRequestPacket extends DataPacket {
    public position = new BlockPosition(0, 0, 0);

    /** `true` when the client wants the block entity data on the item. */
    public withData = false;

    /** Empty hotbar slots, which decides whether the pick replaces the held item. */
    public maxSlots = 0;

    /** Reads the position, the data flag, and the slot count. */
    public decodePayload(): void {
        this.position = NetworkUtil.readBlockPosition(this);
        this.withData = this.readBoolean();
        this.maxSlots = this.readByte();
    }

    /** Writes the position, the data flag, and the slot count. */
    public encodePayload(): void {
        NetworkUtil.writeBlockPosition(this, this.position);
        this.writeBoolean(this.withData);
        this.writeByte(this.maxSlots);
    }
}
