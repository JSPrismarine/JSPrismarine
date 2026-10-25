/**
 * One end of a two-way message channel between the server and the console.
 *
 * `In` is what this end receives and `Out` what it sends, so the server holds a
 * `MessageLink<ConsoleMessage, ServerMessage>` and the console the mirror image. Adapters
 * carry the messages over an IPC channel or, in tests, over memory; callers see only this
 * interface.
 */
export interface MessageLink<In, Out> {
    /**
     * Queues a message for the other end.
     *
     * @returns `true` when the channel accepted the message. `false` means the channel asked
     * for a pause, either because its unsent backlog passed the adapter's threshold or because
     * it has closed. Nothing is dropped by the adapter on `false`; the sender may keep sending,
     * but it should cap its own queue because every queued message stays in memory until the
     * receiver reads it.
     */
    send(message: Out): boolean;

    /**
     * Registers a listener for incoming messages. Listeners run in registration order, one
     * after another, for each message.
     *
     * @returns A function that removes the listener.
     */
    onMessage(listener: (message: In) => void): () => void;

    /**
     * Registers a listener that runs once when the channel closes, whether this end called
     * {@link close} or the other end went away. Listeners run in registration order.
     *
     * @returns A function that removes the listener.
     */
    onClose(listener: () => void): () => void;

    /** Closes the channel. Calling it more than once has no further effect. */
    close(): void;
}

/**
 * Options shared by the adapters that read from another process. Incoming data is JSON the
 * other side wrote, so the adapter cannot know its type; `validate` decides, and anything it
 * rejects is dropped without a throw.
 */
export interface LinkOptions<In> {
    /** Type guard applied to every incoming message, typically `isServerMessage` or `isConsoleMessage`. */
    validate: (value: unknown) => value is In;
}
