import * as Packets from '../Packets';
import CommandRequestPacket from '@jsprismarine/protocol/packet/CommandRequestPacket';
import SetCommandsEnabledPacket from '@jsprismarine/protocol/packet/SetCommandsEnabledPacket';
import SetDifficultyPacket from '@jsprismarine/protocol/packet/SetDifficultyPacket';
import SetHealthPacket from '@jsprismarine/protocol/packet/SetHealthPacket';
import ChangeDimensionPacket from '@jsprismarine/protocol/packet/ChangeDimensionPacket';
import PlayerHotbarPacket from '@jsprismarine/protocol/packet/PlayerHotbarPacket';
import NetworkChunkPublisherUpdatePacket from '@jsprismarine/protocol/packet/NetworkChunkPublisherUpdatePacket';
import UpdateAdventureSettingsPacket from '@jsprismarine/protocol/packet/UpdateAdventureSettingsPacket';
import PlayerFogPacket from '@jsprismarine/protocol/packet/PlayerFogPacket';
import RespawnPacket from '@jsprismarine/protocol/packet/RespawnPacket';
import SetSpawnPositionPacket from '@jsprismarine/protocol/packet/SetSpawnPositionPacket';
import SetTimePacket from '@jsprismarine/protocol/packet/SetTimePacket';
import {
    biome_definitions_network,
    block_definitions,
    entity_identifiers,
    jigsaw_structure_data
} from '@jsprismarine/bedrock-data';
import type { ProtocolContext } from '@jsprismarine/protocol';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import { itemData2193 } from './itemData';
import type { ProtocolItemData } from '@jsprismarine/protocol';
import type { ProtocolCodec } from './ProtocolCodec';
import { minecraftVersions, netIdFor, packetIds, protocolVersion } from '@jsprismarine/protocol/wire/versions/v2193';

/** Exported packet classes no codec lists: the base class and the batch envelope. */
export type PacketClass =
    | (typeof Packets)[keyof typeof Packets]
    | typeof CommandRequestPacket
    | typeof SetCommandsEnabledPacket
    | typeof SetDifficultyPacket
    | typeof SetHealthPacket
    | typeof ChangeDimensionPacket
    | typeof PlayerHotbarPacket
    | typeof NetworkChunkPublisherUpdatePacket
    | typeof UpdateAdventureSettingsPacket
    | typeof PlayerFogPacket
    | typeof RespawnPacket
    | typeof SetSpawnPositionPacket
    | typeof SetTimePacket;

const protocolPackets = {
    CommandRequestPacket,
    SetCommandsEnabledPacket,
    SetDifficultyPacket,
    SetHealthPacket,
    ChangeDimensionPacket,
    PlayerHotbarPacket,
    NetworkChunkPublisherUpdatePacket,
    UpdateAdventureSettingsPacket,
    PlayerFogPacket,
    RespawnPacket,
    SetSpawnPositionPacket,
    SetTimePacket
} satisfies Record<string, PacketClass>;

/**
 * The codec for protocol 2193, built from the packet barrel and the 2193 id table. The first
 * concrete {@link ProtocolCodec}; a later version extends it with only its id table and its
 * version-gated data, because a packet whose wire layout changed carries the difference as
 * data in its declarative definition and reads the protocol stamp. One class serves every
 * version, so a codec never substitutes classes and never copies a packet.
 *
 * The id-to-class map is built on first use rather than at module load, because this module
 * and the packet barrel import each other: the barrel's classes must finish evaluating before
 * the barrel's exports can be walked.
 */
export class Codec2193 implements ProtocolCodec {
    public readonly protocolVersion: number = protocolVersion;
    public readonly minecraftVersions: readonly string[] = minecraftVersions;
    public readonly ids: Readonly<Record<string, number>> = packetIds;
    public readonly itemData: ProtocolItemData = itemData2193;
    public readonly context: ProtocolContext = {
        protocolVersion,
        itemData: itemData2193,
        blockDefinitions: block_definitions,
        entityIdentifiers: entity_identifiers,
        biomeDefinitions: biome_definitions_network,
        jigsawStructureData: jigsaw_structure_data
    };

    private byId: Map<number, PacketClass> | null = null;

    private table(): Map<number, PacketClass> {
        if (this.byId === null) {
            this.byId = new Map();
            for (const [name, packet] of Object.entries(Packets)) {
                const id = this.netIdOf(name);
                if (id !== undefined) this.byId.set(id, packet);
            }

            for (const [name, packet] of Object.entries(protocolPackets)) {
                const id = this.netIdOf(name);
                if (id !== undefined) this.byId.set(id, packet);
            }
        }

        return this.byId;
    }

    /** A packet instance for an inbound wire id; see {@link ProtocolCodec.createPacket}. */
    public createPacket(netId: number, buffer?: Buffer): NetworkPacket<unknown> | null {
        const packetClass = this.table().get(netId);
        if (packetClass === undefined) return null;

        const packet = new packetClass(buffer);
        packet.setNetId(netId);
        packet.codecProtocol = this.protocolVersion;
        return packet;
    }

    /**
     * The outbound instance for this codec's wire; see {@link ProtocolCodec.prepareOutbound}.
     *
     * A stamp and nothing else, at any number of versions: a version-gated layout or data table
     * reads the stamp when the packet encodes, and everything else ignores it.
     */
    public prepareOutbound(packet: NetworkPacket<unknown>): NetworkPacket<unknown> {
        packet.codecProtocol = this.protocolVersion;
        return packet;
    }

    /** The wire id under a packet class name; see {@link ProtocolCodec.netIdOf}. */
    public netIdOf(name: string): number | undefined {
        return netIdFor(name);
    }
}

export default new Codec2193();
