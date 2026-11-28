/**
 * `java-content.json`: the vanilla carriers the server's custom content rides on for Java clients.
 * A custom item is sent as a vanilla base item that names a model of its own, and the converted
 * resource pack draws that model, so both have to agree from one start to the next. The server
 * makes each assignment the first time it sees the content and never changes or reuses it, the way
 * a save keeps its dimension numbers: a removed addon's assignments stay, so reinstalling it gives
 * the same ones back.
 */
import { parseConfigDocument } from '../../config/ConfigDocument';
import type { FileMigrations, MigrationLogger } from '../../config/FileMigrations';
import { migrateFile } from '../../config/FileMigrations';
import { writeJsonFile } from '../../config/JsonFile';
import { isRecord } from '../../utils/isRecord';

/** The file's name, beside `config.json` and `levels.json`. */
export const JAVA_CONTENT_FILE_NAME = 'java-content.json';

/** The layout this server writes. */
export const JAVA_CONTENT_SCHEMA_VERSION = 1;

/** How `java-content.json` upgrades. It has had one layout so far. */
export const JAVA_CONTENT_MIGRATIONS: FileMigrations = {
    fileName: JAVA_CONTENT_FILE_NAME,
    unversioned: JAVA_CONTENT_SCHEMA_VERSION,
    current: JAVA_CONTENT_SCHEMA_VERSION,
    steps: [],
    keyOrder: ['schemaVersion', 'items']
};

/** How a custom item reaches a Java client. */
export interface JavaItemAssignment {
    /** The model key its stacks name with `minecraft:item_model`, unique among the assignments. */
    readonly model: string;
    /** The vanilla item its stacks are, which the client takes its hard-coded behavior from. */
    readonly base: string;
}

/** The base an item gets when none of its components needs another. */
export const DEFAULT_ITEM_BASE = 'minecraft:paper';

/**
 * The Bedrock components whose behavior a Java client builds into one item's class, and that
 * item. Every other behavior comes from data components, which any base carries.
 */
const BASES_BY_COMPONENT: readonly (readonly [string, string])[] = [
    ['minecraft:shooter', 'minecraft:bow'],
    ['minecraft:throwable', 'minecraft:snowball']
];

/**
 * The base a custom item needs: the item whose class does what one of its components asks, or
 * paper.
 * @param components - The item's Bedrock components, by name.
 * @returns The base's Java id.
 */
export const javaItemBaseOf = (components: ReadonlyMap<string, unknown>): string =>
    BASES_BY_COMPONENT.find(([component]) => components.has(component))?.[1] ?? DEFAULT_ITEM_BASE;

/** A Java resource location's path characters, as the model key's namespace and path need them. */
const resourcePath = (value: string): string => value.toLowerCase().replace(/[^a-z0-9/._-]/g, '_');

/** The model key an identifier asks for: itself, as a Java resource location. */
const modelKeyOf = (identifier: string): string => {
    const colon = identifier.indexOf(':');
    return colon === -1
        ? `minecraft:${resourcePath(identifier)}`
        : `${resourcePath(identifier.slice(0, colon))}:${resourcePath(identifier.slice(colon + 1))}`;
};

/** Reads one entry, or undefined for one that is not an assignment. */
const assignmentOf = (value: unknown): JavaItemAssignment | undefined =>
    isRecord(value) && typeof value.model === 'string' && typeof value.base === 'string'
        ? { model: value.model, base: value.base }
        : undefined;

/** The assignments `java-content.json` records, read from and written to one file. */
export class JavaContentAssignments {
    private readonly file: string;
    private readonly logger: MigrationLogger;
    private readonly items = new Map<string, JavaItemAssignment>();
    private readonly models = new Set<string>();
    /** Whether an assignment was made since the file was last written. */
    private changed = false;

    /**
     * @param file - The path of `java-content.json`.
     * @param logger - Told when the file is upgraded.
     */
    public constructor(file: string, logger: MigrationLogger) {
        this.file = file;
        this.logger = logger;
    }

    /** Reads the file, upgrading an older layout. A missing file holds no assignments. */
    public async load(): Promise<void> {
        this.items.clear();
        this.models.clear();
        const migrated = await migrateFile(this.file, JAVA_CONTENT_MIGRATIONS, this.logger);
        const root = migrated?.document.get(['items']);
        if (!isRecord(root)) return;
        for (const [identifier, value] of Object.entries(root)) {
            const assignment = assignmentOf(value);
            if (assignment === undefined || this.models.has(assignment.model)) continue;
            this.items.set(identifier, assignment);
            this.models.add(assignment.model);
        }
    }

    /** A custom item's assignment, or undefined for one never assigned. */
    public item(identifier: string): JavaItemAssignment | undefined {
        return this.items.get(identifier);
    }

    /**
     * A custom item's assignment, made now if it has none. A new one takes the identifier as its
     * model key, with a number after it when another item already has that key.
     * @param identifier - The item's Bedrock identifier.
     * @param components - Its Bedrock components, which choose its base.
     * @returns The assignment, which {@link save} writes.
     */
    public assignItem(identifier: string, components: ReadonlyMap<string, unknown>): JavaItemAssignment {
        const known = this.items.get(identifier);
        if (known !== undefined) return known;
        const wanted = modelKeyOf(identifier);
        let model = wanted;
        for (let n = 2; this.models.has(model); n++) model = `${wanted}_${n}`;
        const assignment: JavaItemAssignment = { model, base: javaItemBaseOf(components) };
        this.items.set(identifier, assignment);
        this.models.add(model);
        this.changed = true;
        return assignment;
    }

    /** Writes the file when an assignment was made since it was last written. */
    public async save(): Promise<void> {
        if (!this.changed) return;
        const document = parseConfigDocument('{}', JAVA_CONTENT_MIGRATIONS.keyOrder);
        document.set(['schemaVersion'], JAVA_CONTENT_SCHEMA_VERSION);
        document.set(['items'], Object.fromEntries(this.items));
        await writeJsonFile(this.file, document);
        this.changed = false;
    }
}
