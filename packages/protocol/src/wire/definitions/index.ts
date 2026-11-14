/**
 * Every packet described declaratively so far, by the name the codec id tables use.
 *
 * The round-trip suite walks this registry against raw payloads captured from a real Bedrock
 * Dedicated Server, and codecs resolve layouts from it. A packet converts to this model by
 * adding its definition here and making its class walk the layout; the suite picks it up from
 * the registry with no further registration.
 */
import { addActorPacket } from './addActor';
import { addItemActorPacket } from './addItemActor';
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
import {
    actorEventPacket,
    mobEffectPacket,
    removeActorPacket,
    setActorLinkPacket,
    takeItemActorPacket
} from './actors';
import { animatePacket } from './animate';
import { availableActorIdentifiersPacket } from './availableActorIdentifiers';
import { biomeDefinitionListPacket } from './biomeDefinitionList';
import { blockActorDataPacket, updateBlockPacket } from './blocks';
import { bossEventPacket } from './bossEvent';
import { cameraAimAssistPresetsPacket } from './cameraAimAssistPresets';
import { cameraPresetsPacket } from './cameraPresets';
import { cameraSplinePacket } from './cameraSpline';
import { setTitlePacket, textPacket } from './chat';
import { chunkRadiusUpdatedPacket, requestChunkRadiusPacket } from './chunkRadiusUpdated';
import { clientCacheStatusPacket } from './clientCache';
import { clientToServerHandshakePacket } from './clientToServerHandshake';
import { commandOutputPacket, commandRequestPacket } from './commands';
import { currentStructureFeaturePacket } from './currentStructureFeature';
import { disconnectPacket } from './disconnect';
import { onScreenTextureAnimationPacket, spawnParticleEffectPacket } from './effects';
import {
    containerClosePacket,
    containerOpenPacket,
    containerSetDataPacket,
    inventoryContentPacket,
    inventorySlotPacket,
    mobEquipmentPacket
} from './containers';
import { modalFormRequestPacket, modalFormResponsePacket } from './forms';
import { gameRulesChangedPacket } from './gameRulesChanged';
import { interactPacket } from './interaction';
import { inventoryTransactionPacket } from './inventoryTransaction';
import { jigsawStructureDataPacket } from './jigsawStructureData';
import { levelChunkPacket } from './levelChunk';
import { levelEventGenericPacket } from './levelEventGeneric';
import { levelSoundEventPacket, playSoundPacket, stopSoundPacket } from './levelSoundEvent';
import { moveActorAbsolutePacket, movePlayerPacket, setActorMotionPacket } from './movement';
import { requestNetworkSettingsPacket } from './networkSettings';
import {
    emotePacket,
    playerActionPacket,
    setLocalPlayerAsInitializedPacket,
    setPlayerGameTypePacket,
    updatePlayerGameTypePacket
} from './player';
import { playerListPacket } from './playerList';
import { playerSkinPacket } from './playerSkin';
import { playStatusPacket } from './playStatus';
import {
    resourcePackChunkDataPacket,
    resourcePackClientResponsePacket,
    resourcePackChunkRequestPacket,
    resourcePackDataInfoPacket,
    resourcePacksInfoPacket,
    resourcePackStackPacket
} from './resourcePacks';
import { serverSettingsRequestPacket } from './serverSettings';
import { serverToClientHandshakePacket } from './serverToClientHandshake';
import {
    changeDimensionPacket,
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
import {
    removeObjectivePacket,
    setDisplayObjectivePacket,
    setScoreboardIdentityPacket,
    setScorePacket
} from './scoreboard';
import { setActorDataPacket } from './setActorData';
import { showCreditsPacket } from './showCredits';
import { startGamePacket } from './startGame';
import { syncActorPropertyPacket } from './syncActorProperty';
import { syncWorldClocksPacket } from './syncWorldClocks';
import { trimDataPacket } from './trimData';
import { updateAbilitiesPacket } from './updateAbilities';
import { updateAttributesPacket } from './updateAttributes';
import { updateSubChunkBlocksPacket } from './updateSubChunkBlocks';
import { voxelShapesPacket } from './voxelShapes';

import { actorPickRequestPacket } from './actorPickRequest';
import { addBehaviorTreePacket } from './addBehaviorTree';
import { agentActionEventPacket } from './agentActionEvent';
import { agentAnimationPacket } from './agentAnimation';
import { automationClientConnectPacket } from './automationClientConnect';
import { cameraPacket } from './camera';
import { cameraShakePacket } from './cameraShake';
import { changeMobPropertyPacket } from './changeMobProperty';
import { clientCameraAimAssistPacket } from './clientCameraAimAssist';
import { codeBuilderPacket } from './codeBuilder';
import { codeBuilderSourcePacket } from './codeBuilderSource';
import { completedUsingItemPacket } from './completedUsingItem';
import { createPhotoPacket } from './createPhoto';
import { debugInfoPacket } from './debugInfo';
import { editorNetworkPacket } from './editorNetwork';
import { gameTestResultsPacket } from './gameTestResults';
import { guiDataPickItemPacket } from './guiDataPickItem';
import { hurtArmorPacket } from './hurtArmor';
import { lessonProgressPacket } from './lessonProgress';
import { mapCreateLockedCopyPacket } from './mapCreateLockedCopy';
import { multiplayerSettingsPacket } from './multiplayerSettings';
import { networkStackLatencyPacket } from './networkStackLatency';
import { npcDialoguePacket } from './npcDialogue';
import { npcRequestPacket } from './npcRequest';
import { packetViolationWarningPacket } from './packetViolationWarning';
import { partyDestinationCookieResponsePacket } from './partyDestinationCookieResponse';
import { playerStartItemCooldownPacket } from './playerStartItemCooldown';
import { playerToggleCrafterSlotRequestPacket } from './playerToggleCrafterSlotRequest';
import { positionTrackingDBClientRequestPacket } from './positionTrackingDBClientRequest';
import { removeVolumeEntityPacket } from './removeVolumeEntity';
import { requestAbilityPacket } from './requestAbility';
import { requestPermissionsPacket } from './requestPermissions';
import { scriptMessagePacket } from './scriptMessage';
import { serverSettingsResponsePacket } from './serverSettingsResponse';
import { serverStatsPacket } from './serverStats';
import { setDefaultGameTypePacket } from './setDefaultGameType';
import { setLastHurtByPacket } from './setLastHurtBy';
import { setPlayerInventoryOptionsPacket } from './setPlayerInventoryOptions';
import { settingsCommandPacket } from './settingsCommand';
import { showProfilePacket } from './showProfile';
import { simpleEventPacket } from './simpleEvent';
import { simulationTypePacket } from './simulationType';
import { tickingAreasLoadStatusPacket } from './tickingAreasLoadStatus';
import { toastRequestPacket } from './toastRequest';
import { updateClientInputLocksPacket } from './updateClientInputLocks';
import { animateEntityPacket } from './animateEntity';
import { unlockedRecipesPacket } from './unlockedRecipes';
import { serverboundLoadingScreenPacket } from './serverboundLoadingScreen';
import { addPaintingPacket } from './addPainting';
import { addVolumeEntityPacket } from './addVolumeEntity';
import { anvilDamagePacket } from './anvilDamage';
import { availableCommandsPacket } from './availableCommands';
import { awardAchievementPacket } from './awardAchievement';
import { blockEventPacket } from './blockEvent';
import { blockPickRequestPacket } from './blockPickRequest';
import { bookEditPacket } from './bookEdit';
import { cameraAimAssistPacket } from './cameraAimAssist';
import { cameraAimAssistActorPriorityPacket } from './cameraAimAssistActorPriority';
import { cameraInstructionPacket } from './cameraInstruction';
import { clientCacheBlobStatusPacket } from './clientCacheBlobStatus';
import { clientCacheMissResponsePacket } from './clientCacheMissResponse';
import { clientMovementPredictionSyncPacket } from './clientMovementPredictionSync';
import { clientboundAttributeLayerSyncPacket } from './clientboundAttributeLayerSync';
import { clientboundControlSchemeSetPacket } from './clientboundControlSchemeSet';
import { clientboundDataDrivenUICloseScreenPacket } from './clientboundDataDrivenUICloseScreen';
import { clientboundDataDrivenUIShowScreenPacket } from './clientboundDataDrivenUIShowScreen';
import { clientboundDataStorePacket } from './clientboundDataStore';
import { clientboundDebugRendererPacket } from './clientboundDebugRenderer';
import { clientboundMapItemDataPacket } from './clientboundMapItemData';
import { clientboundTextureShiftPacket } from './clientboundTextureShift';
import { clientboundUpdateSoundDataPacket } from './clientboundUpdateSoundData';
import { commandBlockUpdatePacket } from './commandBlockUpdate';
import { containerRegistryCleanupPacket } from './containerRegistryCleanup';
import { correctPlayerMovePredictionPacket } from './correctPlayerMovePrediction';
import { craftingDataPacket } from './craftingData';
import { creativeContentPacket } from './creativeContent';
import { deathInfoPacket } from './deathInfo';
import { dimensionDataPacket } from './dimensionData';
import { eduUriResourcePacket } from './eduUriResource';
import { educationSettingsPacket } from './educationSettings';
import { emoteListPacket } from './emoteList';
import { featureRegistryPacket } from './featureRegistry';
import { gameTestRequestPacket } from './gameTestRequest';
import { graphicsOverrideParameterPacket } from './graphicsOverrideParameter';
import { itemRegistryPacket } from './itemRegistry';
import { itemStackRequestPacket } from './itemStackRequest';
import { itemStackResponsePacket } from './itemStackResponse';
import { labTablePacket } from './labTable';
import { lecternUpdatePacket } from './lecternUpdate';
import { legacyTelemetryEventPacket } from './legacyTelemetryEvent';
import { levelEventPacket } from './levelEvent';
import { locatorBarPacket } from './locatorBar';
import { loginPacket } from './login';
import { mapInfoRequestPacket } from './mapInfoRequest';
import { mobArmorEquipmentPacket } from './mobArmorEquipment';
import { motionPredictionHintsPacket } from './motionPredictionHints';
import { moveActorDeltaPacket } from './moveActorDelta';
import { movementEffectPacket } from './movementEffect';
import { openSignPacket } from './openSign';
import { partyChangedPacket } from './partyChanged';
import { photoTransferPacket } from './photoTransfer';
import { playerArmorDamagePacket } from './playerArmorDamage';
import { playerAuthInputPacket } from './playerAuthInput';
import { playerEnchantOptionsPacket } from './playerEnchantOptions';
import { playerLocationPacket } from './playerLocation';
import { playerUpdateEntityOverridesPacket } from './playerUpdateEntityOverrides';
import { playerVideoCapturePacket } from './playerVideoCapture';
import { positionTrackingDBServerBroadcastPacket } from './positionTrackingDBServerBroadcast';
import { primitiveShapesPacket } from './primitiveShapes';
import { purchaseReceiptPacket } from './purchaseReceipt';
import { recordStartedPacket } from './recordStarted';
import { sendPartyDestinationCookiePacket } from './sendPartyDestinationCookie';
import { serverPlayerPostMovePositionPacket } from './serverPlayerPostMovePosition';
import { serverPresenceInfoPacket } from './serverPresenceInfo';
import { serverStoreInfoPacket } from './serverStoreInfo';
import { serverboundDataDrivenScreenClosedPacket } from './serverboundDataDrivenScreenClosed';
import { serverboundDataStorePacket } from './serverboundDataStore';
import { serverboundDiagnosticsPacket } from './serverboundDiagnostics';
import { serverboundPackSettingChangePacket } from './serverboundPackSettingChange';
import { setHudPacket } from './setHud';
import { setPlayerFurnaceOptionsPacket } from './setPlayerFurnaceOptions';
import { showStoreOfferPacket } from './showStoreOffer';
import { spawnExperienceOrbPacket } from './spawnExperienceOrb';
import { structureBlockUpdatePacket } from './structureBlockUpdate';
import { structureTemplateDataRequestPacket } from './structureTemplateDataRequest';
import { structureTemplateDataResponsePacket } from './structureTemplateDataResponse';
import { subChunkPacket } from './subChunk';
import { subChunkRequestPacket } from './subChunkRequest';
import { subClientLoginPacket } from './subClientLogin';
import { transferPacket } from './transfer';
import { updateBlockSyncedPacket } from './updateBlockSynced';
import { updateClientOptionsPacket } from './updateClientOptions';
import { updateEquipPacket } from './updateEquip';
import { updateSoftEnumPacket } from './updateSoftEnum';
import { updateTradePacket } from './updateTrade';
import type { PacketDefinition } from '../define';

/** The declaratively defined packets, keyed by packet name. */
export const wireDefinitions: ReadonlyMap<string, PacketDefinition> = new Map(
    [
        addPaintingPacket,
        addVolumeEntityPacket,
        anvilDamagePacket,
        availableCommandsPacket,
        awardAchievementPacket,
        blockEventPacket,
        blockPickRequestPacket,
        bookEditPacket,
        cameraAimAssistPacket,
        cameraAimAssistActorPriorityPacket,
        cameraInstructionPacket,
        clientCacheBlobStatusPacket,
        clientCacheMissResponsePacket,
        clientMovementPredictionSyncPacket,
        clientboundAttributeLayerSyncPacket,
        clientboundControlSchemeSetPacket,
        clientboundDataDrivenUICloseScreenPacket,
        clientboundDataDrivenUIShowScreenPacket,
        clientboundDataStorePacket,
        clientboundDebugRendererPacket,
        clientboundMapItemDataPacket,
        clientboundTextureShiftPacket,
        clientboundUpdateSoundDataPacket,
        commandBlockUpdatePacket,
        containerRegistryCleanupPacket,
        correctPlayerMovePredictionPacket,
        craftingDataPacket,
        creativeContentPacket,
        deathInfoPacket,
        dimensionDataPacket,
        eduUriResourcePacket,
        educationSettingsPacket,
        emoteListPacket,
        featureRegistryPacket,
        gameTestRequestPacket,
        graphicsOverrideParameterPacket,
        itemRegistryPacket,
        itemStackRequestPacket,
        itemStackResponsePacket,
        labTablePacket,
        lecternUpdatePacket,
        legacyTelemetryEventPacket,
        levelEventPacket,
        locatorBarPacket,
        loginPacket,
        mapInfoRequestPacket,
        mobArmorEquipmentPacket,
        motionPredictionHintsPacket,
        moveActorDeltaPacket,
        movementEffectPacket,
        openSignPacket,
        partyChangedPacket,
        photoTransferPacket,
        playerArmorDamagePacket,
        playerAuthInputPacket,
        playerEnchantOptionsPacket,
        playerLocationPacket,
        playerUpdateEntityOverridesPacket,
        playerVideoCapturePacket,
        positionTrackingDBServerBroadcastPacket,
        primitiveShapesPacket,
        purchaseReceiptPacket,
        recordStartedPacket,
        sendPartyDestinationCookiePacket,
        serverPlayerPostMovePositionPacket,
        serverPresenceInfoPacket,
        serverStoreInfoPacket,
        serverboundDataDrivenScreenClosedPacket,
        serverboundDataStorePacket,
        serverboundDiagnosticsPacket,
        serverboundPackSettingChangePacket,
        setHudPacket,
        setPlayerFurnaceOptionsPacket,
        showStoreOfferPacket,
        spawnExperienceOrbPacket,
        structureBlockUpdatePacket,
        structureTemplateDataRequestPacket,
        structureTemplateDataResponsePacket,
        subChunkPacket,
        subChunkRequestPacket,
        subClientLoginPacket,
        transferPacket,
        updateBlockSyncedPacket,
        updateClientOptionsPacket,
        updateEquipPacket,
        updateSoftEnumPacket,
        updateTradePacket,
        actorEventPacket,
        addActorPacket,
        addItemActorPacket,
        addPlayerPacket,
        animatePacket,
        availableActorIdentifiersPacket,
        biomeDefinitionListPacket,
        blockActorDataPacket,
        bossEventPacket,
        cameraAimAssistPresetsPacket,
        cameraPresetsPacket,
        cameraSplinePacket,
        chunkRadiusUpdatedPacket,
        clientCacheStatusPacket,
        clientToServerHandshakePacket,
        commandOutputPacket,
        commandRequestPacket,
        containerClosePacket,
        containerOpenPacket,
        containerSetDataPacket,
        currentStructureFeaturePacket,
        disconnectPacket,
        inventoryContentPacket,
        inventorySlotPacket,
        gameRulesChangedPacket,
        interactPacket,
        inventoryTransactionPacket,
        jigsawStructureDataPacket,
        levelChunkPacket,
        levelEventGenericPacket,
        levelSoundEventPacket,
        playSoundPacket,
        mobEffectPacket,
        mobEquipmentPacket,
        modalFormRequestPacket,
        modalFormResponsePacket,
        moveActorAbsolutePacket,
        movePlayerPacket,
        onScreenTextureAnimationPacket,
        setActorMotionPacket,
        emotePacket,
        playerActionPacket,
        setPlayerGameTypePacket,
        updatePlayerGameTypePacket,
        playerListPacket,
        playerSkinPacket,
        playStatusPacket,
        removeActorPacket,
        removeObjectivePacket,
        requestChunkRadiusPacket,
        requestNetworkSettingsPacket,
        setActorLinkPacket,
        resourcePackChunkDataPacket,
        resourcePackClientResponsePacket,
        resourcePackChunkRequestPacket,
        resourcePackDataInfoPacket,
        resourcePacksInfoPacket,
        resourcePackStackPacket,
        serverSettingsRequestPacket,
        serverToClientHandshakePacket,
        setActorDataPacket,
        setDisplayObjectivePacket,
        setLocalPlayerAsInitializedPacket,
        setScoreboardIdentityPacket,
        setScorePacket,
        setTitlePacket,
        spawnParticleEffectPacket,
        showCreditsPacket,
        startGamePacket,
        stopSoundPacket,
        takeItemActorPacket,
        textPacket,
        syncActorPropertyPacket,
        syncWorldClocksPacket,
        trimDataPacket,
        updateAbilitiesPacket,
        updateAttributesPacket,
        updateBlockPacket,
        updateSubChunkBlocksPacket,
        voxelShapesPacket,
        changeDimensionPacket,
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
        setPassengerOfBlockPacket,
        actorPickRequestPacket,
        addBehaviorTreePacket,
        agentActionEventPacket,
        agentAnimationPacket,
        automationClientConnectPacket,
        cameraPacket,
        cameraShakePacket,
        changeMobPropertyPacket,
        clientCameraAimAssistPacket,
        codeBuilderPacket,
        codeBuilderSourcePacket,
        completedUsingItemPacket,
        createPhotoPacket,
        debugInfoPacket,
        editorNetworkPacket,
        gameTestResultsPacket,
        guiDataPickItemPacket,
        hurtArmorPacket,
        lessonProgressPacket,
        mapCreateLockedCopyPacket,
        multiplayerSettingsPacket,
        networkStackLatencyPacket,
        npcDialoguePacket,
        npcRequestPacket,
        packetViolationWarningPacket,
        partyDestinationCookieResponsePacket,
        playerStartItemCooldownPacket,
        playerToggleCrafterSlotRequestPacket,
        positionTrackingDBClientRequestPacket,
        removeVolumeEntityPacket,
        requestAbilityPacket,
        requestPermissionsPacket,
        scriptMessagePacket,
        serverSettingsResponsePacket,
        serverStatsPacket,
        setDefaultGameTypePacket,
        setLastHurtByPacket,
        setPlayerInventoryOptionsPacket,
        settingsCommandPacket,
        showProfilePacket,
        simpleEventPacket,
        simulationTypePacket,
        tickingAreasLoadStatusPacket,
        toastRequestPacket,
        updateClientInputLocksPacket,
        animateEntityPacket,
        unlockedRecipesPacket,
        serverboundLoadingScreenPacket
    ].map((definition) => [definition.name, definition])
);
