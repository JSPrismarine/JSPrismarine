import { type Ctx, Evt, to } from 'evt';

/**
 * @private
 */
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

export function EventEmitterishMixin<EventTypes extends [string, any], TBase extends new (...args: any[]) => {}>(
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
            ctx: Ctx;
        }
    >();

    return class extends Base implements EventEmitterish<EventTypes> {
        public constructor(...args: any[]) {
            super(...args);

            // Hack?
            Evt.setDefaultMaxHandlers(Number.MAX_SAFE_INTEGER);

            instanceProperties.set(this, {
                evt: getEvt({
                    constructorArgs: args as ConstructorParameters<TBase>,
                    instance: this as InstanceType<TBase>
                }),
                ctx: Evt.newCtx()
            });
        }

        public on<T extends EventTypes, K extends T[0]>(
            id: K,
            callback: (event: T extends readonly [K, infer U] ? U : never) => void
        ): any {
            const { evt, ctx } = instanceProperties.get(this)!;

            evt.$attach(to(id), ctx, callback);

            return this;
        }

        public once<T extends EventTypes, K extends T[0]>(
            id: K,
            callback: (event: T extends readonly [K, infer U] ? U : never) => void
        ): any {
            const { evt, ctx } = instanceProperties.get(this)!;

            evt.$attachOnce(to(id), ctx, callback);

            return this;
        }

        public removeListener<T extends EventTypes, K extends T[0]>(
            id: K,
            callback: (event: T extends readonly [K, infer U] ? U : never) => void
        ): any {
            const { ctx } = instanceProperties.get(this)!;

            ctx.getHandlers()
                .filter(({ handler }) => handler.op === to(id) && handler.callback === callback)
                .forEach(({ handler }) => handler.detach());

            return this;
        }

        public removeAllListeners(id?: EventTypes[0]): any {
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
        public async emit<T extends EventTypes, K extends T[0]>(
            id: K,
            event: T extends readonly [K, infer U] ? U : never
        ): Promise<void> {
            const { evt } = instanceProperties.get(this)!;

            return evt.postAndWait([id, event] as any);
        }
    };
}
