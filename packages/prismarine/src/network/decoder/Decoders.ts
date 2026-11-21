import ActorEventDecoder from './ActorEventDecoder';
import AnimateDecoder from './AnimateDecoder';
import BossEventDecoder from './BossEventDecoder';
import EmoteDecoder from './EmoteDecoder';
import InteractDecoder from './InteractDecoder';
import LevelSoundEventDecoder from './LevelSoundEventDecoder';
import RequestAbilityDecoder from './RequestAbilityDecoder';
import RequestChunkRadiusDecoder from './RequestChunkRadiusDecoder';
import RequestPermissionsDecoder from './RequestPermissionsDecoder';
import RespawnDecoder from './RespawnDecoder';
import ScriptMessageDecoder from './ScriptMessageDecoder';
import SetDefaultGameTypeDecoder from './SetDefaultGameTypeDecoder';
import SetLocalPlayerAsInitializedDecoder from './SetLocalPlayerAsInitializedDecoder';
import SetPlayerGameTypeDecoder from './SetPlayerGameTypeDecoder';
import SettingsCommandDecoder from './SettingsCommandDecoder';
import ShowCreditsDecoder from './ShowCreditsDecoder';
import TextDecoder from './TextDecoder';

/**
 * Every Bedrock packet decoder, which `PacketHandlerRegistry.enable` wraps into a packet handler
 * and registers under its packet's name. A test checks that each one names a packet Protocol
 * exports and that no packet has both a decoder here and a handler in `Handlers`.
 */
export {
    ActorEventDecoder,
    AnimateDecoder,
    BossEventDecoder,
    EmoteDecoder,
    InteractDecoder,
    LevelSoundEventDecoder,
    RequestAbilityDecoder,
    RequestChunkRadiusDecoder,
    RequestPermissionsDecoder,
    RespawnDecoder,
    ScriptMessageDecoder,
    SetDefaultGameTypeDecoder,
    SetLocalPlayerAsInitializedDecoder,
    SetPlayerGameTypeDecoder,
    SettingsCommandDecoder,
    ShowCreditsDecoder,
    TextDecoder
};
