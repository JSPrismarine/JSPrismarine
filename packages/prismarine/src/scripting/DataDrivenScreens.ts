import ClientboundDataDrivenUICloseScreenPacket from '@jsprismarine/protocol/bedrock/packet/ClientboundDataDrivenUICloseScreenPacket';
import ClientboundDataDrivenUIShowScreenPacket from '@jsprismarine/protocol/bedrock/packet/ClientboundDataDrivenUIShowScreenPacket';
import ClientboundDataStorePacket, {
    DataStoreEntryType,
    DataStorePropertyType
} from '@jsprismarine/protocol/bedrock/packet/ClientboundDataStorePacket';
import type {
    DataStoreEntry,
    DataStorePropertyValue,
    DataStoreVariableEntry
} from '@jsprismarine/protocol/bedrock/packet/ClientboundDataStorePacket';
import type { ServerboundDataStore } from '@jsprismarine/protocol/bedrock/packet/ServerboundDataStorePacket';
import { DataDrivenScreenClosedReason } from '@jsprismarine/protocol/bedrock/packet/ServerboundDataDrivenScreenClosedPacket';
import DataStoreUpdate, { DataStoreValueType } from '@jsprismarine/protocol/bedrock/structure/DataStoreUpdate';
import type { DataStoreValue } from '@jsprismarine/protocol/bedrock/structure/DataStoreUpdate';
import { UNTIL_2259 } from '@jsprismarine/protocol/bedrock/wire/wireGates';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import type {
    DataDrivenCloseReason,
    DataDrivenLeaf,
    DataDrivenPathValue,
    DataDrivenRecord,
    DataDrivenScreen,
    DataDrivenValue
} from '@jsprismarine/script-host/host/world';

import type PlayerSession from '../player/PlayerSession';

/** The data store every `@minecraft/server-ui` screen's property lives in, as BDS names it. */
export const SCREEN_DATA_STORE = 'minecraft';

/** The script host's spelling of each close reason a client reports. */
const CLOSE_REASONS: Readonly<Record<DataDrivenScreenClosedReason, DataDrivenCloseReason>> = {
    [DataDrivenScreenClosedReason.ProgrammaticClose]: 'programmaticclose',
    [DataDrivenScreenClosedReason.ProgrammaticCloseAll]: 'programmaticcloseall',
    [DataDrivenScreenClosedReason.ClientCanceled]: 'clientcanceled',
    [DataDrivenScreenClosedReason.UserBusy]: 'userbusy',
    [DataDrivenScreenClosedReason.InvalidForm]: 'invalidform'
};

/** A client's close reason as the script host spells it. */
export const closeReasonOf = (reason: DataDrivenScreenClosedReason): DataDrivenCloseReason => CLOSE_REASONS[reason];

/**
 * A screen's value as a `Data Store Change` carries it: a record is a map, an array a list, a
 * bigint an int64 and any other number a double.
 */
export const propertyValueOf = (value: DataDrivenValue): DataStorePropertyValue => {
    if (value === null) return { type: DataStorePropertyType.NONE };
    switch (typeof value) {
        case 'boolean':
            return { type: DataStorePropertyType.BOOL, value };
        case 'bigint':
            return { type: DataStorePropertyType.INT64, value };
        case 'number':
            return { type: DataStorePropertyType.DOUBLE, value };
        case 'string':
            return { type: DataStorePropertyType.STRING, value };
    }
    if (Array.isArray(value)) return { type: DataStorePropertyType.LIST, value: value.map(propertyValueOf) };
    return {
        type: DataStorePropertyType.MAP,
        value: Object.entries(value).map(([key, each]) => ({ key, value: propertyValueOf(each) }))
    };
};

/** One path's value as a `Data Store Update` carries it. */
const updateValueOf = (value: DataDrivenLeaf): DataStoreValue => {
    switch (typeof value) {
        case 'number':
            return { type: DataStoreValueType.DOUBLE, value };
        case 'boolean':
            return { type: DataStoreValueType.BOOLEAN, value };
        case 'string':
            return { type: DataStoreValueType.STRING, value };
    }
};

/** A client's write to one path of an open screen's property. */
export interface DataDrivenWrite {
    readonly property: string;
    readonly path: string;
    readonly value: DataDrivenLeaf;
}

/**
 * One client's `@minecraft/server-ui` data-driven screens on the wire, as the pinned Bedrock
 * Dedicated Server sends them at the client's protocol. A screen is one property of the client's
 * `minecraft` data store, which the server sets before it tells the client to show the screen; a
 * bound observable changes one path of it, and a screen the client reports closed has the
 * property cleared. The `data-driven-forms` scenario of `packages/parity` records these.
 */
export interface DataDrivenScreens {
    /** Sets the screen's property, sends the updates that follow it, and opens the screen. */
    show(formId: number, screen: DataDrivenScreen): void;
    /** Changes one path of a property the client was sent. */
    update(property: string, change: DataDrivenPathValue): void;
    /** Asks the client to close one screen. */
    close(formId: number): void;
    /**
     * Takes a client's write to a path of an open screen's property.
     * @returns The write, or undefined when it names no screen the client has open or is stale.
     */
    written(payload: ServerboundDataStore): DataDrivenWrite | undefined;
    /**
     * Takes a client's report that a screen closed, and clears the screen's property.
     * @returns Whether the client had the screen open.
     */
    closed(formId: number): boolean;
}

/** How many times one property, and each of its paths, has been set. */
interface PropertyCounts {
    count: number;
    readonly paths: Map<string, number>;
}

/**
 * The screens of a client at protocol 2193 or 2225. A `Data Store Change` sets the whole property,
 * holding maps, and a `Data Store Update` changes one path, such as `layout[7].value`. A screen
 * the client reports closed has its property set to a change that carries no value.
 *
 * Each property counts how often it was set, and each path how often it was updated since; a
 * client's write to a path counts too, so the server's next update of that path follows it.
 */
export class PropertyScreens implements DataDrivenScreens {
    private readonly properties = new Map<string, PropertyCounts>();
    /** The property of each screen the client has open, by form id. */
    private readonly open = new Map<number, string>();

    /** @param send - Sends one packet to the client. */
    public constructor(private readonly send: (packet: NetworkPacket<unknown>) => void) {}

    /** Sets the screen's property, sends the updates that follow it, and opens the screen. */
    public show(formId: number, screen: DataDrivenScreen): void {
        const counts: PropertyCounts = {
            count: (this.properties.get(screen.property)?.count ?? 0) + 1,
            paths: new Map()
        };
        this.properties.set(screen.property, counts);
        this.open.set(formId, screen.property);
        this.store({
            type: DataStoreEntryType.CHANGE,
            change: {
                dataStoreName: SCREEN_DATA_STORE,
                property: screen.property,
                updateCount: counts.count,
                value: propertyValueOf(screen.value)
            }
        });
        for (const change of screen.updates) this.update(screen.property, change);
        this.send(showScreen(formId, screen));
    }

    /** Changes one path of a property the client was sent. */
    public update(property: string, { path, value }: DataDrivenPathValue): void {
        const counts = this.properties.get(property);
        if (counts === undefined) return;
        const pathCount = (counts.paths.get(path) ?? 0) + 1;
        counts.paths.set(path, pathCount);
        this.store({
            type: DataStoreEntryType.UPDATE,
            update: new DataStoreUpdate(
                SCREEN_DATA_STORE,
                property,
                path,
                updateValueOf(value),
                counts.count,
                pathCount
            )
        });
    }

    /** Asks the client to close one screen. */
    public close(formId: number): void {
        this.send(new ClientboundDataDrivenUICloseScreenPacket({ formId }));
    }

    /** Takes a client's write to a path of an open screen's property; undefined when it names none or is stale. */
    public written({ update }: ServerboundDataStore): DataDrivenWrite | undefined {
        if (update === null || update.dataStoreName !== SCREEN_DATA_STORE) return undefined;
        if (![...this.open.values()].includes(update.property)) return undefined;
        const counts = this.properties.get(update.property);
        if (counts !== undefined)
            counts.paths.set(update.path, Math.max(counts.paths.get(update.path) ?? 0, update.pathUpdateCount));
        return { property: update.property, path: update.path, value: update.data.value };
    }

    /** Takes a client's report that a screen closed and clears its property; false when it was not open. */
    public closed(formId: number): boolean {
        const property = this.open.get(formId);
        if (property === undefined) return false;
        this.open.delete(formId);
        const counts = this.properties.get(property);
        if (counts !== undefined) counts.count += 1;
        this.store({
            type: DataStoreEntryType.CHANGE,
            change: {
                dataStoreName: SCREEN_DATA_STORE,
                property,
                updateCount: counts?.count ?? 1,
                value: { type: DataStorePropertyType.NONE }
            }
        });
        return true;
    }

    private store(entry: DataStoreEntry): void {
        this.send(new ClientboundDataStorePacket({ updates: [entry], variableUpdates: [] }));
    }
}

/** The packet that opens a screen, at every protocol. */
const showScreen = (formId: number, screen: DataDrivenScreen): ClientboundDataDrivenUIShowScreenPacket =>
    new ClientboundDataDrivenUIShowScreenPacket({ screenId: screen.screenId, formId, dataInstanceId: screen.instance });

/** The maps of a property that protocol 2259 flattens into variables of their own, rather than JSON. */
const GROUPS = new Set(['closeButton', 'button1', 'button2', 'button3']);

/** The list of a custom form's controls, which protocol 2259 flattens one control at a time. */
const LAYOUT = 'layout';

/** Whether a value is a list; `Array.isArray` does not narrow a readonly array out of a union. */
const isList = (value: DataDrivenValue): value is readonly DataDrivenValue[] => Array.isArray(value);

/** A value that is a map, or undefined. */
const recordOf = (value: DataDrivenValue): DataDrivenRecord | undefined =>
    value === null || typeof value !== 'object' || isList(value) ? undefined : value;

/** Whether a record is a list in BDS's layout: indexes from 0 and an int64 `length`. */
const isIndexed = (record: DataDrivenRecord): boolean => typeof record.length === 'bigint';

/** An indexed record's items, in order. */
const itemsOf = (record: DataDrivenRecord): DataDrivenValue[] =>
    Array.from({ length: Number(record.length) }, (_, index) => record[String(index)] ?? null);

/** A value as JSON, with a bigint as a number, for a map or list protocol 2259 sends as text. */
const jsonOf = (value: DataDrivenValue): unknown => {
    if (typeof value === 'bigint') return Number(value);
    if (value === null || typeof value !== 'object') return value;
    if (isList(value)) return value.map(jsonOf);
    const record = value;
    if (isIndexed(record)) return itemsOf(record).map(jsonOf);
    return Object.fromEntries(Object.entries(record).map(([key, each]) => [key, jsonOf(each)]));
};

/**
 * A property's variables at protocol 2259, in the order the pinned BDS sends them: each value of
 * a control or group under its path, such as `layout[0].text`, and the layout's `length` as a
 * double. A `UIRawMessage` travels as its JSON text and a newline, after a `<path>.__is_object`
 * flag, and a dropdown's items as JSON text after a `<path>.__is_array` flag. A custom form also
 * carries `top_close_button_visible`.
 */
export const variablesOf = (screen: DataDrivenScreen): [string, DataDrivenLeaf][] => {
    const variables: [string, DataDrivenLeaf][] = [];
    const leaf = (path: string, value: DataDrivenValue): void => {
        if (value === null) return;
        if (typeof value === 'bigint') {
            variables.push([path, Number(value)]);
            return;
        }
        if (typeof value !== 'object') {
            variables.push([path, value]);
            return;
        }
        const map = recordOf(value);
        if (map !== undefined && isIndexed(map))
            variables.push([`${path}.__is_array`, true], [path, JSON.stringify(jsonOf(map))]);
        else variables.push([`${path}.__is_object`, true], [path, `${JSON.stringify(jsonOf(value))}\n`]);
    };
    const group = (prefix: string, record: DataDrivenRecord): void => {
        for (const [key, value] of Object.entries(record)) leaf(`${prefix}.${key}`, value);
    };
    const groups: [string, DataDrivenRecord][] = [];
    for (const [key, value] of Object.entries(screen.value)) {
        const record = recordOf(value);
        if (key === LAYOUT && record !== undefined) {
            const controls = itemsOf(record);
            variables.push([`${LAYOUT}.length`, controls.length]);
            controls.forEach((control, index) => {
                const fields = recordOf(control);
                if (fields !== undefined) group(`${LAYOUT}[${index}]`, fields);
            });
        } else if (GROUPS.has(key) && record !== undefined) groups.push([key, record]);
        else {
            leaf(key, value);
            if (key === 'style_id' && screen.screenId === 'minecraft:custom_form')
                variables.push(['top_close_button_visible', true]);
        }
    }
    for (const [key, record] of groups) group(key, record);
    return variables;
};

/**
 * The screens of a client at protocol 2259 or later, whose data store holds variables rather than
 * properties: each value of a screen is a variable named `minecraft.<property>.<path>`, set by a
 * `Data Store Change` with its own update count. A change to a path sends that variable again with
 * the count one higher, and a screen the client reports closed has every variable removed. BDS
 * takes a client's write only when its count is higher than the variable's.
 */
export class VariableScreens implements DataDrivenScreens {
    /** Each variable's update count, by name. */
    private readonly counts = new Map<string, number>();
    /** The variables each property was sent, by property. */
    private readonly variables = new Map<string, string[]>();
    /** The property of each screen the client has open, by form id. */
    private readonly open = new Map<number, string>();

    /** @param send - Sends one packet to the client. */
    public constructor(private readonly send: (packet: NetworkPacket<unknown>) => void) {}

    /** Sets the screen's property, sends the updates that follow it, and opens the screen. */
    public show(formId: number, screen: DataDrivenScreen): void {
        this.open.set(formId, screen.property);
        const sent = variablesOf(screen).map(([path, value]) => this.change(screen.property, path, value));
        this.variables.set(
            screen.property,
            sent.map((entry) => (entry.type === DataStoreEntryType.CHANGE ? entry.change.variableName : ''))
        );
        // The updates BDS sends a 2225 client after the property are values the variables already hold.
        this.store(sent);
        this.send(showScreen(formId, screen));
    }

    /** Changes one path of a property the client was sent. */
    public update(property: string, { path, value }: DataDrivenPathValue): void {
        if (!this.variables.has(property)) return;
        this.store([this.change(property, path, value)]);
    }

    /** Asks the client to close one screen. */
    public close(formId: number): void {
        this.send(new ClientboundDataDrivenUICloseScreenPacket({ formId }));
    }

    /** Takes a client's write to a path of an open screen's property; undefined when it names none or is stale. */
    public written({ variableUpdate }: ServerboundDataStore): DataDrivenWrite | undefined {
        if (variableUpdate === null) return undefined;
        const prefix = `${SCREEN_DATA_STORE}.`;
        const { variableName, updateCount, data } = variableUpdate;
        if (!variableName.startsWith(prefix)) return undefined;
        const rest = variableName.slice(prefix.length);
        const property = [...this.open.values()].find((each) => rest.startsWith(`${each}.`));
        if (property === undefined) return undefined;
        if (updateCount <= (this.counts.get(variableName) ?? 0)) return undefined;
        this.counts.set(variableName, updateCount);
        return { property, path: rest.slice(property.length + 1), value: data.value };
    }

    /** Takes a client's report that a screen closed and clears its property; false when it was not open. */
    public closed(formId: number): boolean {
        const property = this.open.get(formId);
        if (property === undefined) return false;
        this.open.delete(formId);
        const names = this.variables.get(property) ?? [];
        this.variables.delete(property);
        for (const name of names) this.counts.delete(name);
        this.store(names.map((variableName) => ({ type: DataStoreEntryType.REMOVAL, removal: { variableName } })));
        return true;
    }

    /** The change that sets one variable, with its count one higher than the last. */
    private change(property: string, path: string, value: DataDrivenLeaf): DataStoreVariableEntry {
        const variableName = `${SCREEN_DATA_STORE}.${property}.${path}`;
        const updateCount = (this.counts.get(variableName) ?? 0) + 1;
        this.counts.set(variableName, updateCount);
        return { type: DataStoreEntryType.CHANGE, change: { variableName, updateCount, value: updateValueOf(value) } };
    }

    private store(entries: DataStoreVariableEntry[]): void {
        this.send(new ClientboundDataStorePacket({ updates: [], variableUpdates: entries }));
    }
}

/**
 * The screens of a client at a protocol, in the data store layout its protocol uses: properties
 * up to 2225, variables from 2259.
 * @param send - Sends one packet to the client.
 */
export const dataDrivenScreensFor = (
    protocolVersion: number,
    send: (packet: NetworkPacket<unknown>) => void
): DataDrivenScreens =>
    UNTIL_2259.includedAt(protocolVersion) ? new PropertyScreens(send) : new VariableScreens(send);

const screens = new WeakMap<PlayerSession, DataDrivenScreens>();

/** A session's data-driven screens, the same object for as long as it is connected. */
export const dataDrivenScreensOf = (session: PlayerSession): DataDrivenScreens => {
    let found = screens.get(session);
    if (found === undefined) {
        found = dataDrivenScreensFor(session.getConnection().codec.protocolVersion, (packet) =>
            session.released(session.send(packet))
        );
        screens.set(session, found);
    }
    return found;
};
