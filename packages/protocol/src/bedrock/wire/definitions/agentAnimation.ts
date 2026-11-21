/**
 * `AgentAnimationPacket`: Tells clients that a Code Builder agent played an animation, so each of
 * them replicates it.
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';

/** The `AgentAnimationPacket` field list. */
export const agentAnimationPacket = definePacket('AgentAnimationPacket', {
    /** `Agent Animation`, which animation the agent plays. */
    animation: t.uint8,
    /** `Runtime Id`, the `ActorRuntimeID` of the agent. */
    runtimeId: t.varuint64
});

/** Tells clients that a Code Builder agent played an animation, so each of them replicates it. */
export type AgentAnimationPayload = PayloadOf<typeof agentAnimationPacket>;
