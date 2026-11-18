import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect } from 'vitest';

import { reportProgress } from './reportProgress';

/**
 * `reports/registries.json` under the `generated` directory `JSP_JAVA_REPORTS` points at, or
 * undefined when the variable is unset or the file is missing. `scripts/real-data-env.mts` sets
 * the variable after `datagen:java` has filled the cache.
 */
const registriesPath = ((): string | undefined => {
    const root = process.env.JSP_JAVA_REPORTS;
    if (root === undefined || root === '') return undefined;
    const path = join(root, 'reports', 'registries.json');
    return existsSync(path) ? path : undefined;
})();

/** `describe` when the pinned Java registry report is present, otherwise `describe.skip`. */
export const describeWithJavaRegistries: ReturnType<typeof describe.skipIf> = describe.skipIf(
    registriesPath === undefined
);

let registries: Record<string, { entries: Record<string, unknown> }> | undefined;

/**
 * Lists the entries of one registry in the pinned Java registry report.
 *
 * @param registry - The registry's id, such as `minecraft:worldgen/feature_type`.
 * @returns The entry ids, such as `minecraft:ore`, in the report's order.
 */
export const javaRegistryEntries = (registry: string): string[] => {
    if (registriesPath === undefined) {
        throw new TypeError('JSP_JAVA_REPORTS does not point at the Java data generator reports');
    }
    // The report is Mojang's data generator output; only the shape this helper reads is typed.
    registries ??= JSON.parse(readFileSync(registriesPath, 'utf8')) as Record<
        string,
        { entries: Record<string, unknown> }
    >;
    const entries = registries[registry]?.entries;
    if (entries === undefined) throw new TypeError(`the Java registry report has no ${registry}`);
    return Object.keys(entries);
};

/**
 * Builds a handler check out of a parser that fails with a dedicated error on a type it does
 * not know. The probe document holds the type id and no children, so for a type the parser
 * handles it fails on a missing field, and for one it does not it fails on the type.
 *
 * @param parse - Parses a document that names the type id, such as `{ type: id }`.
 * @param isUnknownType - Whether an error is the parser's unknown-type error.
 * @returns Whether the parser recognizes a type id.
 */
export const recognizesType =
    (parse: (id: string, path: string) => unknown, isUnknownType: (error: unknown) => boolean) =>
    (id: string): boolean => {
        try {
            parse(id, 'registry-probe');
            return true;
        } catch (error) {
            return !isUnknownType(error);
        }
    };

/** One registry checked against a package's handlers. */
export interface RegistryCoverage {
    /** The registry's id in the report, such as `minecraft:worldgen/feature_type`. */
    readonly registry: string;
    /** Whether the package handles an entry id. */
    readonly handles: (id: string) => boolean;
    /** The reviewed entry ids the package does not handle yet. */
    readonly unhandled: readonly string[];
}

/** A type id no registry has, which a working handler check must reject. */
const NOT_A_TYPE = 'minecraft:jsp_not_a_registered_type';

/**
 * Fails when a registry entry has neither a handler nor a reviewed `unhandled` entry, and when a
 * reviewed entry has a handler now or is gone from the report, so the reviewed list only
 * shrinks. It also fails when the handler check accepts an id no registry has, which is what a
 * probe that never reaches the type dispatch looks like. Reports the handled count as
 * non-gating progress.
 */
export const expectRegistryCovered = ({ registry, handles, unhandled }: RegistryCoverage): void => {
    const entries = javaRegistryEntries(registry);
    const handled = entries.filter((id) => handles(id));

    expect(handles(NOT_A_TYPE), `the ${registry} handler check accepts ${NOT_A_TYPE}`).toBe(false);
    expect({
        unreviewed: entries.filter((id) => !handles(id) && !unhandled.includes(id)),
        handledNow: unhandled.filter((id) => handles(id)),
        notInReport: unhandled.filter((id) => !entries.includes(id))
    }).toEqual({ unreviewed: [], handledNow: [], notInReport: [] });

    reportProgress(`${handled.length} of ${entries.length} ${registry} entries have a handler.`);
};
