/**
 * The Java-to-Bedrock totality check, run once per content build.
 *
 * Plan section 5 asks the loader to refuse to start when a Java identifier
 * in a loaded pack has no mapping and no allow-list entry, which is the rule
 * that lets `@jsprismarine/mapping` promise totality rather than hope for
 * it. This module is where that rule runs: it walks every reference the
 * loaded pack stack makes, resolves each one through the mapping tables, and
 * turns what is left into the report, or into the refusal.
 */
import type { Diagnostic } from '@jsprismarine/content';
import { createPackIdentifierResolver } from '@jsprismarine/mapping';
import { reportIdentifiers } from '@jsprismarine/packs';
import type { Definitions, IdentifierResolver, ReferencedIdentifier } from '@jsprismarine/packs';

/**
 * Thrown by a strict content build when the pack stack references a Java
 * identifier nothing accounts for.
 *
 * The identifiers are the whole finding, not a sample: a build that stops
 * for one of them should say which ones, so the report and the exception
 * carry the same list.
 */
export class UnmappedIdentifierError extends Error {
    public override name = 'UnmappedIdentifierError';

    /**
     * @param unmapped - Every reference that resolved to neither a Bedrock identifier nor a reviewed loss.
     */
    public constructor(public readonly unmapped: readonly ReferencedIdentifier[]) {
        const first = unmapped[0];
        super(
            `the pack stack references ${unmapped.length} Java identifier(s) with no Bedrock mapping and no reviewed loss entry` +
                (first ? `, first: ${first.id} (${first.registry}) in pack "${first.pack}" at ${first.path}` : '')
        );
    }
}

/** What {@link checkIdentifiers} needs. */
export interface IdentifierCheckOptions {
    /** Throw instead of reporting. */
    readonly strict?: boolean;
    /** Replaces the mapping tables, which is how a test drives the check without them. */
    readonly resolver?: IdentifierResolver;
}

/**
 * Resolves every Java identifier the loaded pack stack references and
 * reports the ones nothing accounts for.
 *
 * Non-strict is a report rather than a refusal, for the same reason the
 * content build reports the defaults it had to invent instead of stopping:
 * a server that would otherwise run should run, and the operator should be
 * told exactly what will be missing. Each unaccounted identifier is one
 * error-severity diagnostic naming the pack and the file, so the startup
 * line that counts content errors counts these too. Strict turns the same
 * list into {@link UnmappedIdentifierError}.
 *
 * A reviewed loss is not reported. It is already written down, with a
 * reason and a reference, in `@jsprismarine/mapping`'s loss list, and the
 * parity dashboard counts it from there.
 *
 * @param definitions - The composed pack stack.
 * @param options - Whether to refuse, and which resolver to resolve through.
 * @returns {Diagnostic[]} One diagnostic per unaccounted identifier, empty when the stack is total.
 * @throws {UnmappedIdentifierError} In strict mode, when one identifier is unaccounted for.
 */
export const checkIdentifiers = (definitions: Definitions, options: IdentifierCheckOptions = {}): Diagnostic[] => {
    const resolver = options.resolver ?? createPackIdentifierResolver();
    const unmapped = reportIdentifiers(definitions, resolver).filter((entry) => entry.resolution === 'unknown');
    if (unmapped.length === 0) return [];
    if (options.strict) throw new UnmappedIdentifierError(unmapped);

    return unmapped.map((entry) => ({
        severity: 'error',
        code: 'identifier.unmapped',
        pack: entry.pack,
        path: entry.path,
        message:
            `${entry.id} is a Java ${entry.registry} identifier with no Bedrock mapping and no reviewed loss entry; ` +
            `${entry.references} reference(s) to it will not reach a client`
    }));
};
