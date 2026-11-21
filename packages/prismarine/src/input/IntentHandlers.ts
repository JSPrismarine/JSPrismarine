import AnimateHandler from './handlers/AnimateHandler';
import OpenInventoryHandler from './handlers/OpenInventoryHandler';
import OpenNpcHandler from './handlers/OpenNpcHandler';
import QueryBossBarHandler from './handlers/QueryBossBarHandler';

/**
 * The built-in handler of every intent kind, which `IntentHandlerRegistry.enable` registers. A
 * test checks that every kind in the intent table has exactly one class here.
 */
export { AnimateHandler, OpenInventoryHandler, OpenNpcHandler, QueryBossBarHandler };
