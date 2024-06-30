export abstract class Service {
    /**
     * Enable the service.
     * @returns {Promise<void>} A promise that resolves when the service is enabled.
     */
    public abstract enable(): Promise<void>;

    /**
     * Disable the service.
     * @returns {Promise<void>} A promise that resolves when the service is disabled.
     */
    public abstract disable(): Promise<void>;
}
