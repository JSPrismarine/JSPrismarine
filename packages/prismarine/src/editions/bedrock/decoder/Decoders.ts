import ActorEventDecoder from './ActorEventDecoder';
import ActorPickRequestDecoder from './ActorPickRequestDecoder';
import AnimateDecoder from './AnimateDecoder';
import AnvilDamageDecoder from './AnvilDamageDecoder';
import BlockPickRequestDecoder from './BlockPickRequestDecoder';
import BookEditDecoder from './BookEditDecoder';
import BossEventDecoder from './BossEventDecoder';
import CommandBlockUpdateDecoder from './CommandBlockUpdateDecoder';
import ContainerCloseDecoder from './ContainerCloseDecoder';
import EmoteDecoder from './EmoteDecoder';
import InteractDecoder from './InteractDecoder';
import LabTableDecoder from './LabTableDecoder';
import LecternUpdateDecoder from './LecternUpdateDecoder';
import LevelSoundEventDecoder from './LevelSoundEventDecoder';
import MobEquipmentDecoder from './MobEquipmentDecoder';
import PlayerToggleCrafterSlotRequestDecoder from './PlayerToggleCrafterSlotRequestDecoder';
import RequestAbilityDecoder from './RequestAbilityDecoder';
import RequestChunkRadiusDecoder from './RequestChunkRadiusDecoder';
import RequestPermissionsDecoder from './RequestPermissionsDecoder';
import RespawnDecoder from './RespawnDecoder';
import ScriptMessageDecoder from './ScriptMessageDecoder';
import SetDefaultGameTypeDecoder from './SetDefaultGameTypeDecoder';
import SetLocalPlayerAsInitializedDecoder from './SetLocalPlayerAsInitializedDecoder';
import SetPlayerFurnaceOptionsDecoder from './SetPlayerFurnaceOptionsDecoder';
import SetPlayerGameTypeDecoder from './SetPlayerGameTypeDecoder';
import SetPlayerInventoryOptionsDecoder from './SetPlayerInventoryOptionsDecoder';
import SettingsCommandDecoder from './SettingsCommandDecoder';
import ShowCreditsDecoder from './ShowCreditsDecoder';
import StructureBlockUpdateDecoder from './StructureBlockUpdateDecoder';
import StructureTemplateDataRequestDecoder from './StructureTemplateDataRequestDecoder';
import TextDecoder from './TextDecoder';

/**
 * Every Bedrock packet decoder, which `PacketHandlerRegistry.enable` wraps into a packet handler
 * and registers under its packet's name. A test checks that each one names a packet Protocol
 * exports and that no packet has both a decoder here and a handler in `Handlers`.
 */
export {
    ActorEventDecoder,
    ActorPickRequestDecoder,
    AnimateDecoder,
    AnvilDamageDecoder,
    BlockPickRequestDecoder,
    BookEditDecoder,
    BossEventDecoder,
    CommandBlockUpdateDecoder,
    ContainerCloseDecoder,
    EmoteDecoder,
    InteractDecoder,
    LabTableDecoder,
    LecternUpdateDecoder,
    LevelSoundEventDecoder,
    MobEquipmentDecoder,
    PlayerToggleCrafterSlotRequestDecoder,
    RequestAbilityDecoder,
    RequestChunkRadiusDecoder,
    RequestPermissionsDecoder,
    RespawnDecoder,
    ScriptMessageDecoder,
    SetDefaultGameTypeDecoder,
    SetLocalPlayerAsInitializedDecoder,
    SetPlayerFurnaceOptionsDecoder,
    SetPlayerGameTypeDecoder,
    SetPlayerInventoryOptionsDecoder,
    SettingsCommandDecoder,
    ShowCreditsDecoder,
    StructureBlockUpdateDecoder,
    StructureTemplateDataRequestDecoder,
    TextDecoder
};
