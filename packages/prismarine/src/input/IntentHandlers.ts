import AnimateHandler from './handlers/AnimateHandler';
import ChangeGameModeHandler from './handlers/ChangeGameModeHandler';
import ChatHandler from './handlers/ChatHandler';
import CloseContainerHandler from './handlers/CloseContainerHandler';
import EatHandler from './handlers/EatHandler';
import EmoteHandler from './handlers/EmoteHandler';
import FinishCreditsHandler from './handlers/FinishCreditsHandler';
import HoldButtonsHandler from './handlers/HoldButtonsHandler';
import JumpHandler from './handlers/JumpHandler';
import MineBlockHandler from './handlers/MineBlockHandler';
import MoveHandler from './handlers/MoveHandler';
import OpenInventoryHandler from './handlers/OpenInventoryHandler';
import OpenNpcHandler from './handlers/OpenNpcHandler';
import PlaySoundHandler from './handlers/PlaySoundHandler';
import PlayerInitializedHandler from './handlers/PlayerInitializedHandler';
import PressRespawnHandler from './handlers/PressRespawnHandler';
import QueryBossBarHandler from './handlers/QueryBossBarHandler';
import RequestAbilityHandler from './handlers/RequestAbilityHandler';
import RespawnHandler from './handlers/RespawnHandler';
import RunCommandHandler from './handlers/RunCommandHandler';
import ScriptMessageHandler from './handlers/ScriptMessageHandler';
import SelectHotbarSlotHandler from './handlers/SelectHotbarSlotHandler';
import SetCreativeSlotHandler from './handlers/SetCreativeSlotHandler';
import DropHeldItemHandler from './handlers/DropHeldItemHandler';
import SetDefaultGameModeHandler from './handlers/SetDefaultGameModeHandler';
import SetFlyingHandler from './handlers/SetFlyingHandler';
import SetPlayerPermissionHandler from './handlers/SetPlayerPermissionHandler';
import SetSleepingHandler from './handlers/SetSleepingHandler';
import SetSneakingHandler from './handlers/SetSneakingHandler';
import SetSprintingHandler from './handlers/SetSprintingHandler';
import SetViewDistanceHandler from './handlers/SetViewDistanceHandler';
import UseItemOnBlockHandler from './handlers/UseItemOnBlockHandler';

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
    HoldButtonsHandler,
    JumpHandler,
    MineBlockHandler,
    MoveHandler,
    OpenInventoryHandler,
    OpenNpcHandler,
    PlaySoundHandler,
    PlayerInitializedHandler,
    PressRespawnHandler,
    QueryBossBarHandler,
    RequestAbilityHandler,
    RespawnHandler,
    RunCommandHandler,
    ScriptMessageHandler,
    SelectHotbarSlotHandler,
    SetCreativeSlotHandler,
    DropHeldItemHandler,
    SetDefaultGameModeHandler,
    SetFlyingHandler,
    SetPlayerPermissionHandler,
    SetSleepingHandler,
    SetSneakingHandler,
    SetSprintingHandler,
    SetViewDistanceHandler,
    UseItemOnBlockHandler
};
