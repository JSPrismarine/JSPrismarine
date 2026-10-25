export * from './chat/ChatManager';
export * from './permission/PermissionManager';
export * from './query/QueryManager';

/**
 * The content composition root, re-exported beside the managers.
 *
 * The managers below each hold a table of their own today. As a subsystem
 * moves to the pack stack its manager reads `server.getContent()` instead,
 * falling back to its table while the flag is off, so both sources are named
 * in the same place and a manager imports one module rather than reaching
 * into `content/` by path.
 */
export { buildServerContent } from './content/ServerContent';
export type {
    ServerContent,
    ServerContentBlocks,
    ServerContentEntities,
    ServerContentItems
} from './content/ServerContent';
export { readContentSettings } from './content/settings';
export type { ContentSettings } from './content/settings';

import SessionManager from './SessionManager';
import BanManager from './ban/BanManager';
import BlockManager from './block/BlockManager';
import ItemManager from './item/ItemManager';
import WorldManager from './world/WorldManager';

export { BanManager, BlockManager, ItemManager, SessionManager, WorldManager };
