import AddPlayerPacket from './AddPlayerPacket';
import { readPassengerOfBlock, writePassengerOfBlock } from '../type/PassengerOfBlock';
import type { PassengerOfBlock } from '../type/PassengerOfBlock';

/**
 * `AddPlayerPacket` at protocol 2225, which inserts one field into the 2193 layout:
 * `Passenger Block Data` as an optional {@link PassengerOfBlock} between the actor links and
 * the device id, so the device id and build platform move one field later.
 *
 * Verified against the v1.26.60 `metadata.zip` (`AddPlayerPacketPayload.json`) and
 * gophertunnel's `AddPlayer.Marshal` at v1.63.0 (`OptionalMarshaler` of `PassengerOfBlock`
 * before `DeviceID`), which agree. Nothing else changed. The server tracks no block riding
 * yet, so it writes the field absent.
 */
export default class AddPlayerPacket2225 extends AddPlayerPacket {
    /** Passenger Block Data: the block the player is riding, or `null` for not riding. */
    public passengerOfBlock: PassengerOfBlock | null = null;

    /** The base packet's name, so handlers and name-keyed id lookups never see the version suffix. */
    public override getName(): string {
        return 'AddPlayerPacket';
    }

    protected override encodePassengerOfBlock(): void {
        writePassengerOfBlock(this, this.passengerOfBlock);
    }

    protected override decodePassengerOfBlock(): void {
        this.passengerOfBlock = readPassengerOfBlock(this);
    }
}
