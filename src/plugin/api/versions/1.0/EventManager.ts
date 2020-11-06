import type Prismarine from '../../../../Prismarine';
import type { EventTypes as CurrentVersionEventTypes } from '../../../../events/EventManager';
import { EventEmitterishMixin } from '../../../../events/EventEmitterishMixin';
import type { EventEmitterish } from '../../../../events/EventEmitterishMixin';
import { Evt, compose } from 'evt';
import type { Operator } from 'evt';

/* README: https://gist.github.com/garronej/84dddc6dad77d9fd0ce5608148bc59c4 */

type EventTypes = CurrentVersionEventTypes;

const currentApiToTargetApi: Operator.fλ<
    CurrentVersionEventTypes,
    EventTypes
> = (data) => [data];

const targetApiToCurrentApi: Operator.fλ<
    EventTypes,
    CurrentVersionEventTypes
> = (data) => [data];

class EventManagerWithoutEventEmitterishMethods<
    CustomEventTypes extends [string, any]
> {
    constructor(private server: Prismarine) {}

    private static readonly CustomEventManager = EventEmitterishMixin(
        class {
            constructor(_server: Prismarine) {}
        },
        ({ constructorArgs: [server] }) =>
            Evt.asPostable(server.getEventManager().evtThirdParty)
    );

    getCustomEventManager(): EventEmitterish<CustomEventTypes> {
        return new EventManagerWithoutEventEmitterishMethods.CustomEventManager(
            this.server
        );
    }
}

/*
 * Here we need to extend again, just to be able to use EventManager both as a type and as
 * a class constructor. Example:
 *
 * import EventManager from "./EventManager";
 * const em: EventManager<["foo", number]> = new EventManager();
 *
 * In src/events/EventManager.ts we didn't had to do that, instead we overloaded the constructor
 * with the type alias InstanceType<typeof EventManager>. The reason we can't do the same
 * here is that InstanceType<> 'swallows' the type parameter.
 */
export default class EventManager<
    CustomEventTypes extends [string, any]
> extends EventEmitterishMixin(
    EventManagerWithoutEventEmitterishMethods,
    ({ constructorArgs: [server] }) => {
        const evtProxy = new Evt<EventTypes>();
        const evtSrc = server.getEventManager();
        const internalEvents = new WeakSet<EventTypes>();

        evtSrc.$attach(
            currentApiToTargetApi,
            (data) => (internalEvents.add(data), evtProxy.postAndWait(data))
        );

        evtProxy.$attachExtract(
            compose((data) => !internalEvents.has(data), targetApiToCurrentApi),
            (data) => evtSrc.postAndWait(data)
        );

        return evtProxy;
    }
)<CustomEventTypes> {}
