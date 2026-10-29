import AddActorPacket from './AddActorPacket';
import { readPassengerOfBlock, writePassengerOfBlock } from '../type/PassengerOfBlock';
import type { PassengerOfBlock } from '../type/PassengerOfBlock';

/**
 * `AddActorPacket` at protocol 2225, which appends one field to the 2193 layout:
 * `Passenger Block Data` as a trailing optional {@link PassengerOfBlock}.
 *
 * Verified against the v1.26.60 `metadata.zip` (`AddActorPacketPayload.json`) and
 * gophertunnel's `AddActor.Marshal` at v1.63.0 (`OptionalMarshaler` of `PassengerOfBlock`
 * last), which agree. Nothing before it changed. The server tracks no block riding yet, so
 * it writes the field absent.
 */
export default class AddActorPacket2225 extends AddActorPacket {
    /** Passenger Block Data: the block the entity is riding, or `null` for not riding. */
    public passengerOfBlock: PassengerOfBlock | null = null;

    /** The base packet's name, so handlers and name-keyed id lookups never see the version suffix. */
    public override getName(): string {
        return 'AddActorPacket';
    }

    /** Writes the 2193 fields, then the trailing optional Passenger Block Data. */
    public override encodePayload(): void {
        super.encodePayload();
        writePassengerOfBlock(this, this.passengerOfBlock);
    }

    /** Reads the 2193 fields back, then the trailing optional Passenger Block Data. */
    public override decodePayload(): void {
        super.decodePayload();
        this.passengerOfBlock = readPassengerOfBlock(this);
    }
}
