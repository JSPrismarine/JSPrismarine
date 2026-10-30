/**
 * Every packet described declaratively so far, by the name the codec id tables use.
 *
 * The round-trip suite walks this registry against raw payloads captured from a real Bedrock
 * Dedicated Server, and codecs resolve layouts from it. A packet converts to this model by
 * adding its definition here and making its class walk the layout; the suite picks it up from
 * the registry with no further registration.
 */
import { animatePacket } from './animate';
import { chunkRadiusUpdatedPacket } from './chunkRadiusUpdated';
import { levelChunkPacket } from './levelChunk';
import { playStatusPacket } from './playStatus';
import {
    networkChunkPublisherUpdatePacket,
    networkSettingsPacket,
    playerFogPacket,
    playerHotbarPacket,
    respawnPacket,
    setCommandsEnabledPacket,
    setDifficultyPacket,
    setHealthPacket,
    setSpawnPositionPacket,
    setTimePacket,
    updateAdventureSettingsPacket
} from './worldStatus';
import { startGamePacket } from './startGame';

import type { PacketDefinition } from '../define';

/** The declaratively defined packets, keyed by packet name. */
export const wireDefinitions: ReadonlyMap<string, PacketDefinition> = new Map(
    [
        animatePacket,
        chunkRadiusUpdatedPacket,
        levelChunkPacket,
        playStatusPacket,
        startGamePacket,
        networkChunkPublisherUpdatePacket,
        networkSettingsPacket,
        playerFogPacket,
        playerHotbarPacket,
        respawnPacket,
        setCommandsEnabledPacket,
        setDifficultyPacket,
        setHealthPacket,
        setSpawnPositionPacket,
        setTimePacket,
        updateAdventureSettingsPacket
    ].map((definition) => [definition.name, definition])
);
