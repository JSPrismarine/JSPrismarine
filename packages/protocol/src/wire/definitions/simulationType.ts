/**
 * `SimulationTypePacket`: Switches the client's simulation type for toolbox mode. Mojang's docs
 * mark it as not yet supported, so a vanilla client ignores it.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `SimulationTypePacket` field list. */
export const simulationTypePacket = definePacket('SimulationTypePacket', {
    /** `Sim Type`, the simulation the client should switch to. */
    simType: t.uint8
});

/** Switches the client's simulation type for toolbox mode. */
export type SimulationTypePayload = PayloadOf<typeof simulationTypePacket>;
