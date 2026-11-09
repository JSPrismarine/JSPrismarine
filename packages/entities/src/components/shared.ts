/** Parsing helpers and state shapes that several vanilla component modules share. */

import type { Filter } from '@jsprismarine/packs';
import type { EventTarget } from '../events';
import { parseEventTarget } from '../events';
import type { ComponentRecord } from './schemas';
import { isRecord, stringAt } from './schemas';

/** A countdown a component keeps per entity between repeats. */
export interface IntervalState {
    remaining: number;
}

/** Reads a `[min, max]` range written as one number or a two-number list. */
export const parseTimeRange = (value: unknown): readonly [number, number] => {
    if (typeof value === 'number') return [value, value];
    if (Array.isArray(value)) {
        const parts = value.filter((part): part is number => typeof part === 'number');
        return [parts[0] ?? 0, parts[1] ?? parts[0] ?? 0];
    }
    return [0, 0];
};

/** Adds the default vanilla namespace to a component identifier that omits it. */
export const qualifiedSpawnIdentifier = (identifier: string): string =>
    identifier.includes(':') ? identifier : `minecraft:${identifier}`;

/** One `{filters, event, target}` trigger, which five component bodies share. */
export interface SensorTrigger {
    readonly filters?: Filter;
    readonly event?: string;
    readonly target: EventTarget;
}

/** Reads an event trigger written as a string or `{event, target}` object. */
export const parseComponentTrigger = (value: unknown): SensorTrigger | undefined => {
    if (typeof value === 'string') return { event: value, target: 'self' };
    if (!isRecord(value)) return undefined;
    const event = stringAt(value, 'event');
    if (event === undefined) return undefined;
    return { event, target: parseEventTarget(value.target, () => undefined) };
};

/** Reads a finite number from a sensor body, or `undefined` when the field holds anything else. */
export const sensorNumber = (record: ComponentRecord, key: string, fallback: number): number | undefined => {
    const value = record[key];
    if (value === undefined) return fallback;
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

/** Normalizes an item identifier with Bedrock's default namespace. */
export const normalizedItemIdentifier = (identifier: string): string =>
    identifier.includes(':') ? identifier : `minecraft:${identifier}`;
