import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Moves the player's hotbar selection.
 *
 * **Bound To:** Client
 *
 * Sent when something other than the player changes which slot is held: pick block on an
 * actor or a block, the `clear`, `give` and `replaceitem` commands, and the extra level data
 * a joining player receives.
 *
 * Protocol 2193 layout (docs id 48), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Selected Slot | varuint32 | Hotbar slot index |
 * | Container ID | uint8 | A `ContainerID`, normally the player inventory |
 * | Should select slot? | boolean | False leaves the held slot alone |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/player-hotbar-packet/
 */
export default class PlayerHotbarPacket extends DataPacket {
    public static NetID = Identifiers.PlayerHotbarPacket;

    /** Selected Slot, the hotbar index to hold. */
    public selectedSlot = 0;

    /**
     * Container ID, the container the slot belongs to. A `ContainerID` as
     * `WindowIds` in `@jsprismarine/minecraft` numbers them, so zero is the player inventory.
     */
    public containerId = 0;

    /** Should select slot?, whether the client actually moves its selection. */
    public shouldSelectSlot = true;

    /** Reads the slot, the container, and the selection flag. */
    public decodePayload(): void {
        this.selectedSlot = this.readUnsignedVarInt();
        this.containerId = this.readByte();
        this.shouldSelectSlot = this.readBoolean();
    }

    /** Writes the slot, the container, and the selection flag. */
    public encodePayload(): void {
        this.writeUnsignedVarInt(this.selectedSlot);
        this.writeByte(this.containerId);
        this.writeBoolean(this.shouldSelectSlot);
    }
}
