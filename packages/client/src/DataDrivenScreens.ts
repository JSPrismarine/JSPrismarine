import { EventEmitter } from 'node:events';

import ClientboundDataDrivenUICloseScreenPacket from '@jsprismarine/protocol/bedrock/packet/ClientboundDataDrivenUICloseScreenPacket';
import ClientboundDataDrivenUIShowScreenPacket from '@jsprismarine/protocol/bedrock/packet/ClientboundDataDrivenUIShowScreenPacket';
import ClientboundDataStorePacket, {
    DataStoreEntryType,
    DataStorePropertyType
} from '@jsprismarine/protocol/bedrock/packet/ClientboundDataStorePacket';
import type {
    ClientboundDataStore,
    DataStorePropertyValue
} from '@jsprismarine/protocol/bedrock/packet/ClientboundDataStorePacket';
import ServerboundDataDrivenScreenClosedPacket, {
    DataDrivenScreenClosedReason
} from '@jsprismarine/protocol/bedrock/packet/ServerboundDataDrivenScreenClosedPacket';
import ServerboundDataStorePacket from '@jsprismarine/protocol/bedrock/packet/ServerboundDataStorePacket';
import DataStoreUpdate, { DataStoreValueType } from '@jsprismarine/protocol/bedrock/structure/DataStoreUpdate';
import type { DataStoreValue } from '@jsprismarine/protocol/bedrock/structure/DataStoreUpdate';
import { UNTIL_2259 } from '@jsprismarine/protocol/bedrock/wire/wireGates';

import type ClientSession from './net/ClientSession';

/** The data store every `@minecraft/server-ui` screen's property lives in. */
const SCREEN_DATA_STORE = 'minecraft';

/** A value a client can write to one path of a screen's property. */
export type ScreenWriteValue = boolean | number | string;

/** A data-driven screen the server opened and has not closed. */
export interface ClientScreen {
    readonly formId: number;
    /** The screen, such as `minecraft:custom_form` or `minecraft:message_box`. */
    readonly screenId: string;
    /** The data store property the screen reads, such as `custom_form_data_3`. */
    readonly property: string;
    /**
     * Each value of the property by its path, such as `title` or `layout[0].text`, as the server
     * last set it. A nested message or list is a plain value under the path that holds it.
     */
    readonly values: ReadonlyMap<string, unknown>;
}

/** A property value as plain data: a map becomes an object and a list an array. */
const plainOf = (value: DataStorePropertyValue): unknown => {
    switch (value.type) {
        case DataStorePropertyType.NONE:
            return null;
        case DataStorePropertyType.LIST:
            return value.value.map(plainOf);
        case DataStorePropertyType.MAP:
            return Object.fromEntries(value.value.map((entry) => [entry.key, plainOf(entry.value)]));
        default:
            return value.value;
    }
};

/**
 * Writes a property's values into `values` by path: a map's keys after a dot, an index in
 * brackets, and anything else, such as a list, as one value.
 */
const flatten = (path: string, value: DataStorePropertyValue, values: Map<string, unknown>): void => {
    if (value.type !== DataStorePropertyType.MAP) {
        values.set(path, plainOf(value));
        return;
    }
    for (const { key, value: each } of value.value) {
        const child = /^\d+$/.test(key) ? `${path}[${key}]` : path === '' ? key : `${path}.${key}`;
        flatten(child, each, values);
    }
};

/** Drops a path and every path under it. */
const forget = (values: Map<string, unknown>, path: string): void => {
    for (const key of [...values.keys()])
        if (key === path || key.startsWith(`${path}.`) || key.startsWith(`${path}[`)) values.delete(key);
};

/** One write's value as a data store update carries it. */
const writeValueOf = (value: ScreenWriteValue): DataStoreValue => {
    switch (typeof value) {
        case 'number':
            return { type: DataStoreValueType.DOUBLE, value };
        case 'boolean':
            return { type: DataStoreValueType.BOOLEAN, value };
        case 'string':
            return { type: DataStoreValueType.STRING, value };
    }
};

/** One property the server set, with its update counts. */
interface Property {
    readonly values: Map<string, unknown>;
    /** How often the whole property was set, at protocols before 2259. */
    count: number;
    /** Each path's update count: per path before 2259, per variable from 2259. */
    readonly counts: Map<string, number>;
}

/**
 * The client's half of `@minecraft/server-ui`'s data-driven screens: the `CustomForm` and
 * `MessageBox` a behavior pack shows. The server sets the screen's property in the `minecraft`
 * data store and then opens the screen; this keeps each property's values by path, answers a
 * close the server asks for as a player's client does, and sends the player's clicks, writes and
 * dismissals. It reads both layouts the server sends: a property of maps up to protocol 2225, and
 * a variable per value from 2259.
 *
 * Emits `show` with a {@link ClientScreen} when a screen opens, and `close` with the form id
 * when one closes.
 */
export default class DataDrivenScreens extends EventEmitter {
    /** The packets this reads, registered on the client's registry with the others. */
    public static readonly PACKETS = [
        ClientboundDataStorePacket,
        ClientboundDataDrivenUIShowScreenPacket,
        ClientboundDataDrivenUICloseScreenPacket
    ] as const;

    private readonly properties = new Map<string, Property>();
    private readonly open = new Map<number, ClientScreen>();
    private readonly variables: boolean;

    /**
     * Registers the screen handlers on the session, for the life of the session.
     * @param session - The session whose screens this follows and answers.
     * @param protocolVersion - The protocol the client speaks, which decides the data store layout.
     */
    public constructor(
        private readonly session: ClientSession,
        protocolVersion: number
    ) {
        super();
        this.variables = !UNTIL_2259.includedAt(protocolVersion);
        session.registerHandler(ClientboundDataStorePacket, {
            phases: ['play'],
            handle: (store) => this.store(store)
        });
        session.registerHandler(ClientboundDataDrivenUIShowScreenPacket, {
            phases: ['play'],
            handle: ({ screenId, formId, dataInstanceId }) => {
                const property = `${screenId.slice(screenId.indexOf(':') + 1)}_data_${dataInstanceId ?? 0}`;
                const screen: ClientScreen = { formId, screenId, property, values: this.property(property).values };
                this.open.set(formId, screen);
                this.emit('show', screen);
            }
        });
        session.registerHandler(ClientboundDataDrivenUICloseScreenPacket, {
            phases: ['play'],
            handle: async ({ formId }) => {
                // A packet without a form id closes every screen.
                const closing = formId === undefined ? [...this.open.keys()] : [formId];
                const reason =
                    formId === undefined
                        ? DataDrivenScreenClosedReason.ProgrammaticCloseAll
                        : DataDrivenScreenClosedReason.ProgrammaticClose;
                await Promise.all(
                    closing.filter((each) => this.open.has(each)).map((each) => this.close(each, reason))
                );
            }
        });
    }

    /** The screens open now, oldest first. */
    public screens(): readonly ClientScreen[] {
        return [...this.open.values()];
    }

    /** Writes a value to one path of an open screen's property, as an input control does. */
    public async write(formId: number, path: string, value: ScreenWriteValue): Promise<void> {
        const screen = this.open.get(formId);
        if (screen === undefined) return;
        const property = this.property(screen.property);
        property.values.set(path, value);
        const data = writeValueOf(value);
        if (this.variables) {
            const variableName = `${SCREEN_DATA_STORE}.${screen.property}.${path}`;
            const updateCount = (property.counts.get(path) ?? 0) + 1;
            property.counts.set(path, updateCount);
            await this.session.send(
                new ServerboundDataStorePacket({ update: null, variableUpdate: { variableName, data, updateCount } })
            );
            return;
        }
        const pathCount = (property.counts.get(path) ?? 0) + 1;
        property.counts.set(path, pathCount);
        const update = new DataStoreUpdate(SCREEN_DATA_STORE, screen.property, path, data, property.count, pathCount);
        await this.session.send(new ServerboundDataStorePacket({ update, variableUpdate: null }));
    }

    /**
     * Clicks a button or image by the path of its `onClick`, such as `layout[4].onClick`,
     * `layout[1].image_onClick` or a message box's `button1.onClick`.
     */
    public async click(formId: number, path: string): Promise<void> {
        const clicks = this.open.get(formId)?.values.get(path);
        await this.write(formId, path, (typeof clicks === 'number' ? clicks : 0) + 1);
    }

    /** Reports a screen closed, by default as the player dismissing it. */
    public async close(
        formId: number,
        reason: DataDrivenScreenClosedReason = DataDrivenScreenClosedReason.ClientCanceled
    ): Promise<void> {
        if (!this.open.delete(formId)) return;
        this.emit('close', formId);
        await this.session.send(new ServerboundDataDrivenScreenClosedPacket({ formId, closeReason: reason }));
    }

    private property(name: string): Property {
        const known = this.properties.get(name);
        if (known !== undefined) return known;
        const property: Property = { values: new Map(), count: 0, counts: new Map() };
        this.properties.set(name, property);
        return property;
    }

    /** Applies the changes, updates and removals of one `ClientboundDataStorePacket`. */
    private store({ updates, variableUpdates }: ClientboundDataStore): void {
        for (const entry of updates) {
            if (entry.type === DataStoreEntryType.CHANGE) {
                const { property: name, updateCount, value } = entry.change;
                const property = this.property(name);
                property.values.clear();
                property.counts.clear();
                property.count = updateCount;
                flatten('', value, property.values);
            } else if (entry.type === DataStoreEntryType.UPDATE) {
                const { property: name, path, data, pathUpdateCount } = entry.update;
                const property = this.property(name);
                forget(property.values, path);
                property.values.set(path, data.value);
                property.counts.set(path, pathUpdateCount);
            }
        }
        for (const entry of variableUpdates) {
            const variableName =
                entry.type === DataStoreEntryType.CHANGE
                    ? entry.change.variableName
                    : entry.type === DataStoreEntryType.UPDATE
                      ? entry.update.variableName
                      : entry.removal.variableName;
            const rest = variableName.startsWith(`${SCREEN_DATA_STORE}.`)
                ? variableName.slice(SCREEN_DATA_STORE.length + 1)
                : undefined;
            const dot = rest?.indexOf('.') ?? -1;
            if (rest === undefined || dot < 0) continue;
            const property = this.property(rest.slice(0, dot));
            const path = rest.slice(dot + 1);
            if (entry.type === DataStoreEntryType.REMOVAL) {
                property.values.delete(path);
                property.counts.delete(path);
                continue;
            }
            const { data, updateCount } =
                entry.type === DataStoreEntryType.CHANGE
                    ? { data: entry.change.value, updateCount: entry.change.updateCount }
                    : entry.update;
            property.values.set(path, data.value);
            property.counts.set(path, updateCount);
        }
    }
}
