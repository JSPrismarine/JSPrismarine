import * as Protocol from './protocol/Protocol';

import RakNetSession, { RakNetPriority as ConnectionPriority } from './Session';

import InetAddress from './utils/InetAddress';
import RakNetListener from './Listener';
import ServerName from './utils/ServerName';

export const RAKNET_TPS = 10;
export const MAX_CHANNELS = 32;
export const MINECRAFT_PROTOCOL = 10;
export const RAKNET_MAGIC = Buffer.from(
    '\u0000\u00FF\u00FF\u0000\u00FE\u00FE\u00FE\u00FE\u00FD\u00FD\u00FD\u00FD\u0012\u0034\u0056\u0078',
    'binary'
);
export const MAX_MTU_SIZE = 1500;

export { RakNetSession, ConnectionPriority, Protocol, RakNetListener, InetAddress, ServerName };
