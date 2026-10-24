import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import BlockPosition from '../../world/BlockPosition';
import DataPacket from './DataPacket';

/**
 * The client asking the server to damage an anvil after a use.
 *
 * Wire layout at protocol 2193: Block Position as a `BlockPos` (three ZigZag varint32). The
 * uint8 damage amount that older builds carried is gone: Mojang's release note ADO:1562428
 * removed it because the server works the damage out itself. The client only sends this
 * when the server runs without the item stack net manager, which this server does.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/anvil-damage-packet/
 */
export default class AnvilDamagePacket extends DataPacket {
    public static NetID = Identifiers.AnvilDamagePacket;

    public blockPosition = new BlockPosition(0, 0, 0);

    /** Reads the anvil position. */
    public decodePayload(): void {
        this.blockPosition = NetworkUtil.readBlockPosition(this);
    }

    /** Writes the anvil position. */
    public encodePayload(): void {
        NetworkUtil.writeBlockPosition(this, this.blockPosition);
    }
}
