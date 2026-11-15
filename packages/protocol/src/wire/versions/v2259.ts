import { packetIds as packetIds2225 } from './v2225';

/**
 * The wire facts of protocol 2259 (Minecraft Preview 1.26.70.24), as a delta over protocol 2225.
 *
 * A preview protocol: the server negotiates it with clients that announce it but advertises the
 * newest release. It is replaced, not kept beside, when the next preview or the 1.26.70 release
 * lands; see `docs/research/protocol-2259-delta.md`.
 *
 * Read off Mojang's bedrock-protocol-docs v1.26.70-preview.24 `metadata.zip`
 * (`MinecraftPacketIds.json`, sha256 25894ed1d026410cf504b9cae9703068368424ca819c9af73d72c6fd9229ccc4).
 * 2259 removes the two volume-entity packets and adds seven, renumbering nothing.
 */

/** The protocol version, as `RequestNetworkSettings` carries it. */
export const protocolVersion = 2259;

/** The Minecraft versions that speak protocol 2259, in ascending order. */
export const minecraftVersions: readonly string[] = ['1.26.70.24'];

/** Whether this protocol is a Minecraft preview. The docs build reads this line. */
export const preview = true;

/**
 * The packets 1.26.70 added, keyed by the names their classes would export from the packet
 * barrel. None has a packet class yet, so the codec decodes each to `null`.
 */
export const addedPacketIds = {
    ChatPacket: 0x169,
    ServerboundRequestOnlineMusicPlaybackPacket: 0x16a,
    ClientboundOnlineMusicPlaybackResponsePacket: 0x16b,
    PlayerToggleArmorVisibilityRequestPacket: 0x16c,
    ClientboundMusicPlaybackFailurePacket: 0x16d,
    VirtualContainerOpenPacket: 0x16e,
    VirtualContainerClosePacket: 0x16f
} as const;

/** The packets 1.26.70 removed. Their ids, 0xa6 and 0xa7, are unassigned at 2259. */
export const removedPacketNames = ['AddVolumeEntityPacket', 'RemoveVolumeEntityPacket'] as const;

const removed: ReadonlySet<string> = new Set(removedPacketNames);

/** Packet class name to wire id at protocol 2259: 2225's table less the removed packets, plus the added ones. */
export const packetIds: Readonly<Record<string, number>> = {
    ...Object.fromEntries(Object.entries(packetIds2225).filter(([name]) => !removed.has(name))),
    ...addedPacketIds
};
