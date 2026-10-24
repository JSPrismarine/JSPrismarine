import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The docs' `AgentActionType`, the action a Code Builder agent was asked to perform.
 *
 * Numbered as the client writes it, from 1. Mojang's rendered page lists the members from 0,
 * which is a display artifact: the datagen snapshot, gophertunnel, and PocketMine all start at
 * `Attack` = 1, and the 1.26.60 preview changelog "moves" every member up by one to match.
 */
export enum AgentActionType {
    ATTACK = 1,
    COLLECT = 2,
    DESTROY = 3,
    DETECT_REDSTONE = 4,
    DETECT_OBSTACLE = 5,
    DROP = 6,
    DROP_ALL = 7,
    INSPECT = 8,
    INSPECT_DATA = 9,
    INSPECT_ITEM_COUNT = 10,
    INSPECT_ITEM_DETAIL = 11,
    INSPECT_ITEM_SPACE = 12,
    INTERACT = 13,
    MOVE = 14,
    PLACE_BLOCK = 15,
    TILL = 16,
    TRANSFER_ITEM_TO = 17,
    TURN = 18
}

/** The fields of an `AgentActionEventPacket`, in wire order. */
export interface AgentActionEvent {
    /** `Request Id`, the identifier Code Builder attached to the action it asked for. */
    requestId: string;
    /** `Action`, which kind of agent action this event answers. */
    action: AgentActionType;
    /** `Response`, a `Json::Value` carried as its serialized JSON text. */
    response: string;
}

/**
 * Tells a Code Builder client how one of its agent's actions turned out.
 *
 * Protocol 2193 layout, in wire order: `Request Id` as a string, `Action` as a plain
 * little-endian int32 holding an {@link AgentActionType}, then `Response` as a string holding
 * JSON text. Strings are a varuint32 byte length followed by UTF-8. The docs type `Response`
 * as `Json::Value` with the constraint that it parses as JSON; this packet does not parse it.
 *
 * `Action` is the only non-varint integer in the packet. A reader that takes it for a
 * ZigZag varint consumes one byte and reads the remaining three as the response length.
 */
export default class AgentActionEventPacket extends NetworkPacket<AgentActionEvent> {
    public get id(): number {
        return PacketIdentifier.AGENT_ACTION_EVENT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: AgentActionEvent): void {
        stream.writeString(data.requestId);
        stream.writeIntLE(data.action);
        stream.writeString(data.response);
    }

    protected deserializePayload(stream: NetworkBinaryStream): AgentActionEvent {
        return {
            requestId: stream.readString(),
            action: stream.readIntLE(),
            response: stream.readString()
        };
    }
}
