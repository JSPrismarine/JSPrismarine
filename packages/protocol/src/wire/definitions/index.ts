/**
 * Every packet described declaratively so far, by the name the codec id tables use.
 *
 * The round-trip suite walks this registry against raw payloads captured from a real Bedrock
 * Dedicated Server, and codecs resolve layouts from it. A packet converts to this model by
 * adding its definition here and making its class walk the layout; the suite picks it up from
 * the registry with no further registration.
 */
import { addActorPacket } from './addActor';
import { addPlayerPacket } from './addPlayer';
import {
    clientboundMatchmakingStatePacket,
    clientboundPlayAudioContentPacket,
    clientboundStonecutterSetRecipePacket,
    serverboundCursorItemDragPacket,
    serverboundMatchmakingCancelPacket,
    serverboundRegisterAudioContentPacket,
    serverboundStonecutterSetRecipePacket,
    setPassengerOfBlockPacket
} from './added2225';
import { actorEventPacket, removeActorPacket, takeItemActorPacket } from './actors';
import { animatePacket } from './animate';
import { availableActorIdentifiersPacket } from './availableActorIdentifiers';
import { biomeDefinitionListPacket } from './biomeDefinitionList';
import { blockActorDataPacket, updateBlockPacket } from './blocks';
import { cameraAimAssistPresetsPacket } from './cameraAimAssistPresets';
import { cameraPresetsPacket } from './cameraPresets';
import { setTitlePacket, textPacket } from './chat';
import { chunkRadiusUpdatedPacket } from './chunkRadiusUpdated';
import { containerClosePacket, containerOpenPacket, containerSetDataPacket, mobEquipmentPacket } from './containers';
import { modalFormRequestPacket, modalFormResponsePacket } from './forms';
import { gameRulesChangedPacket } from './gameRulesChanged';
import { interactPacket } from './interaction';
import { inventoryTransactionPacket } from './inventoryTransaction';
import { jigsawStructureDataPacket } from './jigsawStructureData';
import { levelChunkPacket } from './levelChunk';
import { levelEventGenericPacket } from './levelEventGeneric';
import { levelSoundEventPacket } from './levelSoundEvent';
import { moveActorAbsolutePacket, movePlayerPacket, setActorMotionPacket } from './movement';
import { playerActionPacket, setPlayerGameTypePacket, updatePlayerGameTypePacket } from './player';
import { playerListPacket } from './playerList';
import { playerSkinPacket } from './playerSkin';
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
import { setActorDataPacket } from './setActorData';
import { startGamePacket } from './startGame';
import { syncActorPropertyPacket } from './syncActorProperty';
import { trimDataPacket } from './trimData';
import { updateAbilitiesPacket } from './updateAbilities';
import { updateAttributesPacket } from './updateAttributes';
import { updateSubChunkBlocksPacket } from './updateSubChunkBlocks';
import { voxelShapesPacket } from './voxelShapes';

import type { PacketDefinition } from '../define';

/** The declaratively defined packets, keyed by packet name. */
export const wireDefinitions: ReadonlyMap<string, PacketDefinition> = new Map(
    [
        actorEventPacket,
        addActorPacket,
        addPlayerPacket,
        animatePacket,
        availableActorIdentifiersPacket,
        biomeDefinitionListPacket,
        blockActorDataPacket,
        cameraAimAssistPresetsPacket,
        cameraPresetsPacket,
        chunkRadiusUpdatedPacket,
        containerClosePacket,
        containerOpenPacket,
        containerSetDataPacket,
        gameRulesChangedPacket,
        interactPacket,
        inventoryTransactionPacket,
        jigsawStructureDataPacket,
        levelChunkPacket,
        levelEventGenericPacket,
        levelSoundEventPacket,
        mobEquipmentPacket,
        modalFormRequestPacket,
        modalFormResponsePacket,
        moveActorAbsolutePacket,
        movePlayerPacket,
        setActorMotionPacket,
        playerActionPacket,
        setPlayerGameTypePacket,
        updatePlayerGameTypePacket,
        playerListPacket,
        playerSkinPacket,
        playStatusPacket,
        removeActorPacket,
        resourcePacksInfoPacket,
        resourcePackStackPacket,
        serverToClientHandshakePacket,
        setActorDataPacket,
        setTitlePacket,
        startGamePacket,
        takeItemActorPacket,
        textPacket,
        syncActorPropertyPacket,
        trimDataPacket,
        updateAbilitiesPacket,
        updateAttributesPacket,
        updateBlockPacket,
        updateSubChunkBlocksPacket,
        voxelShapesPacket,
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
        updateAdventureSettingsPacket,
        clientboundMatchmakingStatePacket,
        clientboundPlayAudioContentPacket,
        clientboundStonecutterSetRecipePacket,
        serverboundCursorItemDragPacket,
        serverboundMatchmakingCancelPacket,
        serverboundRegisterAudioContentPacket,
        serverboundStonecutterSetRecipePacket,
        setPassengerOfBlockPacket
    ].map((definition) => [definition.name, definition])
);
