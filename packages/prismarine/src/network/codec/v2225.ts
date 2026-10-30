/**
 * Moved to `@jsprismarine/protocol`: a protocol version's wire facts are protocol surface,
 * usable without this server's logic. This shim keeps the old import path alive.
 */
export {
    addedPacketIds,
    minecraftVersions,
    packetIds,
    protocolVersion
} from '@jsprismarine/protocol/wire/versions/v2225';
