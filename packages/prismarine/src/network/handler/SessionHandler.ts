/**
 * The server's packet handlers of a player session, in the shape `@jsprismarine/protocol`
 * defines for both sides
 * ([ADR 0014](../../../../../docs/adr/0014-handlers-share-a-shape-and-run-in-the-input-step.md)).
 *
 * A handler in this shape takes a {@link SessionContext} or an {@link InputContext} instead of
 * the `Server`. Handlers move to it one group at a time; until each has, the dispatcher still
 * runs the earlier `PacketHandler`, which takes the server, and tells the two apart with
 * {@link takesContext}.
 */
import type { InputHandler, LaneHandler } from '@jsprismarine/protocol/handler/PacketHandler';
import type { SessionPhase } from '../SessionPhase';
import type { InputContext, SessionContext } from './HandlerContext';

/** Marks a handler that takes a context, which the earlier shape does not declare. */
interface TakesContext {
    /** Read by {@link takesContext}. */
    readonly takes: 'context';
}

/** A connection-lane handler: it touches only its own session, and runs when its packet arrives. */
export interface ConnectionLaneHandler<P>
    extends LaneHandler<P, SessionContext, 'connection', SessionPhase>, TakesContext {}

/** A read-lane handler: it reads the world, writes nothing, and answers only its sender. */
export interface ReadLaneHandler<P> extends LaneHandler<P, SessionContext, 'read', SessionPhase>, TakesContext {}

/**
 * An input-lane handler: applied synchronously in the input step of its sender's world, inside
 * one unit of that world's change log, so a throw undoes what it wrote.
 */
export interface InputLaneHandler<P> extends InputHandler<P, InputContext, SessionPhase>, TakesContext {}

/** Any handler of a player session in the shared shape, its context chosen by its lane. */
export type SessionHandler<P> = ConnectionLaneHandler<P> | ReadLaneHandler<P> | InputLaneHandler<P>;

/**
 * Whether a registered handler takes a context rather than the server.
 *
 * @param handler - Any handler the registry holds.
 */
export const takesContext = <P>(handler: SessionHandler<P> | object): handler is SessionHandler<P> =>
    'takes' in handler && handler.takes === 'context';
