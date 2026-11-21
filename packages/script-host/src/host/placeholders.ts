/**
 * The registry behind `placeholders` in `@jsprismarine/server`: the namespaces the packs and the
 * server register, each owned by whoever registered it, and the text they render. It knows
 * nothing of the engine: the runtime wraps a pack's resolver in a function and tells the registry
 * who owns it.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

/** A namespace or a key: lowercase letters, digits and underscores, starting with a letter. */
export const PLACEHOLDER_NAME = /^[a-z][a-z0-9_]*$/;

/**
 * A token, `{namespace:key}`. Anything else between braces is not a token and stays as written,
 * so there is no escape syntax.
 */
const TOKEN = /\{([a-z][a-z0-9_]*):([a-z][a-z0-9_]*)\}/g;

/** Who registered a namespace: a pack, or the server under its own name. */
export interface PlaceholderOwner {
    /** The name the content log reports a failing resolver under. */
    readonly name: string;
}

/** What answers a namespace's tokens. */
export interface PlaceholderProvider {
    /** The keys it answers. A token with another key stays as written. */
    readonly keys: readonly string[];
    /**
     * The value of one key, for the player the text is rendered for when there is one. A string
     * or a number renders; anything else leaves the token.
     * @throws Anything: the registry leaves the token and reports the first throw per registration.
     */
    resolve(key: string, player: string | undefined): string | number | undefined;
    /** Called once when the registration ends, however it ends, to free what the resolver holds. */
    dispose?(): void;
}

/** One registered namespace, as `placeholders.namespaces` lists it. */
export interface PlaceholderNamespace {
    readonly namespace: string;
    readonly keys: readonly string[];
}

/** How the registry reports a resolver that throws, and which throws it lets through. */
export interface ScriptPlaceholdersOptions {
    /** Told the first time a registration's resolver throws, so the log has it once per namespace. */
    readonly failed: (owner: PlaceholderOwner, namespace: string, error: unknown) => void;
    /** Whether an error a resolver threw ends the render instead, such as the watchdog's. */
    readonly fatal?: (error: unknown) => boolean;
}

interface Registration {
    readonly owner: PlaceholderOwner;
    readonly namespace: string;
    readonly provider: PlaceholderProvider;
    /** Whether a throw of its resolver has reached the log. */
    reported: boolean;
}

/** The placeholder namespaces of one runtime, and the server's, in registration order. */
export class ScriptPlaceholders {
    private readonly options: ScriptPlaceholdersOptions;
    private readonly registrations = new Map<number, Registration>();
    /** The next registration's id. No id is given twice, so a stale one unregisters nothing. */
    private nextId = 1;

    public constructor(options: ScriptPlaceholdersOptions) {
        this.options = options;
    }

    /**
     * Registers a namespace for an owner.
     * @returns The registration's id, which {@link unregister} takes.
     * @throws {TypeError} For a malformed namespace or key, or a provider without keys.
     * @throws {Error} For a namespace that is registered already.
     */
    public register(owner: PlaceholderOwner, namespace: string, provider: PlaceholderProvider): number {
        if (!PLACEHOLDER_NAME.test(namespace)) {
            throw new ScriptHostErrors.PlaceholderName({ what: 'namespace', name: namespace });
        }
        for (const key of provider.keys) {
            if (!PLACEHOLDER_NAME.test(key)) throw new ScriptHostErrors.PlaceholderName({ what: 'key', name: key });
        }
        if (provider.keys.length === 0) throw new ScriptHostErrors.PlaceholderNoKeys({ namespace });
        if (this.find(namespace) !== undefined) throw new ScriptHostErrors.PlaceholderNamespaceTaken({ namespace });
        const id = this.nextId++;
        this.registrations.set(id, { owner, namespace, provider, reported: false });
        return id;
    }

    /** Ends a registration, when it is the owner's. An id that is not registered is left alone. */
    public unregister(id: number, owner: PlaceholderOwner): void {
        const registration = this.registrations.get(id);
        if (registration === undefined || registration.owner !== owner) return;
        this.registrations.delete(id);
        registration.provider.dispose?.();
    }

    /** Ends every registration of an owner, as its scripts stop. */
    public release(owner: PlaceholderOwner): void {
        for (const [id, registration] of this.registrations) {
            if (registration.owner === owner) this.unregister(id, owner);
        }
    }

    /**
     * Renders a text: each token a registered provider answers becomes its value, and every other
     * token stays as written.
     * @param player - The entity id of the player the text is for, or undefined for no one.
     */
    public resolve(text: string, player: string | undefined): string {
        return text.replace(TOKEN, (token: string, namespace: string, key: string) => {
            const registration = this.find(namespace);
            if (registration === undefined || !registration.provider.keys.includes(key)) return token;
            let value: string | number | undefined;
            try {
                value = registration.provider.resolve(key, player);
            } catch (error) {
                if (this.options.fatal?.(error) === true) throw error;
                if (!registration.reported) {
                    registration.reported = true;
                    this.options.failed(registration.owner, namespace, error);
                }
                return token;
            }
            return typeof value === 'string' || typeof value === 'number' ? String(value) : token;
        });
    }

    /** Every registered namespace with its keys, oldest first. */
    public namespaces(): PlaceholderNamespace[] {
        return [...this.registrations.values()].map(({ namespace, provider }) => ({
            namespace,
            keys: [...provider.keys]
        }));
    }

    private find(namespace: string): Registration | undefined {
        for (const registration of this.registrations.values()) {
            if (registration.namespace === namespace) return registration;
        }
        return undefined;
    }
}
