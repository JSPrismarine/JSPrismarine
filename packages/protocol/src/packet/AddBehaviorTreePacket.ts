import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** JSON text containing the behavior tree sent to an automation client. */
export interface AddBehaviorTree {
    /** Behavior Tree Structure (JSON), preserved as its serialized string. */
    behaviorTreeStructure: string;
}

/**
 * Sends a behavior tree as JSON text to an automation client. The protocol carries the
 * serialized JSON string; this packet does not parse or validate its contents.
 *
 * Protocol 2193 layout: `Behavior Tree Structure (JSON)` as a varuint32-length-prefixed
 * UTF-8 string.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/add-behavior-tree-packet/
 */
export default class AddBehaviorTreePacket extends NetworkPacket<AddBehaviorTree> {
    public get id(): number {
        return PacketIdentifier.ADD_BEHAVIOR_TREE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: AddBehaviorTree): void {
        stream.writeString(data.behaviorTreeStructure);
    }

    protected deserializePayload(stream: NetworkBinaryStream): AddBehaviorTree {
        return { behaviorTreeStructure: stream.readString() };
    }
}
