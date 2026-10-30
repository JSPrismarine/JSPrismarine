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
import { levelEventGenericPacket } from './levelEventGeneric';
import { levelSoundEventPacket } from './levelSoundEvent';
import { playStatusPacket } from './playStatus';
import { resourcePacksInfoPacket, resourcePackStackPacket } from './resourcePacks';
import { serverToClientHandshakePacket } from './serverToClientHandshake';
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
import { trimDataPacket } from './trimData';
import { updateAbilitiesPacket } from './updateAbilities';
import { updateSubChunkBlocksPacket } from './updateSubChunkBlocks';

import type { PacketDefinition } from '../define';

/** The declaratively defined packets, keyed by packet name. */
export const wireDefinitions: ReadonlyMap<string, PacketDefinition> = new Map(
    [
        animatePacket,
        chunkRadiusUpdatedPacket,
        levelChunkPacket,
        levelEventGenericPacket,
        levelSoundEventPacket,
        playStatusPacket,
        resourcePacksInfoPacket,
        resourcePackStackPacket,
        serverToClientHandshakePacket,
        startGamePacket,
        trimDataPacket,
        updateAbilitiesPacket,
        updateSubChunkBlocksPacket,
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
