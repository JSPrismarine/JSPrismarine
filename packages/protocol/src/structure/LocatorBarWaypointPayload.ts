import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';
import ServerWaypointPayload from './ServerWaypointPayload';
import UUID from './UUID';

/**
 * `ServerWaypointGroup::Action`: what a `LocatorBarPacket` entry does to the waypoint it
 * names. The docs' values: `None` = 0, `Add` = 1, `Remove` = 2, `Update` = 3.
 */
export enum ServerWaypointGroupAction {
    None,
    Add,
    Remove,
    Update
}

/**
 * A `LocatorBarWaypointPayload`: one entry of a `LocatorBarPacket`.
 *
 * Protocol 2193 wire order:
 * 0. `GroupHandle`: the waypoint's `mce::UUID`, which the client keys its waypoint groups on.
 * 1. `ServerWaypointPayload`: a {@link ServerWaypointPayload}.
 * 2. `ActionFlag`: a {@link ServerWaypointGroupAction} as one byte. The docs tag it
 *    `Compression`; for a value below 128 the varuint and the byte are the same.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/locator-bar-waypoint-payload/}
 */
export default class LocatorBarWaypointPayload extends NetworkStructure {
    /**
     * Creates an entry from its fields. Every parameter has a default so the static
     * `deserialize` can construct an empty instance before reading the stream.
     * @param groupHandle - `GroupHandle`.
     * @param payload - `ServerWaypointPayload`. For `Remove`, a payload with only its flag.
     * @param action - `ActionFlag`.
     */
    public constructor(
        public groupHandle: UUID = new UUID(0n, 0n),
        public payload: ServerWaypointPayload = new ServerWaypointPayload(),
        public action: ServerWaypointGroupAction = ServerWaypointGroupAction.None
    ) {
        super();
    }

    /** Writes the handle, the payload, then the action byte. */
    public serialize(stream: NetworkBinaryStream): void {
        this.groupHandle.serialize(stream);
        this.payload.serialize(stream);
        stream.writeByte(this.action);
    }

    /** Reads the handle, the payload, then the action byte. */
    public deserialize(stream: NetworkBinaryStream): void {
        this.groupHandle = UUID.deserialize(stream);
        this.payload = ServerWaypointPayload.deserialize(stream);
        this.action = stream.readByte();
    }
}
