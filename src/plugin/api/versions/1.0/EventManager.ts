import type Prismarine from "../../../../Prismarine";
import type { EventTypes as CurrentVersionEventTypes } from "../../../../events/EventManager";
import { EventEmitterishMixin } from "../../../../events/EventEmitterishMixin";
import { Evt, compose } from "evt";
import type { Operator } from "evt";

/* README: https://gist.github.com/garronej/84dddc6dad77d9fd0ce5608148bc59c4 */

type EventTypes = CurrentVersionEventTypes;

const currentApiToTargetApi: Operator.fλ<CurrentVersionEventTypes, EventTypes> =
    data => [data];

const targetApiToCurrentApi: Operator.fλ<EventTypes, CurrentVersionEventTypes> =
    data => [data];

class EventManagerWithoutEventEmitterishMethods {

    constructor(server: Prismarine) { }

}

const EventManager = EventEmitterishMixin(
    EventManagerWithoutEventEmitterishMethods,
    ({ constructorArgs: [server] }) => {

        const evtProxy = new Evt<EventTypes>();
        const evtSrc = server.getEventManager();
        const internalEvents = new WeakSet<EventTypes>();

        evtSrc.$attach(
            currentApiToTargetApi,
            data => (
                internalEvents.add(data),
                evtProxy.postAndWait(data)
            )
        );

        evtProxy.$attachExtract(
            compose(
                data => !internalEvents.has(data),
                targetApiToCurrentApi
            ),
            data => evtSrc.postAndWait(data)
        );

        return evtProxy;
    }
);

type EventManager = InstanceType<typeof EventManager>;

export default EventManager;
