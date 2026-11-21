import type Server from '../Server';
import type BaseProvider from './providers/BaseProvider';
import LevelDB from './providers/leveldb/LevelDB';

/**
 * A level provider class, constructed once per level with the level's folder and the server.
 */
export type ProviderClass = new (folderPath: string, server: Server) => BaseProvider;

/**
 * What a level with no `provider` in its entry gets, and now the only one worth having: the
 * format the game itself uses, so a world this server creates can be opened in Minecraft and one
 * made there can be opened here.
 *
 * The `Filesystem` provider that used to sit beside it is gone. It wrote chunks as the network
 * payload, one file each, which is not a format anything else reads - and it never wrote the
 * block entities, entities or level metadata that the rest of the server had come to depend on,
 * so worlds saved through it came back missing what made them worlds. A config still naming it
 * is refused loudly rather than quietly downgraded, because the two store their chunks in
 * different places and pretending otherwise would read as data loss.
 */
export const DEFAULT_LEVEL_PROVIDER = 'LevelDB';

/** The provider classes a level's entry can name, by their case-sensitive name. */
export class LevelProviders {
    private readonly classes = new Map<string, ProviderClass>([[DEFAULT_LEVEL_PROVIDER, LevelDB]]);

    /** Adds a provider class under a name, replacing one of the same name. */
    public register(name: string, provider: ProviderClass): void {
        this.classes.set(name, provider);
    }

    /** Takes a provider class away. */
    public unregister(name: string): void {
        this.classes.delete(name);
    }

    /** The class a name stands for, the default provider's when no name is given, or undefined. */
    public get(name: string | undefined): ProviderClass | undefined {
        return this.classes.get(name ?? DEFAULT_LEVEL_PROVIDER);
    }

    /** The registered names, in registration order. */
    public names(): string[] {
        return [...this.classes.keys()];
    }
}
