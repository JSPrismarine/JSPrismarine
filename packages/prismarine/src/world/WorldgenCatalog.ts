import type { WorldPreset } from '@jsprismarine/worldgen';

import type Server from '../Server';
import { withCwd } from '../utils/cwd';
import { findJavaWorldgenSources } from './generators/datadriven/javaWorldgenSources';
import { loadJavaWorldgenRegistriesFrom, requireJavaWorldgenSources } from './generators/datadriven/javaWorldgenData';
import type { JavaWorldgenRegistries } from './generators/datadriven/javaWorldgenData';
import { GeneratorFactories } from './GeneratorFactories';
import type { TerrainCacheSettings } from './GeneratorFactories';
import { BUILT_IN_WORLD_PRESETS, worldPresetsOf } from './resolveStems';

/**
 * What every level builds its terrain from, shared between them: the generator kinds, Java's
 * worldgen registries and world presets from the server's pack stack, and the terrain tile cache.
 * The registries and presets are read once, the first time a level needs them.
 */
export class WorldgenCatalog {
    public readonly factories = new GeneratorFactories();
    private readonly server: Server;
    /** Java's worldgen registries, read once for every level that needs them. */
    private worldgenRegistries: JavaWorldgenRegistries | undefined;
    /** The world presets a `preset` may name, read once from the pack stack. */
    private worldPresets: ReadonlyMap<string, WorldPreset> | undefined;

    public constructor(server: Server) {
        this.server = server;
    }

    /**
     * Java's worldgen registries, projected from the server's pack stack the first time a level
     * needs them.
     *
     * The stack is what `ServerContent` composed: the vanilla datapack and every world and
     * plugin datapack after it, so a `dimension_type` or `noise_settings` document a datapack
     * adds reaches the stems and the noise factory. The biome parameter reports are no
     * datapack's content and come from the Java data cache.
     *
     * @throws {Error} When the Java data cache is cold, naming what to fetch.
     */
    public registries(): JavaWorldgenRegistries {
        const { definitions, javaTarget } = this.server.getContent();
        // The reports and the templates come from the release the content was loaded for, so a
        // preview's definitions never meet the default release's biome parameters.
        return (this.worldgenRegistries ??= loadJavaWorldgenRegistriesFrom(
            definitions,
            requireJavaWorldgenSources(javaTarget.release).reports,
            javaTarget.format[0],
            javaTarget.release
        ));
    }

    /**
     * The presets a `preset` may name: the two built-in Overworld-only ones, with every
     * `worldgen/world_preset` the pack stack carries over them. The vanilla datapack's seven
     * replace both built-ins when the Java data cache is warm.
     */
    public presets(): ReadonlyMap<string, WorldPreset> {
        return (this.worldPresets ??=
            findJavaWorldgenSources(this.server.getContent().javaTarget.release) === undefined
                ? BUILT_IN_WORLD_PRESETS
                : new Map([...BUILT_IN_WORLD_PRESETS, ...worldPresetsOf(this.registries())]));
    }

    /**
     * The terrain tile cache from configuration, or nothing when it is turned off.
     *
     * One directory serves every level: a record's key holds its seed, so two worlds never read
     * each other's tiles.
     */
    public terrainCacheOption(): { terrainCache: TerrainCacheSettings } | Record<string, never> {
        const megabytes = this.server.getConfig().getTerrainCacheSizeMb();
        if (megabytes === 0) return {};

        return {
            terrainCache: {
                directory: withCwd('cache', 'terrain'),
                maxBytes: megabytes * 1024 * 1024,
                codeVersion: this.server.getVersion()
            }
        };
    }
}
