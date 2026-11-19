import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

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
 * The release a reports directory belongs to, from the cache layout `datagen:java` writes:
 * `java-reports/<release>/generated`. Undefined for a directory outside that layout.
 */
const reportsRelease = (root: string): string | undefined =>
    basename(root) === 'generated' ? basename(dirname(root)) : undefined;

/**
 * The data pack format major of the release the reports belong to, read from the
 * `version.json` that `datagen:java` writes beside the vanilla datapack `JSP_VANILLA_DATAPACK`
 * points at. Undefined only when the reports are absent too, so the suites are skipped.
 *
 * The suites run on `JSP_JAVA_REPORTS` alone, but the grammar comes from the datapack, so a
 * datapack that is missing or belongs to another release would gate the reports by the wrong
 * grammar. Both cases throw before any suite runs instead. `scripts/real-data-env.mts` sets the
 * two variables from one release.
 */
export const javaReportFormat: number | undefined = ((): number | undefined => {
    if (registriesPath === undefined) return undefined;
    const datapack = process.env.JSP_VANILLA_DATAPACK;
    const path = datapack === undefined || datapack === '' ? undefined : join(datapack, 'version.json');
    if (path === undefined || !existsSync(path)) {
        throw new TypeError(
            'JSP_JAVA_REPORTS is set, but JSP_VANILLA_DATAPACK does not point at a generated datapack with ' +
                'a version.json; point it at the same release so the reports are read with its grammar'
        );
    }
    // Written by `datagen:java`; only the release and the format are read.
    const record = JSON.parse(readFileSync(path, 'utf8')) as {
        release: string;
        dataPackFormat: readonly [number, number];
    };
    const reports = reportsRelease(process.env.JSP_JAVA_REPORTS ?? '');
    if (reports !== undefined && reports !== record.release) {
        throw new TypeError(
            `JSP_JAVA_REPORTS holds Java ${reports} reports, but JSP_VANILLA_DATAPACK is the Java ` +
                `${record.release} datapack; point both at the same release`
        );
    }
    return record.dataPackFormat[0];
})();

/** Whether the reports' release reads a grammar that changed at data pack format `since`. */
export const javaReportsSince = (since: number): boolean => (javaReportFormat ?? 0) >= since;

/** 26.4 (format 128) renamed the `minecraft:rule_test` registry to `minecraft:rule_test_type`. */
export const SINCE_RULE_TEST_TYPE_REGISTRY = 128;

/**
 * Registries the report names differently from a release on, each with the format the new name
 * starts at. A suite names the registry by its oldest id, and {@link javaRegistryEntries} reads
 * the name the reports' release uses.
 */
const REGISTRY_RENAMES: ReadonlyMap<string, { readonly id: string; readonly since: number }> = new Map([
    ['minecraft:rule_test', { id: 'minecraft:rule_test_type', since: SINCE_RULE_TEST_TYPE_REGISTRY }]
]);

/**
 * Lists the entries of one registry in the pinned Java registry report.
 *
 * @param registry - The registry's id, such as `minecraft:worldgen/feature_type`. A registry a
 *   later release renamed is named by its old id and read under the reports' release's name.
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
    const rename = REGISTRY_RENAMES.get(registry);
    const name = rename !== undefined && javaReportsSince(rename.since) ? rename.id : registry;
    const entries = registries[name]?.entries;
    if (entries === undefined) throw new TypeError(`the Java registry report has no ${name}`);
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

/**
 * A reviewed unhandled entry: a full id, or an id with the data pack format its type first
 * appears at, for a type only a newer release than the default registers.
 */
export type UnhandledEntry = string | { readonly id: string; readonly since: number };

/** One registry checked against a package's handlers. */
export interface RegistryCoverage {
    /** The registry's id in the report, such as `minecraft:worldgen/feature_type`. */
    readonly registry: string;
    /** Whether the package handles an entry id. */
    readonly handles: (id: string) => boolean;
    /** The reviewed entry ids the package does not handle yet. */
    readonly unhandled: readonly UnhandledEntry[];
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
export const expectRegistryCovered = ({ registry, handles, unhandled: reviewed }: RegistryCoverage): void => {
    const entries = javaRegistryEntries(registry);
    // An entry for a type a newer release added is not expected in an older release's report.
    const unhandled = reviewed.flatMap((entry) =>
        typeof entry === 'string' ? [entry] : javaReportsSince(entry.since) ? [entry.id] : []
    );
    const handled = entries.filter((id) => handles(id));

    expect(handles(NOT_A_TYPE), `the ${registry} handler check accepts ${NOT_A_TYPE}`).toBe(false);
    expect({
        unreviewed: entries.filter((id) => !handles(id) && !unhandled.includes(id)),
        handledNow: unhandled.filter((id) => handles(id)),
        notInReport: unhandled.filter((id) => !entries.includes(id))
    }).toEqual({ unreviewed: [], handledNow: [], notInReport: [] });

    reportProgress(`${handled.length} of ${entries.length} ${registry} entries have a handler.`);
};
