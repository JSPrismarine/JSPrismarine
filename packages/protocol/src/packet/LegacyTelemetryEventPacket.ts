import {
    LegacyTelemetryEventDataOrdinal,
    LegacyTelemetryEventType,
    legacyTelemetryEventPacket
} from '../wire/definitions/legacyTelemetryEvent';
import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';

import type { LegacyTelemetryEventData } from '../wire/definitions/legacyTelemetryEvent';

export { LegacyTelemetryEventDataOrdinal, LegacyTelemetryEventType };
export type { LegacyTelemetryEventData };

/**
 * Hands a telemetry event to the client so the client can forward it to Mojang's eventing
 * service.
 *
 * **Bound To:** Client
 *
 * The server does nothing with the event itself; the client is only a relay. This server
 * reports no telemetry, so nothing builds one of these, but the layout is here so a captured
 * session decodes.
 *
 * Protocol 2193 and 2225 layout (docs id 65; the pages differ only in enum numbers of plain-number
 * fields), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Target Actor ID | varint64 | The actor the event is about |
 * | Event Type | varint32 | One of {@link LegacyTelemetryEventType} |
 * | Use Player ID | boolean | |
 * | Event Data | oneOf | A varuint32 ordinal, then the alternative's own fields |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/legacy-telemetry-event-packet/
 */
export default class LegacyTelemetryEventPacket extends FieldNetworkPacket {
    /** Target Actor ID, the actor the event happened to. */
    public targetActorId = 0n;

    /** Event Type, what happened. */
    public eventType: LegacyTelemetryEventType = LegacyTelemetryEventType.Achievement;

    /** Use Player ID, whose purpose Mojang has never documented. */
    public usePlayerId = false;

    /** Event Data, the payload belonging to the event. */
    public eventData: LegacyTelemetryEventData = { ordinal: LegacyTelemetryEventDataOrdinal.Empty };

    /** Reads the actor, the event type, and the event's own payload. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(legacyTelemetryEventPacket, this.codecProtocol).decode(this));
    }

    /** Writes the actor, the event type, and the event's own payload. */
    public encodePayload(): void {
        layoutAt(legacyTelemetryEventPacket, this.codecProtocol).encode(this, this);
    }
}
