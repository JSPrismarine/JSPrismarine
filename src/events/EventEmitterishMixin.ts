
import type { Evt } from "evt";
import { to } from "evt";

export function EventEmitterishMixin<
    EventTypes extends [string, any],
    TBase extends (new (...args: any[]) => {})
>(
    Base: TBase,
    getEvt: (params: {
        constructorArgs: ConstructorParameters<TBase>,
        instance: InstanceType<TBase>
    }) => Evt<EventTypes>
) {

    const evtByInstance = new WeakMap<{}, Evt<EventTypes>>();

    return class EventEmitterish extends Base {

        constructor(...args: any[]) {
            super(...args);

            evtByInstance.set(
                this,
                getEvt({
                    "constructorArgs": args as any,
                    "instance": this as any
                })
            );

        }

        on<T extends EventTypes, K extends T[0]>(
            id: K,
            callback: (event: T extends readonly [K, infer U] ? U : never) => void
        ): void {
            evtByInstance.get(this)!.$attach(to(id), callback as any);
        }

        /** 
         * Returns a promise that resolve after 
         * each async callback have resolved.
         */
        emit<T extends EventTypes, K extends T[0]>(
            id: K,
            event: T extends readonly [K, infer U] ? U : never
        ): Promise<void> {
            return evtByInstance.get(this)!.postAndWait([id, event] as any);
        }

    };
}