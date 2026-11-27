/**
 * The client of a scripting scenario that shows forms: what it answers each form the server
 * sends, and what it records of the form packets it receives. That covers the older
 * `ModalFormRequestPacket` forms and the data-driven screens of `CustomForm` and `MessageBox`,
 * which travel as data store changes and a screen to show.
 *
 * On the pinned Bedrock Dedicated Server the capture drives a headless client that joins over the
 * network. On JSPrismarine the scenario runner stands in for the client at the world seam. Both
 * follow the same {@link FormClientScript}, so the two records line up form for form.
 *
 * This module imports nothing beyond node and relative paths, so the capture script runs it
 * under plain node.
 */
import { isRecord } from '../isRecord.ts';

/**
 * What the client does with one form: send a response, leave the form open, or leave the server.
 * A response carries JSON text, a cancel reason, both or neither, as a client could send them;
 * a reason is a name or the raw byte.
 */
export type FormAnswer =
    | { readonly response?: string; readonly cancel?: FormCancelReason | number }
    | { readonly ignore: true }
    | { readonly leave: true };

/** Why a client dismissed a form, as `ModalFormResponsePacket` names it. */
export type FormCancelReason = 'UserClosed' | 'UserBusy';

/** The wire value of each cancel reason. */
export const FORM_CANCEL_REASONS: Readonly<Record<FormCancelReason, number>> = { UserClosed: 0, UserBusy: 1 };

/** The byte a response's cancel reason travels as. */
export const cancelByte = (reason: FormCancelReason | number): number =>
    typeof reason === 'number' ? reason : FORM_CANCEL_REASONS[reason];

/** Why a client says a data-driven screen closed, as `ServerboundDataDrivenScreenClosedPacket` spells it. */
export type ScreenCloseReason =
    'programmaticclose' | 'programmaticcloseall' | 'clientcanceled' | 'userbusy' | 'invalidform';

/**
 * One thing the client does to a data-driven screen once it is shown: write a value to a path of
 * the screen's data store property, as a player's click or input does, report the screen closed
 * with a reason, or leave the server.
 */
export type ScreenAction =
    | { readonly write: string; readonly value: number | boolean | string }
    | { readonly close: ScreenCloseReason }
    | { readonly leave: true };

/**
 * What the client does with one data-driven screen: its actions, in order, as soon as the screen
 * is shown. A client reports a screen the server closes as closed, as a player's client does,
 * unless `acknowledge` is false.
 */
export interface ScreenAnswer {
    readonly actions: readonly ScreenAction[];
    readonly acknowledge?: boolean;
}

/** A scenario's client: the answer to each form and each data-driven screen, in the order they arrive. */
export interface ScenarioClient {
    readonly answers: readonly FormAnswer[];
    readonly screens?: readonly ScreenAnswer[];
}

/**
 * A data store value as a golden holds it: JSON, except that an int64 is `{ "$int64": "<n>" }`,
 * since BDS sends a count such as a layout's `length` as an int64 and every other number as a
 * double. A map's keys are sorted, as BDS sends them in hash order.
 */
export type ScreenValue =
    | null
    | boolean
    | number
    | string
    | { readonly $int64: string }
    | readonly ScreenValue[]
    | { readonly [key: string]: ScreenValue };

/** A `Data Store Change` property value, by the type numbers of `DataStorePropertyType`. */
export type WireStoreValue =
    | { readonly type: 0 }
    | { readonly type: 1; readonly value: boolean }
    | { readonly type: 2; readonly value: bigint }
    | { readonly type: 3; readonly value: number }
    | { readonly type: 4; readonly value: string }
    | { readonly type: 5; readonly value: readonly WireStoreValue[] }
    | { readonly type: 6; readonly value: readonly { readonly key: string; readonly value: WireStoreValue }[] };

/** A `Data Store Update`'s `Data`, by the type numbers of `DataStoreValueType`. */
export type WireUpdateValue =
    | { readonly type: 0; readonly value: number }
    | { readonly type: 1; readonly value: boolean }
    | { readonly type: 2; readonly value: string };

/** One `ClientboundDataStorePacket` entry, by the selectors of `DataStoreEntryType`, before protocol 2259. */
export type WireStoreEntry =
    | {
          readonly type: 0;
          readonly update: {
              readonly dataStoreName: string;
              readonly property: string;
              readonly path: string;
              readonly data: WireUpdateValue;
              readonly propertyUpdateCount: number;
              readonly pathUpdateCount: number;
          };
      }
    | {
          readonly type: 1;
          readonly change: {
              readonly dataStoreName: string;
              readonly property: string;
              readonly updateCount: number;
              readonly value: WireStoreValue;
          };
      }
    | { readonly type: 2; readonly removal: { readonly dataStoreName: string } };

/** A property value in the form a golden holds it. */
export const screenValueOf = (value: WireStoreValue): ScreenValue => {
    switch (value.type) {
        case 0:
            return null;
        case 2:
            return { $int64: String(value.value) };
        case 5:
            return value.value.map(screenValueOf);
        case 6:
            return Object.fromEntries(
                [...value.value]
                    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
                    .map((entry) => [entry.key, screenValueOf(entry.value)])
            );
        default:
            return value.value;
    }
};

/** A form packet the client received, in the order it received them. */
export type ClientObservation =
    | {
          readonly packet: 'ModalFormRequest';
          /** The form id. Scripts never see it, so a record compares only whether ids repeat. */
          readonly formId: number;
          /** The Form UI JSON exactly as it came, which the server must reproduce byte for byte. */
          readonly json: string;
      }
    | { readonly packet: 'ClientboundCloseForm' }
    /** A whole data store property, as a `Data Store Change` sets it. */
    | {
          readonly packet: 'DataStoreChange';
          readonly dataStore: string;
          readonly property: string;
          readonly updateCount: number;
          readonly value: ScreenValue;
      }
    /** One path of a data store property, as a `Data Store Update` sets it. */
    | {
          readonly packet: 'DataStoreUpdate';
          readonly dataStore: string;
          readonly property: string;
          readonly path: string;
          readonly value: number | boolean | string;
          readonly propertyUpdateCount: number;
          readonly pathUpdateCount: number;
      }
    | { readonly packet: 'DataStoreRemoval'; readonly dataStore: string }
    /** A data-driven screen to open, with the number its data store property name ends in. */
    | { readonly packet: 'ShowScreen'; readonly screenId: string; readonly formId: number; readonly instance: number }
    /** The server closing one data-driven screen, or every one when `formId` is null. */
    | { readonly packet: 'CloseScreen'; readonly formId: number | null };

const isScreenValue = (value: unknown): value is ScreenValue =>
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string' ||
    (Array.isArray(value) && value.every(isScreenValue)) ||
    (isRecord(value) && !Array.isArray(value) && Object.values(value).every(isScreenValue));

/** Whether a parsed value is a {@link ClientObservation}. */
export const isClientObservation = (value: unknown): value is ClientObservation => {
    if (!isRecord(value)) return false;
    const keys = Object.keys(value).length;
    switch (value.packet) {
        case 'ModalFormRequest':
            return Number.isInteger(value.formId) && typeof value.json === 'string' && keys === 3;
        case 'ClientboundCloseForm':
            return keys === 1;
        case 'DataStoreChange':
            return (
                typeof value.dataStore === 'string' &&
                typeof value.property === 'string' &&
                Number.isInteger(value.updateCount) &&
                isScreenValue(value.value) &&
                keys === 5
            );
        case 'DataStoreUpdate':
            return (
                typeof value.dataStore === 'string' &&
                typeof value.property === 'string' &&
                typeof value.path === 'string' &&
                ['number', 'boolean', 'string'].includes(typeof value.value) &&
                Number.isInteger(value.propertyUpdateCount) &&
                Number.isInteger(value.pathUpdateCount) &&
                keys === 7
            );
        case 'DataStoreRemoval':
            return typeof value.dataStore === 'string' && keys === 2;
        case 'ShowScreen':
            return (
                typeof value.screenId === 'string' &&
                Number.isInteger(value.formId) &&
                Number.isInteger(value.instance) &&
                keys === 4
            );
        case 'CloseScreen':
            return (value.formId === null || Number.isInteger(value.formId)) && keys === 2;
        default:
            return false;
    }
};

/** What the client does about a data-driven screen the server shows or closes. */
export interface ScreenStep {
    /** The data store property the screen reads, which the client's writes name. */
    readonly property: string;
    readonly formId: number;
    readonly actions: readonly ScreenAction[];
}

/** Plays one scenario's client: records each form packet and picks the answer to each form. */
export class FormClientScript {
    private readonly answers: readonly FormAnswer[];
    private readonly screenAnswers: readonly ScreenAnswer[];
    private readonly received: ClientObservation[] = [];
    private forms = 0;
    private screens = 0;
    /** The screens shown and not yet reported closed, with the answer each was given. */
    private readonly open = new Map<number, ScreenAnswer>();
    /** Each data store property's update count, and each of its paths', as the client last saw or sent them. */
    private readonly counts = new Map<string, { property: number; readonly paths: Map<string, number> }>();

    public constructor(client: ScenarioClient) {
        this.answers = client.answers;
        this.screenAnswers = client.screens ?? [];
    }

    /** What the client received so far. */
    public get observations(): readonly ClientObservation[] {
        return this.received;
    }

    /**
     * Records a form request and returns what to do with it: the next of the scenario's answers,
     * or leave it open once they run out.
     */
    public formRequested(formId: number, json: string): FormAnswer {
        this.received.push({ packet: 'ModalFormRequest', formId, json });
        return this.answers[this.forms++] ?? { ignore: true };
    }

    /** Records the server closing every form the client has open. */
    public formsClosed(): void {
        this.received.push({ packet: 'ClientboundCloseForm' });
    }

    /** Records the entries of a `ClientboundDataStorePacket`. */
    public dataStore(entries: readonly WireStoreEntry[]): void {
        for (const entry of entries) {
            switch (entry.type) {
                case 0: {
                    const { dataStoreName, property, path, data, propertyUpdateCount, pathUpdateCount } = entry.update;
                    this.countsOf(property).paths.set(path, pathUpdateCount);
                    this.received.push({
                        packet: 'DataStoreUpdate',
                        dataStore: dataStoreName,
                        property,
                        path,
                        value: data.value,
                        propertyUpdateCount,
                        pathUpdateCount
                    });
                    break;
                }
                case 1: {
                    const { dataStoreName, property, updateCount, value } = entry.change;
                    this.counts.set(property, { property: updateCount, paths: new Map() });
                    this.received.push({
                        packet: 'DataStoreChange',
                        dataStore: dataStoreName,
                        property,
                        updateCount,
                        value: screenValueOf(value)
                    });
                    break;
                }
                case 2:
                    this.received.push({ packet: 'DataStoreRemoval', dataStore: entry.removal.dataStoreName });
                    break;
            }
        }
    }

    /**
     * The update counts a write to one path carries: the property's count as the client last saw
     * it, and one more than the path's.
     */
    public written(
        property: string,
        path: string
    ): { readonly propertyUpdateCount: number; readonly pathUpdateCount: number } {
        const counts = this.countsOf(property);
        const pathUpdateCount = (counts.paths.get(path) ?? 0) + 1;
        counts.paths.set(path, pathUpdateCount);
        return { propertyUpdateCount: counts.property, pathUpdateCount };
    }

    private countsOf(property: string): { property: number; readonly paths: Map<string, number> } {
        const known = this.counts.get(property);
        if (known !== undefined) return known;
        const counts = { property: 0, paths: new Map<string, number>() };
        this.counts.set(property, counts);
        return counts;
    }

    /**
     * Records a data-driven screen the server shows and returns what to do with it: the next of
     * the scenario's screen answers, or nothing once they run out.
     */
    public screenShown(screenId: string, formId: number, instance: number): ScreenStep {
        this.received.push({ packet: 'ShowScreen', screenId, formId, instance });
        const answer = this.screenAnswers[this.screens++] ?? { actions: [] };
        // A screen the client closes itself is not open for the server to close.
        if (!answer.actions.some((action) => 'close' in action || 'leave' in action)) this.open.set(formId, answer);
        const kind = screenId === 'minecraft:message_box' ? 'message_box' : 'custom_form';
        return { property: `${kind}_data_${instance}`, formId, actions: answer.actions };
    }

    /**
     * Records the server closing one screen, or every one when `formId` is null, and returns the
     * closes the client reports back: each screen it still has open, unless its answer says not to.
     */
    public screenClosed(
        formId: number | null
    ): readonly { readonly formId: number; readonly reason: ScreenCloseReason }[] {
        this.received.push({ packet: 'CloseScreen', formId });
        const closing = formId === null ? [...this.open.keys()] : this.open.has(formId) ? [formId] : [];
        const reason: ScreenCloseReason = formId === null ? 'programmaticcloseall' : 'programmaticclose';
        return closing.flatMap((each) => {
            if (this.open.get(each)?.acknowledge === false) return [];
            this.open.delete(each);
            return [{ formId: each, reason }];
        });
    }
}

/**
 * The client records with each form id, and each data-driven screen's data instance id, replaced
 * by the order it first appeared in, from 0. The ids are the server's own choice and no script
 * sees them, so two servers agree when the same forms share an id. BDS picks a data instance id
 * at random and names the screen's data store property after it, so the number at the end of a
 * property name is renumbered with the instance ids.
 */
export const normalizeFormIds = (observations: readonly ClientObservation[]): ClientObservation[] => {
    const forms = new Map<number, number>();
    const instances = new Map<string, number>();
    const formId = (id: number): number => {
        const known = forms.get(id) ?? forms.size;
        forms.set(id, known);
        return known;
    };
    const instance = (id: string): number => {
        const known = instances.get(id) ?? instances.size;
        instances.set(id, known);
        return known;
    };
    const property = (name: string): string => {
        const match = /^(.*_data_)(\d+)$/.exec(name);
        return match === null ? name : `${match[1]}${instance(match[2] ?? '')}`;
    };
    return observations.map((observation) => {
        switch (observation.packet) {
            case 'ModalFormRequest':
                return { ...observation, formId: formId(observation.formId) };
            case 'DataStoreChange':
            case 'DataStoreUpdate':
                return { ...observation, property: property(observation.property) };
            case 'ShowScreen':
                return {
                    ...observation,
                    formId: formId(observation.formId),
                    instance: instance(String(observation.instance))
                };
            case 'CloseScreen':
                return { ...observation, formId: observation.formId === null ? null : formId(observation.formId) };
            default:
                return observation;
        }
    });
};
