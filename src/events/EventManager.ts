import { Evt, to } from 'evt';
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

export default class EventManager extends Evt<
    ['raknetConnect', RaknetConnectEvent] |
    ['raknetDisconnect', RaknetDisconnectEvent] |
    ['raknetEncapsulatedPacket', RaknetEncapsulatedPacketEvent] |
    ['chat', ChatEvent] |
    ['playerConnect', PlayerConnectEvent] |
    ['playerDisconnect', PlayerDisconnectEvent] |
    ['playerSpawn', PlayerSpawnEvent] |
    ['playerDespawn', PlayerDespawnEvent] |
    ['playerMove', PlayerMoveEvent]
    > {
    constructor(server: Prismarine) {
        super();
    }

    public async on(id: string, callback: any) {
        return await this.$attach(to(id as any), callback);
    }

    public async emit(id: string, callback: any) {
        return await this.post([id, callback] as any);
    }
};
