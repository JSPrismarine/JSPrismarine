import AnimateHandler from './handlers/AnimateHandler';
import ChatHandler from './handlers/ChatHandler';
import EatHandler from './handlers/EatHandler';
import EmoteHandler from './handlers/EmoteHandler';
import OpenInventoryHandler from './handlers/OpenInventoryHandler';
import OpenNpcHandler from './handlers/OpenNpcHandler';
import PlaySoundHandler from './handlers/PlaySoundHandler';
import QueryBossBarHandler from './handlers/QueryBossBarHandler';

/**
 * The built-in handler of every intent kind, which `IntentHandlerRegistry.enable` registers. A
 * test checks that every kind in the intent table has exactly one class here.
 */
export {
    AnimateHandler,
    ChatHandler,
    EatHandler,
    EmoteHandler,
    OpenInventoryHandler,
    OpenNpcHandler,
    PlaySoundHandler,
    QueryBossBarHandler
};
