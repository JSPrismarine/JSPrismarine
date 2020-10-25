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
import { EventEmitterishMixin } from "./EventEmitterishMixin";

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


export const EventManager = EventEmitterishMixin(
    class extends Evt<EventTypes> {

        constructor(server: Prismarine) {
            super();
        }

    },
    (...[, instance]) => instance
);

export type EventManager = InstanceType<typeof EventManager>;








