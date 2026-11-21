import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Writes the release pull request's body from the release plan `changeset status --output` saves,
// in place of the one changesets/action writes. That one lists every package's changelog, which
// for a release of every package runs past GitHub's size limit, and then it lists nothing but
// headings. This one leads with the breaking changes, gives every other change one line under the
// package it is mostly about, and folds the full text away. A package released only because a
// dependency moved gets no line: the fixed version group moves them all together.
//
//     node .github/scripts/release-pr-body.mjs <release-plan.json>
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
// GitHub refuses a pull request body longer than this.
const BODY_LIMIT = 65_536;
const SCOPE = '@jsprismarine/';

const planFile = process.argv[2];
if (!planFile) throw new Error('Pass the release plan that `changeset status --output` wrote');
// Parsed JSON from @changesets/cli: the fields read below are the ones its status output documents.
const plan = JSON.parse(readFileSync(planFile, 'utf8'));

// Changesets releases private packages too; only public ones reach npm.
const privatePackages = new Set(
    execFileSync('git', ['ls-files', '--', 'packages/**/package.json', 'tools/*/package.json'], {
        cwd: repositoryRoot,
        encoding: 'utf8'
    })
        .split('\n')
        .filter(Boolean)
        .map((manifest) => JSON.parse(readFileSync(new URL(manifest, `file://${repositoryRoot}`), 'utf8')))
        .filter((pkg) => pkg.private)
        .map((pkg) => pkg.name)
);

const shortName = (name) => (name.startsWith(SCOPE) ? name.slice(SCOPE.length) : name);
const oldVersions = new Map(plan.releases.map((release) => [release.name, release.oldVersion]));

/**
 * Whether a bump breaks a package's API. Below 1.0.0 a minor bump is the breaking one
 * (docs/guide/versioning.md).
 */
const isBreaking = ({ name, type }) =>
    type === 'major' || (type === 'minor' && (oldVersions.get(name) ?? '0').startsWith('0.'));

/** The first sentence of a summary's first paragraph, where its point is. */
const firstSentence = (summary) => {
    const paragraph = summary
        .trim()
        .split(/\n\s*\n/)[0]
        .replace(/\s+/g, ' ');
    return /^.+?[.!?](?=\s|$)/.exec(paragraph)?.[0] ?? paragraph;
};

/** The package a changeset is mostly about: the first it names, other than the errors catalog. */
const primaryOf = (changeset) =>
    (changeset.releases.find(({ name }) => name !== `${SCOPE}errors`) ?? changeset.releases[0]).name;

const packagesOf = (changeset) => changeset.releases.map(({ name }) => `\`${shortName(name)}\``).join(', ');

const changesets = plan.changesets.filter((changeset) => changeset.releases.length > 0);
const breaking = changesets.filter((changeset) => changeset.releases.some(isBreaking));
const byPackage = new Map();
for (const changeset of changesets.filter((changeset) => !breaking.includes(changeset))) {
    const name = primaryOf(changeset);
    byPackage.set(name, [...(byPackage.get(name) ?? []), changeset]);
}

const published = plan.releases.filter((release) => !privatePackages.has(release.name));
const versionCounts = new Map();
for (const { newVersion } of published) versionCounts.set(newVersion, (versionCounts.get(newVersion) ?? 0) + 1);
const [version] = [...versionCounts].sort((a, b) => b[1] - a[1])[0] ?? ['?'];
const others = published.filter((release) => release.newVersion !== version);
const otherVersions = others.length
    ? ` (${others.map((release) => `\`${shortName(release.name)}\` ${release.newVersion}`).join(', ')})`
    : '';
const touched = new Set(changesets.flatMap((changeset) => changeset.releases.map(({ name }) => name)));

const head = [
    `# JSPrismarine ${version}`,
    '',
    `${changesets.length} changes across ${touched.size} packages. Merging publishes ${published.length} packages to npm at **${version}**${otherVersions}, then builds the executables. Each package's \`CHANGELOG.md\` in this diff holds its full entries.`
];

const breakingSection = breaking.length
    ? [
          '',
          `## ⚠️ Breaking changes (${breaking.length})`,
          '',
          // In full: a breaking change's whole text is what an upgrade needs.
          ...breaking.map(
              (changeset) => `- **${packagesOf(changeset)}** · ${changeset.summary.trim().replace(/\n/g, '\n  ')}`
          )
      ]
    : [];

const changesSection = [
    '',
    '## Changes',
    ...[...byPackage]
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
        .flatMap(([name, entries]) => [
            '',
            `### ${shortName(name)} (${entries.length})`,
            '',
            ...entries.map((changeset) => {
                const also = changeset.releases.map(({ name: other }) => other).filter((other) => other !== name);
                const suffix = also.length
                    ? ` _(also ${also.map((other) => `\`${shortName(other)}\``).join(', ')})_`
                    : '';
                return `- ${firstSentence(changeset.summary)}${suffix}`;
            })
        ])
];

const fullChangelog = [
    '',
    `<details><summary>Full changelog (${changesets.length})</summary>`,
    '',
    ...changesets.flatMap((changeset) => [`#### ${packagesOf(changeset)}`, '', changeset.summary.trim(), '']),
    '</details>'
];

const sections = [head, breakingSection, changesSection];
let body = [...sections, fullChangelog].flat().join('\n');
// The full text goes first when the body is too long, then the one-line list; the breaking changes stay.
if (body.length > BODY_LIMIT) {
    body = [...sections, ['', '_The full changelog is left out: it runs past GitHub’s size limit._']].flat().join('\n');
}
if (body.length > BODY_LIMIT) {
    body = [head, breakingSection, ['', '_The list of changes is left out: it runs past GitHub’s size limit._']]
        .flat()
        .join('\n');
}
console.log(body);
