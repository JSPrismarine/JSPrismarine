import type Server from '../Server';
import type { Component } from './Component';

export class ComponentsManager {
    private readonly components: Map<string, Component> = new Map();

    /**
     * Add a component to the consumer.
     * @param {Component} component - The component to add.
     */
    public addComponent(component: Component) {
        this.components.set(component.constructor.name, component);
    }

    /**
     * Remove a component from the consumer.
     * @param {Component} component - The component to remove.
     */
    public removeComponent(component: Component) {
        this.components.delete(component.constructor.name);
    }

    /**
     * Enable all components.
     * @returns {Promise<void>} A promise that resolves when all components are enabled.
     */
    public async enable(server: Server) {
        await Promise.all(Array.from(this.components.values()).map((component) => component.enable(server)));
    }

    /**
     * Disable all components.
     * @returns {Promise<void>} A promise that resolves when all components are disabled.
     */
    public async disable() {
        await Promise.all(Array.from(this.components.values()).map((component) => component.disable()));
    }
}
