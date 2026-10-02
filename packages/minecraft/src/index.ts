export * from './Gametype';

import type { BehaviorPack } from './BehaviorPack';
import type { BlockProperty } from './BlockProperty';
import { BuildPlatform } from './BuildPlatform';
import { CommandPermissionLevel } from './CommandPermissionLevel';
import { DataItemType } from './DataItemType';
import { Difficulty } from './Difficulty';
import { Dimension } from './Dimension';
import { DisconnectReason } from './DisconnectReason';
import type { Experiment } from './Experiment';
import { Generator } from './Generator';
import blockSchemas from './generated/block-schemas.json';
import vanillaRecipes from './generated/recipes.json';
import { ItemStackRequestActionType } from './generated/ItemStackRequestActionType';
import { AbilityLayerFlag } from './generated/AbilityLayerFlag';
import { ContainerUiId } from './generated/ContainerUiId';
import { InventoryLayout } from './generated/InventoryLayout';
import { InventoryLeftTab } from './generated/InventoryLeftTab';
import { InventoryRightTab } from './generated/InventoryRightTab';
import { ItemDescriptorType } from './generated/ItemDescriptorType';
import { ItemStackResponseResult } from './generated/ItemStackResponseResult';
import { PlayerAuthInputData } from './generated/PlayerAuthInputData';
import { RecipeEntryType } from './generated/RecipeEntryType';
import { WindowIds } from './generated/WindowIds';
import { WindowTypes } from './generated/WindowTypes';
import { ActorEvent } from './generated/ActorEvent';
import { TitleType } from './generated/TitleType';
import { LevelEvent } from './LevelEvent';
import { LevelSoundEvent, LevelSoundEventName } from './LevelSoundEvent';
import { PacketCompressionAlgorithm } from './PacketCompressionAlgorithm';
import { PlayerPermissionLevel } from './PlayerPermissionLevel';
import { PlayerPositionMode } from './PlayerPositionMode';
import type { ResourcePack } from './ResourcePack';
import { ResourcePackResponse } from './ResourcePackResponse';
import { ServerAuthMovementMode } from './ServerAuthMovementMode';
import { SpawnBiome } from './SpawnBiome';
import type { StackPack } from './StackPack';

/**
 * The vanilla block state catalogue: which properties each block has and which values they
 * accept. Not an ordered palette - runtime ids are hashes of a block's own name and state.
 */
/** Every vanilla recipe, from Mojang's own files in a Bedrock Dedicated Server. */
export { blockSchemas, vanillaRecipes };

export {
    BuildPlatform,
    CommandPermissionLevel,
    DataItemType,
    Difficulty,
    Dimension,
    DisconnectReason,
    Generator,
    AbilityLayerFlag,
    ActorEvent,
    ContainerUiId,
    InventoryLayout,
    InventoryLeftTab,
    InventoryRightTab,
    ItemDescriptorType,
    ItemStackRequestActionType,
    ItemStackResponseResult,
    PlayerAuthInputData,
    RecipeEntryType,
    WindowIds,
    WindowTypes,
    LevelEvent,
    TitleType,
    LevelSoundEvent,
    LevelSoundEventName,
    PacketCompressionAlgorithm,
    PlayerPermissionLevel,
    PlayerPositionMode,
    ResourcePackResponse,
    ServerAuthMovementMode,
    SpawnBiome
};
export type { BehaviorPack, BlockProperty, Experiment, ResourcePack, StackPack };
