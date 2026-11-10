/**
 * `AddBehaviorTreePacket`: Sends a behavior tree as JSON text to an automation client. The protocol
 * carries the serialized JSON string; this packet does not parse or validate its contents.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/add-behavior-tree-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `AddBehaviorTreePacket` field list. */
export const addBehaviorTreePacket = definePacket('AddBehaviorTreePacket', {
    /** Behavior Tree Structure (JSON), preserved as its serialized string. */
    behaviorTreeStructure: t.string
});

/** Sends a behavior tree as JSON text to an automation client. */
export type AddBehaviorTreePayload = PayloadOf<typeof addBehaviorTreePacket>;
