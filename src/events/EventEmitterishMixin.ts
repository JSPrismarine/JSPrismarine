
import type { Evt } from "evt";
import { to } from "evt";
import { id as identity } from "evt/tools/typeSafety/id";

export interface EventEmitterish<EventTypes extends [string, any]> {

    on<T extends EventTypes, K extends T[0]>(
        id: K,
        callback: (event: T extends readonly [K, infer U] ? U : never) => void
    ): void;

    /** 
     * Returns a promise that resolve after 
     * each async callback have resolved.
     */
    emit<T extends EventTypes, K extends T[0]>(
        id: K,
        event: T extends readonly [K, infer U] ? U : never
    ): Promise<void>;

}

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

    return class extends Base implements EventEmitterish<EventTypes> {

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

        on= identity<EventEmitterish<EventTypes>["on"]>(
            (id, callback)=>{
                evtByInstance.get(this)!.$attach(to(id), callback);
            }
        );

        emit = identity<EventEmitterish<EventTypes>["emit"]>(
            (id, event)=> evtByInstance.get(this)!.postAndWait([id, event] as any)
        );

    };
}