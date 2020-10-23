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

export type EventTypes = 
    ['raknetConnect', RaknetConnectEvent] |
    ['raknetDisconnect', RaknetDisconnectEvent] |
    ['raknetEncapsulatedPacket', RaknetEncapsulatedPacketEvent] |
    ['chat', ChatEvent] |
    ['playerConnect', PlayerConnectEvent] |
    ['playerDisconnect', PlayerDisconnectEvent] |
    ['playerSpawn', PlayerSpawnEvent] |
    ['playerDespawn', PlayerDespawnEvent] |
    ['playerMove', PlayerMoveEvent];

export default class EventManager extends Evt<EventTypes> {

    constructor(server: Prismarine) {
        super();
    }

    public on<T extends EventTypes, K extends T[0]>(
        id: K, 
        callback: (event: T extends readonly [K, infer U] ? U : never )=> void 

    ) {
         this.$attach(to(id), callback as any);
    }

    public emit<T extends EventTypes, K extends T[0]>(
        id: K, 
        event:  T extends readonly [K, infer U] ? U : never
    ) {
        this.post([id, event] as any);
    }

};

