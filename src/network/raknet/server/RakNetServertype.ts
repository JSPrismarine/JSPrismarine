export default interface IRakNetServerType {
    /**
     * Binds the socket and initialises all handling events.
     */
    listen(): void;
}