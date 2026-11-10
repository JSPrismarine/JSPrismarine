/** `AgentActionEventPacket`: Tells a Code Builder client how one of its agent's actions turned out. */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `AgentActionEventPacket` field list. */
export const agentActionEventPacket = definePacket('AgentActionEventPacket', {
    /** `Request Id`, the identifier Code Builder attached to the action it asked for. */
    requestId: t.string,
    /** `Action`, which kind of agent action this event answers. */
    action: t.li32,
    /** `Response`, a `Json::Value` carried as its serialized JSON text. */
    response: t.string
});

/** Tells a Code Builder client how one of its agent's actions turned out. */
export type AgentActionEventPayload = PayloadOf<typeof agentActionEventPacket>;
