import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';
import Vec2 from './Vec2';
import Vec3 from './Vec3';

/**
 * A `WorldPosition`: `Position` as three little-endian floats, then `DimensionType` as a
 * ZigZag varint32 runtime id.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/world-position/}
 */
export interface WorldPosition {
    /** `Position`, the point in the dimension. */
    position: Vec3;
    /** `DimensionType`, the dimension's runtime id. The vanilla ones are 0 to 2. */
    dimensionType: number;
}

/**
 * A `ServerWaypoint::Payload`: the fields of one locator bar waypoint the server wants the
 * client to add or update. Every field after the flag is optional on the wire; a `Remove`
 * entry carries none of them.
 *
 * Protocol 2193 wire order:
 * 0. `UpdateFlag`: little-endian uint32, a bitmask naming which of the fields below the
 *    client should apply. Mojang's docs publish no bit numbers for it.
 * 1. `IsVisible`: optional, one byte.
 * 2. `WorldPosition`: optional, a {@link WorldPosition}.
 * 3. `TexturePath`: optional, string. Picks the texture the waypoint renders with.
 * 4. `IconSize`: optional, a {@link Vec2} of two little-endian floats. The client's default is 1 by 1.
 * 5. `Color`: optional, little-endian int32. The tint the client applies to the texture.
 * 6. `ClientPositionAuthority`: optional, one byte. When set, the client moves the waypoint itself each tick.
 * 7. `ActorUniqueID`: optional, ZigZag varint64. The actor the waypoint follows.
 *
 * Each optional field is a presence byte, then the value when the byte is 1.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/server-waypoint-payload/}
 */
export default class ServerWaypointPayload extends NetworkStructure {
    /**
     * Creates a payload from its fields. Every parameter has a default so the static
     * `deserialize` can construct an empty instance before reading the stream. An optional
     * field left `undefined` goes on the wire as a 0 presence byte and nothing else.
     * @param updateFlag - `UpdateFlag`, in `[0, 2^32)`.
     * @param isVisible - `IsVisible`.
     * @param worldPosition - `WorldPosition`.
     * @param texturePath - `TexturePath`, for example "textures/ui/locator_bar/waypoint".
     * @param iconSize - `IconSize`.
     * @param color - `Color`, packed ARGB in `[-2^31, 2^31)`. A literal with the alpha byte set is above the range, so pass it as `0xffff0000 | 0`.
     * @param clientPositionAuthority - `ClientPositionAuthority`.
     * @param actorUniqueId - `ActorUniqueID`.
     */
    public constructor(
        public updateFlag = 0,
        public isVisible?: boolean,
        public worldPosition?: WorldPosition,
        public texturePath?: string,
        public iconSize?: Vec2,
        public color?: number,
        public clientPositionAuthority?: boolean,
        public actorUniqueId?: bigint
    ) {
        super();
    }

    private static writeOptional<T>(
        stream: NetworkBinaryStream,
        value: T | undefined,
        write: (value: T) => void
    ): void {
        stream.writeBoolean(value !== undefined);
        if (value !== undefined) write(value);
    }

    private static readOptional<T>(stream: NetworkBinaryStream, read: () => T): T | undefined {
        return stream.readBoolean() ? read() : undefined;
    }

    /** Writes the flag, then the seven optional fields in wire order. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeUnsignedIntLE(this.updateFlag);
        ServerWaypointPayload.writeOptional(stream, this.isVisible, (value) => stream.writeBoolean(value));
        ServerWaypointPayload.writeOptional(stream, this.worldPosition, (value) => {
            value.position.serialize(stream);
            stream.writeVarInt(value.dimensionType);
        });
        ServerWaypointPayload.writeOptional(stream, this.texturePath, (value) => stream.writeString(value));
        ServerWaypointPayload.writeOptional(stream, this.iconSize, (value) => value.serialize(stream));
        ServerWaypointPayload.writeOptional(stream, this.color, (value) => stream.writeIntLE(value));
        ServerWaypointPayload.writeOptional(stream, this.clientPositionAuthority, (value) =>
            stream.writeBoolean(value)
        );
        ServerWaypointPayload.writeOptional(stream, this.actorUniqueId, (value) => stream.writeVarLong(value));
    }

    /** Reads the flag, then the seven optional fields in wire order. */
    public deserialize(stream: NetworkBinaryStream): void {
        this.updateFlag = stream.readUnsignedIntLE();
        this.isVisible = ServerWaypointPayload.readOptional(stream, () => stream.readBoolean());
        this.worldPosition = ServerWaypointPayload.readOptional(stream, () => ({
            position: Vec3.deserialize(stream),
            dimensionType: stream.readVarInt()
        }));
        this.texturePath = ServerWaypointPayload.readOptional(stream, () => stream.readString());
        this.iconSize = ServerWaypointPayload.readOptional(stream, () => Vec2.deserialize(stream));
        this.color = ServerWaypointPayload.readOptional(stream, () => stream.readIntLE());
        this.clientPositionAuthority = ServerWaypointPayload.readOptional(stream, () => stream.readBoolean());
        this.actorUniqueId = ServerWaypointPayload.readOptional(stream, () => stream.readVarLong());
    }
}
