export abstract class Service {
    /**
     * Enable the service.
     * @returns {Promise<void>} A promise that resolves when the service is enabled.
     * @async
     */
    public abstract onEnable(): Promise<void>;

    /**
     * Disable the service.
     * @returns {Promise<void>} A promise that resolves when the service is disabled.
     * @async
     */
    public abstract onDisable(): Promise<void>;
}
