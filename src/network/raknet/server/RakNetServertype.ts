export default interface IRakNetServer {
    /**
     * Binds the socket and initialises all handling events.
     */
    listen(): void;
}