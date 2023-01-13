import type BlockRegisterEvent from './block/BlockRegisterEvent.js';
import type ChatEvent from './chat/ChatEvent.js';
import type CommandRegisterEvent from './command/CommandRegisterEvents.js';
import { EventEmitterishMixin } from './EventEmitterishMixin.js';
import { Evt } from 'evt';
import type ItemRegisterEvent from './items/ItemRegisterEvent.js';
import type PlayerConnectEvent from './player/PlayerConnectEvent.js';
import type PlayerDespawnEvent from './player/PlayerDespawnEvent.js';
import type PlayerDisconnectEvent from './player/PlayerDisconnectEvent.js';
import type PlayerMoveEvent from './player/PlayerMoveEvent.js';
import type PlayerSetGamemodeEvent from './player/PlayerSetGamemodeEvent.js';
import type PlayerSpawnEvent from './player/PlayerSpawnEvent.js';
import type PlayerToggleFlightEvent from './player/PlayerToggleFlightEvent.js';
import type PlayerToggleSprintEvent from './player/PlayerToggleSprintEvent.js';
import type RaknetConnectEvent from './raknet/RaknetConnectEvent.js';
import type RaknetDisconnectEvent from './raknet/RaknetDisconnectEvent.js';
import type RaknetEncapsulatedPacketEvent from './raknet/RaknetEncapsulatedPacketEvent.js';
import { TickEvent } from './Events.js';
import type playerToggleOperatorEvent from './player/PlayerToggleOperatorEvent.js';

export type EventTypes =
    | ['blockRegister', BlockRegisterEvent]
    | ['chat', ChatEvent]
    | ['commandRegister', CommandRegisterEvent]
    | ['itemRegister', ItemRegisterEvent]
    | ['tick', TickEvent]
    | ['playerConnect', PlayerConnectEvent]
    | ['playerDisconnect', PlayerDisconnectEvent]
    | ['playerSpawn', PlayerSpawnEvent]
    | ['playerDespawn', PlayerDespawnEvent]
    | ['playerMove', PlayerMoveEvent]
    | ['playerToggleFlight', PlayerToggleFlightEvent]
    | ['playerToggleSprint', PlayerToggleSprintEvent]
    | ['playerToggleOperator', playerToggleOperatorEvent]
    | ['playerSetGamemode', PlayerSetGamemodeEvent]
    | ['raknetConnect', RaknetConnectEvent]
    | ['raknetDisconnect', RaknetDisconnectEvent]
    | ['raknetEncapsulatedPacket', RaknetEncapsulatedPacketEvent];

class EventManagerWithoutEventEmitterishMethods extends Evt<EventTypes> {
    /** Events emitted by plugin makers. We can only listen those event
     * from within the server implementation, we are not supposed to post.
     * Also we can't have static typing for those as they are defined by
     * the plugin makers
     */
    public readonly evtThirdParty = Evt.asNonPostable(Evt.create<[string, any]>());
}

export const EventManager = EventEmitterishMixin(EventManagerWithoutEventEmitterishMethods, ({ instance }) => instance);

export type EventManager = InstanceType<typeof EventManager>;
