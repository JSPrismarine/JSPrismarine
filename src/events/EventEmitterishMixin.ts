
import type { Evt } from "evt";
import { to } from "evt";


type Constructor<A extends any[] = any[], T = any> = new (...args: A) => T;

export function EventEmitterIshMixin<
    EventTypes extends [string, any],
    TBase extends Constructor,
    >(
        Base: TBase,
        getEvt: (
            constructorArg: TBase extends Constructor<infer U, any> ? U : never,
            instance: TBase extends Constructor<any, infer U> ? U : never
        ) => Evt<EventTypes>
    ) {
    return class EventEmitterish extends Base {

        //private readonly evtProxy; /*: Evt<EventTypes>;*/

        constructor(...args: any[]) {
            super(...args);

            this.evtProxy = getEvt(args as any, this as any);

        }

        on<T extends EventTypes, K extends T[0]>(
            id: K,
            callback: (event: T extends readonly [K, infer U] ? U : never) => void
        ): void {
            this.evtProxy.$attach(to(id), callback as any);
        }

        /** 
         * Returns a promise that resolve after 
         * each async callback have resolved.
         */
        emit<T extends EventTypes, K extends T[0]>(
            id: K,
            event: T extends readonly [K, infer U] ? U : never
        ): Promise<void> {
            return this.evtProxy.postAndWait([id, event] as any);
        }

    };
}