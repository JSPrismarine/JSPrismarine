import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { simulationTypePacket } from '../wire/definitions/simulationType';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The `SimulationType` enum carried by `SimulationTypePacket`, numbered as the protocol 2193
 * docs and Mojang's enum snapshot list them.
 */
export enum SimulationType {
    /** Docs: `Game`. */
    Game = 0,
    /** Docs: `Editor`. */
    Editor = 1,
    /** Docs: `Test`. */
    Test = 2,
    /** Docs: `INVALID`. */
    Invalid = 3
}

/** The one field of `SimulationTypePacket`. */
export interface SimulationTypeData {
    /** `Sim Type`, the simulation the client should switch to. */
    simType: SimulationType;
}

/**
 * Switches the client's simulation type for toolbox mode. Mojang's docs mark it as not yet
 * supported, so a vanilla client ignores it.
 *
 * Protocol 2193 layout after the header: `Sim Type`, one byte holding a
 * {@link SimulationType} value. Nothing else.
 */
export default class SimulationTypePacket extends NetworkPacket<SimulationTypeData> {
    public get id(): number {
        return PacketIdentifier.SIMULATION_TYPE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SimulationTypeData): void {
        layoutAt(simulationTypePacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): SimulationTypeData {
        return layoutAt(simulationTypePacket, this.codecProtocol).decode(stream);
    }
}
