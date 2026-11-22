import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { educationSettingsPacket } from '../wire/definitions/educationSettings';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { EducationSettingsPayload } from '../wire/definitions/educationSettings';

/** The Education Edition settings for a world. */
export type EducationSettings = EducationSettingsPayload;

/** A link the Education Edition client offers alongside the world. */
export type ExternalLinkSettings = NonNullable<EducationSettings['externalLinkSettings']>;

/**
 * The Education Edition settings for a world, sent once while the game is starting.
 *
 * Code Builder is the feature most of this configures: the client opens the given URI in a
 * panel, which is how an Education world drives the server from code. The base game ignores
 * the packet.
 *
 * **Bound To:** Client
 *
 * Wire layout at protocol 2193: Code Builder Default URI and Code Builder Title as strings,
 * Can resize Code Builder and Disable legacy title bar as booleans, Post Process Filter and
 * Screenshot Border Resource Path as strings, Agent Capabilities as an optional Can Modify
 * Blocks boolean, Local Settings as an optional Code Builder Override Uri string, the
 * deprecated Always False boolean, then External Link Settings as an optional URL and Display
 * Name pair.
 *
 * The three optionals are consecutive, and the docs do not mark them optional until the 2207
 * changelog. gophertunnel writes their presence bytes at 2193 and the deprecated boolean sits
 * between the second and the third, so leaving one out shifts everything after it.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/education-settings-packet/
 */
export default class EducationSettingsPacket extends NetworkPacket<EducationSettings> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'EducationSettingsPacket';
    }

    /** Accepts payload data for sending or an encoded buffer for decoding. */
    public constructor(packetData?: EducationSettings | Buffer | null, buffer?: Buffer) {
        if (Buffer.isBuffer(packetData)) {
            super(null, packetData);
        } else {
            super(packetData ?? null, buffer);
        }
    }

    public get id(): number {
        return PacketIdentifier.EDUCATION_SETTINGS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: EducationSettings): void {
        layoutAt(educationSettingsPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): EducationSettings {
        return layoutAt(educationSettingsPacket, this.codecProtocol).decode(stream);
    }
}
