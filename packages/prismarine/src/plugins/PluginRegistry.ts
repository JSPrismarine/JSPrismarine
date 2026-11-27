/**
 * The extensions a server runs, grouped by the kind of extension, which `/plugins` and query
 * report.
 *
 * Addons are the only kind today. A loader for another kind, such as WebAssembly modules or
 * native libraries, registers a {@link PluginSource} of its own, and both reports list it without
 * changing either of them.
 */
import type { AddonManager } from '../addons/AddonManager';

/** One extension, as `/plugins` and query name it. */
export interface ServerPlugin {
    readonly name: string;
    readonly version: string;
    /** Whether it is running. A loader that keeps a failed extension lists it as disabled. */
    readonly enabled: boolean;
}

/** One kind of extension, and the extensions of that kind the server has. */
export interface PluginSource {
    /** The heading `/plugins` groups this kind under, such as `Addons`. */
    readonly label: string;
    /** Read whenever a report runs, so it answers from memory. */
    plugins(): readonly ServerPlugin[];
}

/** A source's heading and its extensions, sorted by name. */
export interface PluginGroup {
    readonly label: string;
    readonly plugins: readonly ServerPlugin[];
}

/** Sorts by name, ignoring case, as Paper's `/plugins` does. */
const byName = (a: ServerPlugin, b: ServerPlugin): number =>
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

/** The kinds of extension the server has, in the order they were registered. */
export class PluginRegistry {
    private readonly sources: PluginSource[] = [];

    /**
     * Adds a kind of extension.
     * @returns A function that removes it again.
     */
    public register(source: PluginSource): () => void {
        this.sources.push(source);
        return () => {
            const index = this.sources.indexOf(source);
            if (index !== -1) this.sources.splice(index, 1);
        };
    }

    /** Each kind that has an extension, in registration order, with its extensions sorted by name. */
    public groups(): readonly PluginGroup[] {
        return this.sources
            .map((source) => ({ label: source.label, plugins: [...source.plugins()].sort(byName) }))
            .filter(({ plugins }) => plugins.length > 0);
    }

    /** Every extension, grouped as {@link groups} orders them. */
    public plugins(): readonly ServerPlugin[] {
        return this.groups().flatMap(({ plugins }) => plugins);
    }
}

/**
 * The installed addons as a kind of extension. An addon runs once it is installed, so each one
 * is enabled.
 */
export const addonPluginSource = (addons: () => AddonManager): PluginSource => ({
    label: 'Addons',
    plugins: () =>
        addons()
            .loadedAddons()
            .map(({ name, version }) => ({ name, version, enabled: true }))
});
