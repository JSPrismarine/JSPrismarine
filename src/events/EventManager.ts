import { Evt } from 'evt';
import type Prismarine from '../Prismarine';
import type ChatEvent from './chat/ChatEvent';
import type PlayerConnectEvent from './player/PlayerConnectEvent';
import type PlayerDespawnEvent from './player/PlayerDespawnEvent';
import type PlayerDisconnectEvent from './player/PlayerDisconnectEvent';
import type PlayerMoveEvent from './player/PlayerMoveEvent';
import type PlayerSpawnEvent from './player/PlayerSpawnEvent';
import type RaknetConnectEvent from './raknet/RaknetConnectEvent';
import type RaknetDisconnectEvent from './raknet/RaknetDisconnectEvent';
import type RaknetEncapsulatedPacketEvent from './raknet/RaknetEncapsulatedPacketEvent';

export default class EventManager {

    constructor(server: Prismarine) {
    }

    evtRaknetConnect = Evt.create<RaknetConnectEvent>();
    evtRaknetDisconnect= Evt.create<RaknetDisconnectEvent>();
    evtRaknetEncapsulatedPacket = Evt.create<RaknetEncapsulatedPacketEvent>();
    evtChat = Evt.create<ChatEvent>();
    evtPlayerConnect = Evt.create<PlayerConnectEvent>();
    evtPlayerDisconnect = Evt.create<PlayerDisconnectEvent>();
    evtPlayerSpawn= Evt.create<PlayerSpawnEvent>();
    evtPlayerDespawn = Evt.create<PlayerDespawnEvent>();
    evtPlayerMove= Evt.create<PlayerMoveEvent>();

};
