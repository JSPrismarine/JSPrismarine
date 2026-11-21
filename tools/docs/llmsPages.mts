/**
 * Markdown copies of the pages the site writes with Vue components, for language models and the tools
 * built on them (see `llms.mts`). Each is written from the data the page's component renders, so it
 * lists what the page shows. Links are site-absolute, as in a staged page, and `pageMarkdown` makes
 * them absolute when the copy is written.
 */

import { type TrackerSummary } from '../../packages/parity/src/dashboard/trackerSummary.ts';
import {
    behaviorProgress,
    type TrackerProgressCounts,
    trackerPrimaryProgressPercent,
    trackerProgressTotal
} from '../../packages/parity/src/dashboard/trackerProgress.ts';
import { METRICS } from '../server-benchmark/src/summary.mts';
import { type ChangelogRelease, type ChangeKind, SHOWN_RELEASES } from './changelog.mts';
import type { ProjectData } from './project.mts';
import type { BenchmarkPageData } from './site/benchmarks.data.mts';
import { GAPS_PER_FAMILY } from './site/parity.data.mts';
import {
    installCommand,
    type Market,
    type MarketAddon,
    type MarketAddonPage,
    releaseLabel,
    tagLabel
} from './site/.vitepress/theme/addonMarket.ts';
import { requirePackage } from './site/.vitepress/theme/landing.ts';
import { groupPackages } from './site/.vitepress/theme/packageAreas.ts';
import { plural } from './site/.vitepress/theme/plural.ts';

/** The Packages page: each published package by its area, with its version, its reference and npm page. */
export function packagesMarkdown(project: ProjectData) {
    // The package the Packages page shows `pnpm add` with.
    const example = requirePackage(project, '@jsprismarine/nbt').name;
    const areas = groupPackages(project.packages).map(({ title, description, packages }) =>
        [
            `## ${title}`,
            description,
            packages
                .map(
                    ({ name, version, description, reference }) =>
                        `- [\`${name}\`](${reference}) ${version}: ${description.replace(/\.$/, '')}. [npm](https://www.npmjs.com/package/${name})`
                )
                .join('\n')
        ].join('\n\n')
    );
    return [
        '# Packages',
        `JSPrismarine publishes the server as ${project.packages.length} packages on npm. Each has an API reference, a README and its npm page. Install one with \`pnpm add\`, for example \`pnpm add ${example}\`.`,
        ...areas
    ]
        .join('\n\n')
        .concat('\n');
}

const kindTitles: Record<ChangeKind, string> = {
    major: 'Major changes',
    minor: 'Minor changes',
    patch: 'Patch changes'
};

/** The Releases page: the newest releases' changes from the server's changelog, by the level of each change. */
export function releasesMarkdown(
    releases: readonly ChangelogRelease[],
    { dateOf, changelogUrl }: { dateOf: (version: string) => string | undefined; changelogUrl: string }
) {
    const shown = releases.slice(0, SHOWN_RELEASES).map(({ version, changes, dependencyUpdates }) => {
        const date = dateOf(version);
        const groups = (['major', 'minor', 'patch'] as const).flatMap((kind) => {
            const ofKind = changes.filter((change) => change.kind === kind);
            if (ofKind.length === 0) return [];
            const items = ofKind.map(({ description, pullRequest }) => {
                const pull = pullRequest ? ` ([#${pullRequest.number}](${pullRequest.url}))` : '';
                // A description runs over several lines and paragraphs; indenting them keeps them in its item.
                return `- ${description.trim().replace(/\n(?=.)/g, '\n  ')}${pull}`;
            });
            return [`### ${kindTitles[kind]}\n\n${items.join('\n')}`];
        });
        const updates = dependencyUpdates > 0 ? [`${plural(dependencyUpdates, 'dependency update')}.`] : [];
        return [`## ${version}`, ...(date ? [`Released ${date}.`] : []), ...groups, ...updates].join('\n\n');
    });
    return [
        '# Releases',
        `Every server package ships at the same version, so one set of notes covers the server and its packages. These notes come from the server's changelog. The newest ${shown.length} of ${releases.length} releases are below; the [full changelog](${changelogUrl}) has the rest.`,
        ...shown
    ]
        .join('\n\n')
        .concat('\n');
}

/**
 * Where `assemble.mts` writes the addon pages' Markdown copies, by page file, under `site/`: the
 * staging step builds the marketplace, and `buildEnd` publishes the copies.
 */
export const ADDON_COPIES_FILE = 'addons/markdown-copies.json';

/** An addon's page: its install command, what it runs on, who publishes it, and its README. */
export function addonMarkdown(addon: MarketAddonPage, readme: string | undefined) {
    const released = releaseLabel(addon.versions.find(({ version }) => version === addon.version));
    const deprecation = addon.deprecated && [
        `**Deprecated.** ${addon.deprecated.reason}`,
        addon.deprecated.replacedByPath
            ? ` [${addon.deprecated.replacedByTitle ?? addon.deprecated.replacedBy}](${addon.deprecated.replacedByPath}) replaces it.`
            : addon.deprecated.replacedBy
              ? ` \`${installCommand(addon.deprecated.replacedBy)}\` installs its replacement.`
              : ''
    ];
    const facts = [
        `Install it from the server console with \`${installCommand(addon.id)}\`.`,
        `- Version: ${addon.version}, released ${released}`,
        `- Runs on: JSPrismarine ${addon.minServer} or newer${addon.needsNewerServer ? ', not released yet' : ''}`,
        `- Published by: ${addon.firstParty ? 'JSPrismarine' : addon.repository} ([source](${addon.sourceUrl}), [issues](${addon.issuesUrl}))`,
        ...(addon.authors.length ? [`- Written by: ${addon.authors.join(', ')}`] : []),
        ...(addon.license ? [`- License: ${addon.license}`] : []),
        ...(addon.tags.length ? [`- Tags: ${addon.tags.map(tagLabel).join(', ')}`] : []),
        `- Pack SHA-256: \`${addon.sha256}\``
    ];
    return [
        `# ${addon.title}`,
        addon.description,
        ...(deprecation ? [deprecation.join('')] : []),
        facts[0],
        facts.slice(1).join('\n'),
        ...(addon.firstParty
            ? []
            : [
                  `This addon comes from ${addon.repository}. JSPrismarine lists it without reviewing it: it checks that the download matches the hash the addon's index lists, not what its scripts do.`
              ]),
        // The README is the addon author's text, so the copy says whose it is.
        ...(readme ? [`## README\n\nFrom the addon's README.md, version ${addon.version}.`, readme.trim()] : [])
    ]
        .join('\n\n')
        .concat('\n');
}

/** The marketplace: each addon with its install command, JSPrismarine's first, as its cards list them. */
export function marketMarkdown(market: Market, description: string) {
    const entry = (addon: MarketAddon) =>
        `- [${addon.title}](${addon.path}) ${addon.version}${addon.deprecated ? ' (deprecated)' : ''}: ${addon.description.replace(/\.$/, '')}. \`${installCommand(addon.id)}\``;
    const firstParty = market.addons.filter(({ firstParty }) => firstParty);
    const community = market.addons.filter(({ firstParty }) => !firstParty);
    return [
        '# Addons',
        `${description} The marketplace lists ${plural(market.addons.length, 'addon')} from ${plural(market.repositories, 'repository', 'repositories')}.`,
        ...(firstParty.length ? [`## JSPrismarine's addons\n\n${firstParty.map(entry).join('\n')}`] : []),
        ...(community.length
            ? [
                  `## Community addons\n\nListed, not reviewed: JSPrismarine checks that each download matches its hash, not what its scripts do.\n\n${community.map(entry).join('\n')}`
              ]
            : [])
    ]
        .join('\n\n')
        .concat('\n');
}

/** A family's or a group's pass rate, as the tracker shows it: passed of measured checks plus open work. */
const progress = (passed: number, counts: TrackerProgressCounts) =>
    `${trackerPrimaryProgressPercent(passed, trackerProgressTotal(counts))}% (${passed} of ${trackerProgressTotal(counts)})`;

/**
 * The parity tracker: the behavior score, every family's counts and each family's first open gaps,
 * from the summary the page renders. The page itself loads every case; the copy keeps the summary.
 */
export function parityMarkdown(summary: TrackerSummary, { description }: { description: string }) {
    const behavior = behaviorProgress(summary.families);
    const families = summary.families.map(
        (family) =>
            `| \`${family.id}\` | ${family.group} | ${progress(family.passed, family)} | ${family.failed} | ${family.deferred} | ${family.defects} | ${family.notMeasured} | ${family.intentional} |`
    );
    const gaps = summary.families
        .filter(({ openGaps }) => openGaps.length > 0)
        .map(({ id, openGaps }) =>
            [
                `### \`${id}\``,
                openGaps
                    .map(
                        (gap) =>
                            `- \`${gap.title}\` (${gap.status})${gap.details ? `: ${gap.details.replace(/\s+/g, ' ').trim()}` : ''}`
                    )
                    .join('\n')
            ].join('\n\n')
        );
    return [
        '# Parity tracker',
        description,
        `From the parity suite's run of ${summary.generatedAt.slice(0, 10)}, at commit \`${summary.sourceCommit.slice(0, 11)}\`.`,
        [
            `- Behavior: ${trackerPrimaryProgressPercent(behavior.passed, behavior.tracked)}% of the comparisons of what the server does in play pass (${behavior.passed} of ${behavior.tracked}).`,
            `- Every comparison: ${progress(summary.passed, summary)}, data tables included.`,
            `- ${summary.failed} failing, ${summary.deferred} deferred, ${summary.defects} known defects, ${summary.notMeasured} not measured and ${summary.intentional} intentional differences.`
        ].join('\n'),
        '## Families',
        [
            '| Family | Group | Passing | Failing | Deferred | Defects | Not measured | Intentional |',
            '| --- | --- | --- | --- | --- | --- | --- | --- |',
            ...families
        ].join('\n'),
        ...(gaps.length
            ? [
                  `## Open gaps\n\nEach family's first ${GAPS_PER_FAMILY} open gaps: failing checks, then known defects, then deferred work. The [tracker](/parity) lists them all.`,
                  ...gaps
              ]
            : [])
    ]
        .join('\n\n')
        .concat('\n');
}

/** A benchmark figure as the copy prints it: four significant digits, or a dash for none. */
const figure = (value: number | null) => (value === null ? '–' : String(Number(value.toPrecision(4))));

/**
 * The benchmark page: the newest run's median for every figure, server by server and scenario by
 * scenario, with whether the run was quiet and where its raw data is.
 */
export function benchmarksMarkdown(
    { file, results, summary }: BenchmarkPageData,
    { description, repositoryUrl }: { description: string; repositoryUrl: string }
) {
    const scenarios = results.scenarios.map((scenario) => {
        const cells = summary.cells.filter((cell) => cell.scenario === scenario.id);
        const servers = cells.map(({ server }) => {
            const described = results.servers[server];
            return described ? `${described.name} ${described.version}` : server;
        });
        const rows = METRICS.map(
            ({ id, kind, better }) =>
                `| \`${id}\` | ${kind}${kind === 'wall' ? ', indicative' : ''} | ${better} | ${cells.map((cell) => figure(cell.metrics[id].median)).join(' | ')} |`
        );
        return [
            `## \`${scenario.id}\``,
            `${scenario.bots} bots, view distance ${scenario.viewDistance}, ${scenario.steps} travel steps of ${scenario.stepBlocks} blocks. Medians of each server's finished runs.`,
            [
                `| Figure | Kind | Better | ${servers.join(' | ')} |`,
                `| --- | --- | --- | ${servers.map(() => '---').join(' | ')} |`,
                ...rows
            ].join('\n')
        ].join('\n\n');
    });
    return [
        '# Benchmarks',
        description,
        `The newest run, from ${results.startedAt.slice(0, 10)}: ${summary.quietRounds} of ${summary.rounds} rounds stayed at or under a one minute load of ${results.quietLoadLimit}, so the run is ${summary.quiet ? 'quiet' : 'indicative'}. Wall clock figures move with everything else on the machine and are indicative either way. Its raw data is [\`${file}\`](${repositoryUrl}/blob/master/${file}).`,
        ...scenarios
    ]
        .join('\n\n')
        .concat('\n');
}
