/**
 * Markdown copies of the pages the site writes with Vue components, for language models and the tools
 * built on them (see `llms.mts`). Each is written from the data the page's component renders, so it
 * lists what the page shows. Links are site-absolute, as in a staged page, and `pageMarkdown` makes
 * them absolute when the copy is written.
 */

import { type ChangelogRelease, type ChangeKind, SHOWN_RELEASES } from './changelog.mts';
import type { ProjectData } from './project.mts';
import { requirePackage } from './site/.vitepress/theme/landing.ts';
import { groupPackages } from './site/.vitepress/theme/packageAreas.ts';

/** The Packages page: each published package by its area, with its version, API reference and npm page. */
export function packagesMarkdown(project: ProjectData) {
    // The package the Packages page shows `pnpm add` with.
    const example = requirePackage(project, '@jsprismarine/nbt').name;
    const areas = groupPackages(project.packages).map(({ title, description, packages }) =>
        [
            `## ${title}`,
            description,
            packages
                .map(
                    ({ name, version, description }) =>
                        `- [\`${name}\`](/api/${name}/) ${version}: ${description.replace(/\.$/, '')}. [npm](https://www.npmjs.com/package/${name})`
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
        const updates =
            dependencyUpdates > 0
                ? [`${dependencyUpdates} dependency update${dependencyUpdates === 1 ? '' : 's'}.`]
                : [];
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
