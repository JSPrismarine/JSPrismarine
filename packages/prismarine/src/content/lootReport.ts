/**
 * What the two loot registries compiled, as the line an operator reads at
 * startup.
 *
 * The content build already states what it had to invent for a client; this
 * states what it could not read in a loot table. The two registries are
 * compiled whole during the build, so by the time this runs every gap is
 * known: without that, a loot gap surfaces at whichever chest first hits it,
 * which is no time at all to be reading a report.
 */
import type { Diagnostic } from '@jsprismarine/content';

import type { ServerContent } from './ServerContent';

/** What the loot half of a content build came to. */
export interface LootBuildReport {
    /** Java loot tables registered, which is 1447 for the vanilla datapack. */
    readonly javaTables: number;
    /** Bedrock loot tables registered, which is 309 for the shipped behavior pack. */
    readonly bedrockTables: number;
    /** Reference cycles across both registries. */
    readonly cycles: number;
    /** Tables carrying grammar nobody has reviewed. A strict build never gets this far. */
    readonly unreviewed: number;
    /**
     * Reviewed gaps: a condition that closes its gate and a function that goes
     * unapplied, each already named in the content report.
     */
    readonly reviewed: number;
}

/** Counts what both loot registries reported during the content build. */
export const lootBuildReport = (content: ServerContent): LootBuildReport => {
    const loot = content.diagnostics.filter((entry: Diagnostic) => entry.code.startsWith('loot.'));

    return {
        javaTables: content.loot.ids.length,
        bedrockTables: content.equipmentLoot.ids.length,
        cycles: content.loot.cycles.length + content.equipmentLoot.cycles.length,
        unreviewed: loot.filter((entry) => entry.severity === 'error').length,
        reviewed: loot.filter((entry) => entry.severity === 'warning').length
    };
};

/** The startup line: what compiled. */
export const lootSummary = (report: LootBuildReport): string =>
    `Compiled §e${report.javaTables}§r java loot tables and §e${report.bedrockTables}§r bedrock ones`;

/**
 * What the loot build could not read, or undefined when it read everything.
 *
 * Each clause is left out when its count is zero, the way
 * {@link import('../network/contentPayloads').contentPayloadWarning} does it,
 * so anything printed is worth reading. A stock vanilla stack prints the
 * reviewed clause and nothing else.
 */
export const lootWarning = (report: LootBuildReport): string | undefined => {
    const clauses = [
        [report.unreviewed, 'carry §c%§r members nobody has reviewed'],
        [report.cycles, 'hold §c%§r reference cycles'],
        [report.reviewed, 'leave §e%§r reviewed gaps unapplied']
    ] as const;

    const said = clauses.filter(([count]) => count > 0).map(([count, text]) => text.replace('%', String(count)));

    return said.length === 0 ? undefined : `The loot tables ${said.join(', ')}; see the content report`;
};
