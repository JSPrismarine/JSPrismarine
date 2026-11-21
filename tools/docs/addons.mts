/**
 * JSPrismarine's own addons, read from `addons/`: the catalog `docs/addons/README.md` lists on
 * GitHub, and the reusable release workflow's inputs. The site's marketplace is `addonMarket.mts`.
 * Each addon goes through `readAddons` from `@jsprismarine/addon-tools`, the same check the build
 * runs, so the site lists exactly the addons and versions a release would publish.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parse } from 'yaml';

import type { Addon } from '../../packages/addon-tools/src/addon.ts';
import { readAddons } from '../../packages/addon-tools/src/build.ts';
import { isRecord } from '../../scripts/isRecord.mts';
import { repoRoot } from './project.mts';
import { addonReadmePath } from './sections.mts';

/** The folder of JSPrismarine's own addons. */
export const addonsDirectory = path.join(repoRoot, 'addons');

/** The reusable workflow that builds and publishes a repository's addons, relative to the repository. */
export const releaseWorkflow = '.github/workflows/addons-release.yml';

/** Every addon under `addons/`, checked as the build checks it, in name order. */
export const loadAddons = (): Promise<Addon[]> => readAddons(addonsDirectory);

/** An addon's README, as text. */
export const addonReadme = (addon: Addon): string => new TextDecoder().decode(addon.files.get('README.md'));

/** What a server owner types on the console to install an addon from JSPrismarine's own source. */
export const installCommand = (command: string, addon: Addon): string => `${command} install ${addon.name}`;

/** The facts a reader checks before installing: version, oldest server and license. */
const summaryTable = (addon: Addon) =>
    [
        '| Version | Runs on | License |',
        '| ------- | ------- | ------- |',
        `| \`${addon.version}\` | JSPrismarine \`${addon.minServer}\` or newer | ${addon.license} |`
    ].join('\n');

/**
 * The overview's list of addons, one section each with its description, version, oldest server,
 * license and install command. Links are relative to `docs/addons/README.md`, so they work on GitHub
 * and the docs build points them at each addon's page.
 *
 * @param command - The console command that installs addons.
 */
export function addonCatalog(addons: readonly Addon[], command: string): string {
    if (addons.length === 0) return '\nJSPrismarine has not published any addons yet.\n';
    const sections = addons.map((addon) =>
        [
            `### [${addon.title}](../../${addonReadmePath(addon.name)})`,
            addon.description,
            summaryTable(addon),
            `\`\`\`text\n${installCommand(command, addon)}\n\`\`\``
        ].join('\n\n')
    );
    return `\n${sections.join('\n\n')}\n`;
}

/** One input of a reusable workflow. */
export interface WorkflowInput {
    name: string;
    type: string;
    required: boolean;
    /** The default as the workflow writes it, or undefined when it has none. */
    default?: string;
    description: string;
}

/**
 * The inputs a reusable workflow's `workflow_call` declares, in the order it declares them.
 * @throws When the workflow takes no `workflow_call` inputs, or an input is not a mapping.
 */
export function workflowInputs(yamlText: string): WorkflowInput[] {
    const workflow: unknown = parse(yamlText);
    const on = isRecord(workflow) ? workflow.on : undefined;
    const call = isRecord(on) ? on.workflow_call : undefined;
    const inputs = isRecord(call) ? call.inputs : undefined;
    if (!isRecord(inputs)) throw new Error('The addons release workflow no longer declares workflow_call inputs.');
    return Object.entries(inputs).map(([name, input]) => {
        if (!isRecord(input)) throw new Error(`The addons release workflow's input ${name} is not a mapping.`);
        return {
            name,
            type: String(input.type ?? 'string'),
            required: input.required === true,
            ...(input.default === undefined ? {} : { default: String(input.default) }),
            description: String(input.description ?? '')
                .replace(/\s+/g, ' ')
                .trim()
        };
    });
}

/** The release workflow's inputs, read from the file in this repository. */
export const releaseWorkflowInputs = (): WorkflowInput[] =>
    workflowInputs(readFileSync(path.join(repoRoot, releaseWorkflow), 'utf8'));
