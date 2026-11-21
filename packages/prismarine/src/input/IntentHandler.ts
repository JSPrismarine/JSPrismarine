/**
 * The handler of one intent kind, which runs once whichever edition decoded the intent
 * ([ADR 0027](../../../../docs/adr/0027-player-inputs-are-decoded-into-intents.md)).
 *
 * A handler's context is the one its kind's lane gets ([ADR 0014](../../../../docs/adr/0014-handlers-share-a-shape-and-run-in-the-input-step.md)):
 * an input-lane handler takes an {@link InputContext} and returns nothing to wait for, since it
 * runs inside the input step; a read-lane handler takes a {@link SessionContext} and may be
 * asynchronous. The lane comes from the intent table, not from the handler, so two handlers of
 * one kind cannot disagree about it.
 */
import type { InputContext, SessionContext } from '../network/handler/HandlerContext';
import type { Intent, IntentKind, IntentLane } from './Intent';

/** The context a handler of intent kind `K` is handed, chosen by the kind's lane. */
export type IntentContext<K extends IntentKind> = IntentLane<K> extends 'input' ? InputContext : SessionContext;

/**
 * What a handler of intent kind `K` returns. An input-lane handler returns `undefined` and not
 * `void`, for the reason the packet handler shape gives: a function returning a promise can stand
 * in for one returning `void`, and the input step must never be handed one.
 */
export type IntentResult<K extends IntentKind> = IntentLane<K> extends 'input' ? undefined : void | Promise<void>;

/** A handler for one intent kind. */
export interface IntentHandler<K extends IntentKind> {
    /**
     * Handles one intent.
     *
     * @param intent - The intent, already decoded and checked against the sender's view.
     * @param context - What the kind's lane hands a handler.
     */
    handle(intent: Intent<K>, context: IntentContext<K>): IntentResult<K>;
}

/** A handler class the server registers for the kind it names. */
export interface IntentHandlerClass<K extends IntentKind = IntentKind> {
    /** The intent kind the class handles. */
    readonly Kind: K;
    new (): IntentHandler<K>;
}
