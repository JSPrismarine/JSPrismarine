import { packetIds as packetIds2193 } from './v2193';

/**
 * The wire facts of protocol 2225 (Minecraft 1.26.60), as a delta over protocol 2193.
 *
 * Verified against Mojang's bedrock-protocol-docs v1.26.60 `metadata.zip`
 * (`MinecraftPacketIds.json`, sha256 a030a45d825b9ec8ea6bb744283648d5db1c0111592a8fd5eb0096ff05a0464b)
 * and gophertunnel's `packet/id.go` at v1.63.0; the two agree. 2225 removes and renumbers
 * nothing, so the table is 2193's plus the eight packets 1.26.60 added. See
 * docs/research/protocol-2225-delta.md for the full delta and its sources.
 */

/** The protocol version, as `RequestNetworkSettings` carries it. */
export const protocolVersion = 2225;

/** The Minecraft versions that speak protocol 2225, in ascending order. */
export const minecraftVersions: readonly string[] = ['1.26.60'];

/**
 * The packets 1.26.60 added, keyed by the names their classes export from the packet barrel.
 * The codec uses these names to pair each new id with its Protocol packet implementation.
 */
export const addedPacketIds = {
    ClientboundMatchmakingStatePacket: 0x161,
    ServerboundStonecutterSetRecipePacket: 0x162,
    ClientboundStonecutterSetRecipePacket: 0x163,
    ServerboundMatchmakingCancelPacket: 0x164,
    SetPassengerOfBlockPacket: 0x165,
    ServerboundCursorItemDragPacket: 0x166,
    ClientboundPlayAudioContentPacket: 0x167,
    ServerboundRegisterAudioContentPacket: 0x168
} as const;

/** Packet class name to wire id at protocol 2225: 2193's table plus the added packets. */
export const packetIds: Readonly<Record<string, number>> = { ...packetIds2193, ...addedPacketIds };
