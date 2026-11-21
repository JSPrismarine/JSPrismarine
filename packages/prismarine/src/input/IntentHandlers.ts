import AnimateHandler from './handlers/AnimateHandler';
import ChangeGameModeHandler from './handlers/ChangeGameModeHandler';
import ChatHandler from './handlers/ChatHandler';
import CloseContainerHandler from './handlers/CloseContainerHandler';
import EatHandler from './handlers/EatHandler';
import EmoteHandler from './handlers/EmoteHandler';
import FinishCreditsHandler from './handlers/FinishCreditsHandler';
import MineBlockHandler from './handlers/MineBlockHandler';
import OpenInventoryHandler from './handlers/OpenInventoryHandler';
import OpenNpcHandler from './handlers/OpenNpcHandler';
import PlayerInitializedHandler from './handlers/PlayerInitializedHandler';
import PlaySoundHandler from './handlers/PlaySoundHandler';
import QueryBossBarHandler from './handlers/QueryBossBarHandler';
import RequestAbilityHandler from './handlers/RequestAbilityHandler';
import RespawnHandler from './handlers/RespawnHandler';
import RunCommandHandler from './handlers/RunCommandHandler';
import ScriptMessageHandler from './handlers/ScriptMessageHandler';
import SelectHotbarSlotHandler from './handlers/SelectHotbarSlotHandler';
import SetCreativeSlotHandler from './handlers/SetCreativeSlotHandler';
import SetDefaultGameModeHandler from './handlers/SetDefaultGameModeHandler';
import SetPlayerPermissionHandler from './handlers/SetPlayerPermissionHandler';
import SetViewDistanceHandler from './handlers/SetViewDistanceHandler';

/**
 * The built-in handler of every intent kind, which `IntentHandlerRegistry.enable` registers. A
 * test checks that every kind in the intent table has exactly one class here.
 */
export {
    AnimateHandler,
    ChangeGameModeHandler,
    ChatHandler,
    CloseContainerHandler,
    EatHandler,
    EmoteHandler,
    FinishCreditsHandler,
    MineBlockHandler,
    OpenInventoryHandler,
    OpenNpcHandler,
    PlayerInitializedHandler,
    PlaySoundHandler,
    QueryBossBarHandler,
    RequestAbilityHandler,
    RespawnHandler,
    RunCommandHandler,
    ScriptMessageHandler,
    SelectHotbarSlotHandler,
    SetCreativeSlotHandler,
    SetDefaultGameModeHandler,
    SetPlayerPermissionHandler,
    SetViewDistanceHandler
};
