/**
 * `TransferPacket`: sends the client to another server, optionally with experience metadata.
 *
 * The payload is the destination address, port, a reload flag, then an optional gatherings
 * configuration whose own optional fields each carry a presence boolean, in the order on
 * Mojang's packet page.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/transfer-packet/
 */
import { definePacket, gated } from '../define';
import * as t from '../fieldTypes';
import { uuid } from '../structureTypes';
import { SINCE_2259 } from '../wireGates';

import type { PayloadOf } from '../define';

/** The fields sent when one client is transferred to another server. */
export const transferPacket = definePacket('TransferPacket', {
    /** `Server Address`: hostname or IP address of the destination. */
    address: t.string,
    /** `Server Port`: destination port, written as a little-endian unsigned 16-bit integer. */
    port: t.lu16,
    /** `Reload World`: whether the client reloads the world after the transfer. */
    reloadWorld: t.bool,
    /** `Gatherings Configuration`: experience metadata, or `null` when the server sends none. */
    gatheringsConfig: t.optional(
        t.record({
            /** `experienceId`: unique identifier for the experience. */
            experienceId: uuid,
            /** `experienceName`: display name of the experience. */
            experienceName: t.string,
            /** `worldId`: unique identifier for the experience world, when one is supplied. */
            worldId: t.optional(uuid),
            /** `worldName`: display name of the experience world, when one is supplied. */
            worldName: t.optional(t.string),
            /** `creatorId`: identifier of the experience creator. */
            creatorId: t.string,
            /** `targetId`: unique identifier of the target, when one is supplied. */
            targetId: t.optional(uuid),
            /** `scenarioId`: identifier of the scenario, when one is supplied. */
            scenarioId: t.optional(t.string),
            /** `serverId`: identifier of the destination server, when one is supplied. */
            serverId: t.optional(t.string)
        })
    ),
    /**
     * `Server Transfer Settings` from protocol 2259: an optional `TransferPlayerUIOptions` that
     * styles the loading screen of a server-to-server transfer. Each of its seven members is
     * optional behind its own presence byte, as the schema lists none as required.
     */
    transferSettings: gated(
        SINCE_2259,
        t.optional(
            t.record({
                /** `TitleText`. */
                titleText: t.optional(t.string),
                /** `BodyText`. */
                bodyText: t.optional(t.string),
                /** `TitleVisible`. */
                titleVisible: t.optional(t.bool),
                /** `BodyVisible`. */
                bodyVisible: t.optional(t.bool),
                /** `CancelButtonText`. */
                cancelButtonText: t.optional(t.string),
                /** `CancelButtonVisible`. */
                cancelButtonVisible: t.optional(t.bool),
                /** `CancelButtonDelaySeconds`. */
                cancelButtonDelaySeconds: t.optional(t.lf32)
            })
        ),
        null
    )
});

/** Payload carried by `TransferPacket`. */
export type TransferPayload = PayloadOf<typeof transferPacket>;
