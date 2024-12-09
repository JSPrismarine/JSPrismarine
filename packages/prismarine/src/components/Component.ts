import type Server from '../Server';

export abstract class Component {
    /**
     * Enable the component.
     * @param {Server} server - The server instance.
     * @returns {Promise<void>} A promise that resolves when the component is enabled.
     */
    public abstract enable(server: Server): Promise<void>;

    /**
     * Disable the component.
     * @returns {Promise<void>} A promise that resolves when the component is disabled.
     */
    public abstract disable(): Promise<void>;
}
