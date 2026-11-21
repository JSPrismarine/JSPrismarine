import { readFileSync } from 'node:fs';
import path from 'node:path';

import { behaviorProgress } from '../../../../../packages/parity/src/dashboard/trackerProgress.ts';
import { loadProject } from '../../../project.mts';
import contributorList from '../../contributors.data.mts';
import { readTrackerIndex } from '../../parity.data.mts';
import { megaMenus } from '../menus.mts';
import type { CardContext } from './cardContent.ts';

/**
 * What the cards read from the repository: the project's facts, the error catalog, the parity score,
 * the contributor count and the staged pages.
 *
 * @param pages - Every page of the site, by source file, as VitePress lists them.
 */
export async function loadCardContext(srcDir: string, pages: readonly string[]): Promise<CardContext> {
    // The config bundler would follow this module's other loaders into the server's packages, which load
    // only under a TypeScript loader. Through a URL it cannot follow, Node loads the module as it is.
    const { errorCount, loadErrors }: typeof import('../../../code-data.mts') = await import(
        /* @vite-ignore */ new URL('../../../code-data.mts', import.meta.url).href
    );
    const errors = await loadErrors();
    const tracker = readTrackerIndex();
    // The same list the contributors page shows, which GitHub serves at build time.
    const { contributors } = await contributorList.load();
    return {
        project: loadProject(),
        menus: megaMenus,
        // A split domain's modules count too, under their page's path, such as `prismarine/world`.
        errorCounts: new Map(
            errors.flatMap((domain) => [
                [domain.domain, errorCount(domain)],
                ...domain.groups
                    .filter(({ module }) => module !== '')
                    .map(({ module, errors }): [string, number] => [`${domain.domain}/${module}`, errors.length])
            ])
        ),
        pages,
        parity: tracker ? behaviorProgress(tracker.families) : undefined,
        contributors: contributors.length || undefined,
        source: (relativePath) => readFileSync(path.join(srcDir, relativePath), 'utf8')
    };
}
