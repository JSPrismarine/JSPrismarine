import type { ComponentFactory, ComponentSchema, ParseResult } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';
import type { Filter } from '@jsprismarine/packs';
import { FilterParseError, parseFilter } from '@jsprismarine/packs';

import type { AttributeName } from '../attributes';
import type { EntityHooks } from '../hooks';

/**
 * The shapes entity component values take, and the factory helpers that turn
 * one into a component.
 *
 * Most of the 192 attribute and behavior components vanilla uses are data: an
 * empty marker, a single number, or a small record the server reads. These
 * helpers cover those so each hand-written component is one that does
 * something.
 */

/** A JSON object, which is what nearly every component value is. */
export type ComponentRecord = Record<string, unknown>;

/** Whether a value is a plain JSON object. */
export const isRecord = (value: unknown): value is ComponentRecord =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Accepts an object and nothing else, which is the shape of every component body. */
export const recordSchema: ComponentSchema<ComponentRecord> = (value) =>
    isRecord(value) ? accepted(value) : rejected('expected an object');

/** Reads a number from a component body, falling back when the key is absent. */
export const numberAt = (body: ComponentRecord, key: string, fallback: number): number =>
    typeof body[key] === 'number' ? body[key] : fallback;

/** Reads a boolean from a component body, falling back when the key is absent. */
export const booleanAt = (body: ComponentRecord, key: string, fallback: boolean): boolean =>
    typeof body[key] === 'boolean' ? body[key] : fallback;

/** Reads a string from a component body, or undefined when the key is absent. */
export const stringAt = (body: ComponentRecord, key: string): string | undefined =>
    typeof body[key] === 'string' ? body[key] : undefined;

/** Normalizes a value vanilla writes as either one object or an array of them. */
export const asList = (value: unknown): readonly unknown[] =>
    value === undefined ? [] : Array.isArray(value) ? value : [value];

/**
 * Parses a filter, turning a grammar error into a schema rejection so the
 * component reports through the same report as everything else.
 */
export const parseFilterValue = (value: unknown, label: string): ParseResult<Filter> => {
    try {
        return accepted(parseFilter(value));
    } catch (error) {
        if (!(error instanceof FilterParseError)) throw error;
        return rejected(`${label}: ${error.message}`);
    }
};

/**
 * A component that carries no parameters, such as `minecraft:physics` or
 * `minecraft:can_climb`. The body still parses, so a typo in it is reported.
 */
export const dataComponent = (name: string): ComponentFactory<EntityHooks, ComponentRecord> => ({
    name,
    hooks: [],
    schema: recordSchema,
    create: () => ({})
});

/**
 * A component whose whole meaning is one number under a key, such as
 * `minecraft:scale` or `minecraft:variant`.
 */
export const numberComponent = (
    name: string,
    key: string,
    fallback: number
): ComponentFactory<EntityHooks, number> => ({
    name,
    hooks: [],
    schema: (value) => (isRecord(value) ? accepted(numberAt(value, key, fallback)) : rejected('expected an object')),
    create: () => ({})
});

/**
 * A component that declares one attribute, such as `minecraft:health` or
 * `minecraft:movement`.
 *
 * Writing the attribute on initialize is what makes a re-added component
 * group reset the stat: the zombie's baby group carries its own
 * `minecraft:movement`, and adding it again puts the speed back.
 */
export const attributeComponent = (
    name: string,
    attribute: AttributeName,
    fallback: number
): ComponentFactory<EntityHooks, { readonly value: number; readonly max: number }> => ({
    name,
    hooks: ['onInitialize'],
    schema: (value) => {
        // One vanilla file writes an attribute as a bare number:
        // the warden's `minecraft:follow_range` is `30`.
        if (typeof value === 'number') return accepted({ value, max: value });
        if (!isRecord(value)) return rejected('expected an object or a number');
        const base = numberAt(value, 'value', fallback);
        return accepted({ value: base, max: numberAt(value, 'max', base) });
    },
    create: (params) => ({
        onInitialize: (entity) => {
            entity.attributes.define(attribute, { base: params.value, max: params.max });
        }
    })
});
