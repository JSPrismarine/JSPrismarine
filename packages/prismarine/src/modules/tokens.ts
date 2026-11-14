import { createToken } from '@jsprismarine/kernel';

import type BanManager from '../ban/BanManager';
import type { ChatManager } from '../chat/ChatManager';
import type { CommandManager } from '../command/CommandManager';
import type { ServerContent } from '../content/ServerContent';
import type PacketHandlerRegistry from '../network/PacketHandlerRegistry';
import type { PermissionManager } from '../permission/PermissionManager';
import type { StatsRegistry } from '../stats/StatsRegistry';
import type WorldManager from '../world/WorldManager';
import type { Networking } from './network';
import type { Ticker } from './ticker';

/** Where the current content build is read from; the build itself is replaced on every start. */
export interface ContentSource {
    getContent(): ServerContent;
}

// Service tokens for the manager modules the server registers on its kernel.
// They carry the manager classes while no narrower interfaces exist; the types
// shrink to capability interfaces as the managers grow them.

/** The ban list, provided by the `prismarine:bans` module. */
export const bansToken = createToken<BanManager>('prismarine:bans');
/** Operator status and permission grants, provided by the `prismarine:permissions` module. */
export const permissionsToken = createToken<PermissionManager>('prismarine:permissions');
/** The chat forwarder, provided by the `prismarine:social` module. */
export const chatToken = createToken<ChatManager>('prismarine:chat');
/**
 * The tick loop's counters (tick number, TPS, tick duration), provided by the
 * `prismarine:ticker` module. Tick work is observed through the server's typed
 * `tick` event, which the loop emits and awaits every tick.
 */
export const tickerToken = createToken<Ticker>('prismarine:ticker');
/**
 * The network front door (listener start, teardown, and the listener itself),
 * provided by the `prismarine:network` module. The server drives its start and
 * kill: the bind address and port arrive with `Server.bootstrap(ip, port)`.
 */
export const networkToken = createToken<Networking>('prismarine:network');
/** The content build, provided by the `prismarine:content` module. */
export const contentToken = createToken<ContentSource>('prismarine:content');
/** The inbound packet handlers, provided by the `prismarine:packet-handlers` module. */
export const packetHandlersToken = createToken<PacketHandlerRegistry>('prismarine:packet-handlers');
/** The loaded levels and worlds, provided by the `prismarine:worlds` module. */
export const worldsToken = createToken<WorldManager>('prismarine:worlds');
/** The command registry and dispatcher, provided by the `prismarine:commands` module. */
export const commandsToken = createToken<CommandManager>('prismarine:commands');
/**
 * The server's named metrics, provided by the `prismarine:stats` module. A module registers a
 * metric here for a value it owns, and the stats providers read snapshots from it.
 */
export const statsToken = createToken<StatsRegistry>('prismarine:stats');
