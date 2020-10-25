import type Prismarine from "../../../../Prismarine";
import type { EventTypes as CurrentVersionEventTypes } from "../../../../events/EventManager";
import { EventEmitterIshMixin } from "../../../../events/EventEmitterishMixin";

type EventTypes = CurrentVersionEventTypes;

const EventManager = EventEmitterIshMixin(
    class {

        constructor(server: Prismarine) { }

    },
    ([server]) => server.getEventManager()
        .pipe((data): [EventTypes] | null => {

            /*
            Here is where the transformation will have to be applied
            when the future current version will be out of sync with
            API v1.0
            See: https://gist.github.com/garronej/84dddc6dad77d9fd0ce5608148bc59c4
            */

            return [data];

        })
);

type EventManager = InstanceType<typeof EventManager>;

export default EventManager;
