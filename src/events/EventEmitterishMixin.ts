import { Evt, to } from 'evt';
import type { VoidCtx } from 'evt';

export interface EventEmitterish<EventTypes extends [string, any]> {
    on<T extends EventTypes, K extends T[0]>(
        id: K,
        callback: (event: T extends readonly [K, infer U] ? U : never) => void
    ): this;

    once: EventEmitterish<EventTypes>['on'];

    removeListener: EventEmitterish<EventTypes>['on'];

    removeAllListeners(id?: EventTypes[0]): this;

    /**
     * Returns a promise that resolve after
     * each async callbacks have resolved.
     */
    emit<T extends EventTypes, K extends T[0]>(
        id: K,
        event: T extends readonly [K, infer U] ? U : never
    ): Promise<void>;
}

export function EventEmitterishMixin<
    EventTypes extends [string, any],
    TBase extends new (...args: any[]) => {}
>(
    Base: TBase,
    getEvt: (parameters: {
        constructorArgs: ConstructorParameters<TBase>;
        instance: InstanceType<TBase>;
    }) => Evt<EventTypes>
) {
    // NOTE: We can't use private properties in a mixin hence the use of a weak map.
    const instanceProperties = new WeakMap<
        {},
        {
            evt: Evt<EventTypes>;
            ctx: VoidCtx;
        }
    >();

    return class extends Base implements EventEmitterish<EventTypes> {
        constructor(...args: any[]) {
            super(...args);

            instanceProperties.set(this, {
                evt: getEvt({
                    constructorArgs: args as any,
                    instance: this as any
                }),
                ctx: Evt.newCtx()
            });
        }

        on<T extends EventTypes, K extends T[0]>(
            id: K,
            callback: (
                event: T extends readonly [K, infer U] ? U : never
            ) => void
        ): this {
            const { evt, ctx } = instanceProperties.get(this)!;

            evt.$attach(to(id), ctx, callback);

            return this;
        }

        once<T extends EventTypes, K extends T[0]>(
            id: K,
            callback: (
                event: T extends readonly [K, infer U] ? U : never
            ) => void
        ): this {
            const { evt, ctx } = instanceProperties.get(this)!;

            evt.$attachOnce(to(id), ctx, callback);

            return this;
        }

        removeListener<T extends EventTypes, K extends T[0]>(
            id: K,
            callback: (
                event: T extends readonly [K, infer U] ? U : never
            ) => void
        ): this {
            const { ctx } = instanceProperties.get(this)!;

            ctx.getHandlers()
                .filter(
                    ({ handler }) =>
                        handler.op === to(id) && handler.callback === callback
                )
                .forEach(({ handler }) => handler.detach());

            return this;
        }

        removeAllListeners(id?: EventTypes[0]): this {
            const { ctx } = instanceProperties.get(this)!;

            if (id === undefined) {
                ctx.done();
            } else {
                ctx.getHandlers()
                    .filter(({ handler }) => handler.op === to(id))
                    .forEach(({ handler }) => handler.detach());
            }

            return this;
        }

        /**
         * Returns a promise that resolve after
         * each async callbacks have resolved.
         */
        async emit<T extends EventTypes, K extends T[0]>(
            id: K,
            event: T extends readonly [K, infer U] ? U : never
        ): Promise<void> {
            const { evt } = instanceProperties.get(this)!;

            return evt.postAndWait([id, event] as any);
        }
    };
}
