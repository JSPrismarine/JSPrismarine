import { createToken } from '@jsprismarine/kernel';

import type BanManager from '../ban/BanManager';
import type { ChatManager } from '../chat/ChatManager';
import type StationRegistry from '../crafting/CraftingStation';
import type { RecipeManager } from '../crafting/RecipeManager';
import type { PermissionManager } from '../permission/PermissionManager';
import type { QueryManager } from '../query/QueryManager';

// Service tokens for the manager modules the server registers on its kernel.
// They carry the manager classes while no narrower interfaces exist; the types
// shrink to capability interfaces as the managers grow them.

/** The ban list, provided by the `prismarine:bans` module. */
export const bansToken = createToken<BanManager>('prismarine:bans');
/** Operator status and permission grants, provided by the `prismarine:permissions` module. */
export const permissionsToken = createToken<PermissionManager>('prismarine:permissions');
/** The recipe book, provided by the `prismarine:recipes` module. */
export const recipesToken = createToken<RecipeManager>('prismarine:recipes');
/** The crafting stations, provided by the `prismarine:stations` module. */
export const stationsToken = createToken<StationRegistry>('prismarine:stations');
/** The chat forwarder, provided by the `prismarine:social` module. */
export const chatToken = createToken<ChatManager>('prismarine:chat');
/** The query responder, provided by the `prismarine:social` module. */
export const queryToken = createToken<QueryManager>('prismarine:query');
