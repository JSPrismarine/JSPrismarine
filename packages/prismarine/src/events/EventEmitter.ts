import type BlockRegisterEvent from './block/BlockRegisterEvent';
import type ChatEvent from './chat/ChatEvent';
import type CommandRegisterEvent from './command/CommandRegisterEvent';
import { EventEmitterishMixin } from './EventEmitterishMixin';
import { Evt } from 'evt';
import type ItemRegisterEvent from './items/ItemRegisterEvent';
import type PlayerConnectEvent from './player/PlayerConnectEvent';
import type PlayerDespawnEvent from './player/PlayerDespawnEvent';
import type PlayerDisconnectEvent from './player/PlayerDisconnectEvent';
import type PlayerMoveEvent from './player/PlayerMoveEvent';
import type PlayerSetGamemodeEvent from './player/PlayerSetGamemodeEvent';
import type PlayerSpawnEvent from './player/PlayerSpawnEvent';
import type PlayerToggleFlightEvent from './player/PlayerToggleFlightEvent';
import type PlayerToggleSprintEvent from './player/PlayerToggleSprintEvent';
import type RaknetConnectEvent from './raknet/RaknetConnectEvent';
import type RaknetDisconnectEvent from './raknet/RaknetDisconnectEvent';
import type RaknetEncapsulatedPacketEvent from './raknet/RaknetEncapsulatedPacketEvent';
import type { TickEvent } from './Events';
import type playerToggleOperatorEvent from './player/PlayerToggleOperatorEvent';

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

export const EventEmitter = EventEmitterishMixin(EventManagerWithoutEventEmitterishMethods, ({ instance }) => instance);

export type EventEmitter = InstanceType<typeof EventEmitter>;
