import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';

/**
 * A link between two actors, such as a rider and its vehicle.
 *
 * Wire layout, in docs order: `Target A` and `Target B` (each an `ActorUniqueID`, varint64),
 * `Type` (uint8 `ActorLinkType`: 0 `None`, 1 `Riding`, 2 `Passenger`), `Immediate` (boolean),
 * `Passenger Initiated` (boolean, whether the passenger changed the link), and
 * `Vehicle Angular Velocity` (float little endian).
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/actor-link/}
 */
export default class ActorLink extends NetworkStructure {
    /**
     * Creates a link.
     * @param actorAUniqueID - `Target A`, the vehicle's unique id.
     * @param actorBUniqueID - `Target B`, the rider's unique id.
     * @param type - `Type`, an `ActorLinkType` value.
     * @param immediate - `Immediate`, whether the client applies the link without interpolating.
     * @param riderInitiated - `Passenger Initiated`, whether the passenger changed the link.
     * @param vehicleAngularVelocity - `Vehicle Angular Velocity`.
     */
    public constructor(
        public actorAUniqueID: bigint,
        public actorBUniqueID: bigint,
        public type: number,
        public immediate: boolean,
        public riderInitiated: boolean,
        public vehicleAngularVelocity: number
    ) {
        super();
    }

    /** Writes the six fields in docs order. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeVarLong(this.actorAUniqueID);
        stream.writeVarLong(this.actorBUniqueID);
        stream.writeByte(this.type);
        stream.writeBoolean(this.immediate);
        stream.writeBoolean(this.riderInitiated);
        stream.writeFloatLE(this.vehicleAngularVelocity);
    }

    /** Reads the six fields in docs order. */
    public deserialize(stream: NetworkBinaryStream): void {
        this.actorAUniqueID = stream.readVarLong();
        this.actorBUniqueID = stream.readVarLong();
        this.type = stream.readByte();
        this.immediate = stream.readBoolean();
        this.riderInitiated = stream.readBoolean();
        this.vehicleAngularVelocity = stream.readFloatLE();
    }
}
