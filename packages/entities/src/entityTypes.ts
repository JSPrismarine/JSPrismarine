import { Registry } from '@jsprismarine/content';

import { createEntityComponentRegistry } from './components';
import type { DefinitionSource } from './definition';
import { parseEntityDefinition } from './definition';
import type { Diagnostic } from './diagnostics';
import { DiagnosticCollector } from './diagnostics';
import type { EntityInstanceOptions } from './entityInstance';
import { EntityInstance } from './entityInstance';
import type { EntityComponentRegistry, EntityDefinitionInput, EntityType } from './entityType';
import { resolveEntityTypes } from './entityType';
import type { SpawnCause } from './eventEngine';
import { splitSpawnReference } from './eventEngine';

/**
 * The whole package behind one object: parse entity files, resolve them into
 * types, and make live entities.
 *
 * A caller that wants the parts can use {@link parseEntityDefinition},
 * {@link resolveEntityTypes} and {@link EntityInstance} directly; this is the
 * path that does not need any of them named.
 */

/** One entity file to load. */
export interface EntityFile extends DefinitionSource {
    /** The already-parsed JSON of the file. */
    data: unknown;
}

/** Options for an {@link EntityTypes} table. */
export interface EntityTypesOptions {
    /**
     * The component registry to resolve against. Defaults to a fresh registry
     * holding every component this package implements.
     */
    components?: EntityComponentRegistry;
}

/** The parsed definitions, the resolved types and the registry they live in. */
export class EntityTypes {
    /** The resolved types, keyed by identifier with a dense id per entry. */
    public readonly registry = new Registry<EntityType>('entities');

    /** The components the types resolve against. */
    public readonly components: EntityComponentRegistry;

    private readonly inputs: EntityDefinitionInput[] = [];

    public constructor(options: EntityTypesOptions = {}) {
        this.components = options.components ?? createEntityComponentRegistry();
    }

    /**
     * Parses and resolves entity files, replacing whatever the table held.
     *
     * @returns The parse and resolve reports, concatenated.
     */
    public load(files: Iterable<EntityFile>): readonly Diagnostic[] {
        const collector = new DiagnosticCollector();
        this.inputs.length = 0;

        for (const file of files) {
            const parsed = parseEntityDefinition(file.data, file);
            for (const diagnostic of parsed.diagnostics) collector.add(diagnostic);
            if (parsed.definition === undefined) continue;
            this.inputs.push({ definition: parsed.definition, pack: file.pack, path: file.path });
        }

        const resolved = resolveEntityTypes(this.inputs, { components: this.components });
        for (const diagnostic of resolved.diagnostics) collector.add(diagnostic);
        this.registry.rebuild(resolved.types);

        return collector.diagnostics;
    }

    /**
     * Makes one entity and runs its spawn event.
     *
     * The identifier accepts the `identifier<event>` form vanilla writes in
     * `transformation.into` and `permute_type.entity_type`, and the named
     * event replaces the built-in spawn event rather than adding to it.
     *
     * @throws {Error} When no loaded definition carries the identifier.
     */
    public spawn(
        identifier: string,
        options: EntityInstanceOptions & { cause?: SpawnCause; event?: string } = {}
    ): EntityInstance {
        const reference = splitSpawnReference(identifier);
        const holder = this.registry.holder(reference.identifier);
        const entity = new EntityInstance(holder, options);
        entity.spawn(options.cause ?? 'spawned', options.event ?? reference.event);
        return entity;
    }
}
