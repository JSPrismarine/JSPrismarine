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


class EventManagerWithoutEventEmitterishMethods extends Evt<EventTypes> {

    /** Events emitted by plugin makers. We can only listen those event
     * from within the server implementation, we are not supposed to post.
     * Also we can't have static typing for those as they are defined by
     * the plugin makers
     */
    readonly evtThirdParty = Evt.asNonPostable(Evt.create<[string, any]>());

}

export const EventManager = EventEmitterishMixin(
    EventManagerWithoutEventEmitterishMethods,
    ({ instance }) => instance
);

export type EventManager = InstanceType<typeof EventManager>;
