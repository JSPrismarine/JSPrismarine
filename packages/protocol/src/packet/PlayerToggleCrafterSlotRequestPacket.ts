import { playerToggleCrafterSlotRequestPacket } from '../wire/definitions/playerToggleCrafterSlotRequest';
import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';

/**
 * The client enabling or disabling one slot of a crafter block.
 *
 * Wire layout at protocol 2193: Pos X, Pos Y, and Pos Z as int32 LE (not a varint block
 * position), Slot Index as a uint8, then Is Disabled as a boolean.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/player-toggle-crafter-slot-request-packet/
 */
export default class PlayerToggleCrafterSlotRequestPacket extends FieldNetworkPacket {
    public posX = 0;
    public posY = 0;
    public posZ = 0;

    /** Which of the nine crafter slots, 0 to 8. */
    public slotIndex = 0;

    /** `true` to block the slot from receiving items. */
    public isDisabled = false;

    /** Reads the position, slot, and flag. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(playerToggleCrafterSlotRequestPacket, this.codecProtocol).decode(this));
    }

    /** Writes the position, slot, and flag. */
    public encodePayload(): void {
        layoutAt(playerToggleCrafterSlotRequestPacket, this.codecProtocol).encode(this, this);
    }
}
