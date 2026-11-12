import type { ProjectData, PublishedPackage } from '../../project.data.mts';
import type { Audience } from './components/AudienceTabs.vue';

export const tickerItems = ['Play it', 'Host it', 'Build on it', 'Fix it'];

/**
 * Looks up packages the page names, in the order given. A package that is no longer published fails the
 * docs build instead of leaving a stale name on the page.
 */
export function requirePackages(project: ProjectData, names: readonly string[]): PublishedPackage[] {
    return names.map((name) => requirePackage(project, name));
}

/** Looks up one package the page names; see {@link requirePackages}. */
export function requirePackage(project: ProjectData, name: string): PublishedPackage {
    const found = project.packages.find((published) => published.name === name);
    if (!found) throw new Error(`The landing page names ${name}, which is not a published package.`);
    return found;
}

/** Packages the landing page features. Their descriptions and versions come from the repository. */
export const featuredPackageNames = [
    '@jsprismarine/protocol',
    '@jsprismarine/raknet',
    '@jsprismarine/nbt',
    '@jsprismarine/molang'
] as const;

/** The Minecraft releases the server accepts, oldest to newest, such as `1.26.50 to 1.26.60`. */
export function minecraftRange(project: ProjectData) {
    const versions = project.protocols.toReversed().flatMap(({ minecraft }) => minecraft);
    const [oldest, newest] = [versions[0], versions.at(-1)];
    return oldest === newest ? oldest : `${oldest} to ${newest}`;
}

const osNames = { linux: 'Linux', darwin: 'macOS', windows: 'Windows' } as const;

/** The operating systems the release builds cover, in release order, joined for prose: `Linux, macOS or Windows`. */
export function platformList(project: ProjectData, conjunction: 'or' | 'and' = 'or') {
    const names = [...new Set(project.executables.map(({ os }) => osNames[os]))];
    return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${conjunction} ${names.at(-1)}`;
}

/** The executable the landing page shows in commands: the first Linux build the release ships. */
export function exampleExecutable(project: ProjectData) {
    const executable = project.executables.find(({ os }) => os === 'linux');
    if (!executable)
        throw new Error('The release build no longer ships a Linux executable for the landing page to show.');
    return executable.file;
}

/** One entry per audience the site serves; the brand page lists the same four. */
export function buildAudiences(project: ProjectData): Audience[] {
    const [molang, packs] = requirePackages(project, ['@jsprismarine/molang', '@jsprismarine/packs']);
    const signIn = project.onlineMode
        ? 'Players sign in with their Xbox account, as on any vanilla server.'
        : 'Players join without signing in to Xbox Live.';
    return [
        {
            id: 'play',
            tab: 'I play',
            title: 'Join from the Servers tab.',
            gets: 'Join a server and see what works.',
            pitch: `Add a server's address and port in Minecraft ${minecraftRange(project)}. The demo server is open to try. ${signIn}`,
            code: `Servers → Add Server\n  Server Name     ${project.demo.name}\n  Server Address  ${project.demo.address}\n  Port            ${project.demo.port}`,
            links: [
                { text: 'Joining', hint: 'versions and fixes', href: '/guide/joining' },
                { text: 'Parity', hint: 'what matches vanilla', href: '/parity' },
                { text: 'Commands', hint: 'what you can type', href: '/data-driven/commands' }
            ]
        },
        {
            id: 'host',
            tab: 'I host',
            title: 'One file. Any box.',
            gets: 'Download it, run it, configure it.',
            pitch: `Download the prebuilt server for ${platformList(project)} and run it. Its runtime and data are inside, so there is no Node.js, pnpm or Java to install.`,
            code: `chmod +x ${exampleExecutable(project)}\n./${exampleExecutable(project)}`,
            copyable: true,
            links: [
                { text: 'Download', hint: `${project.executables.length} builds on GitHub`, href: project.releasesUrl },
                { text: 'Running', hint: 'first start and updates', href: '/guide/running#run-the-prebuilt-server' },
                { text: 'Settings', hint: 'every config.json key', href: '/guide/running#every-setting' }
            ]
        },
        {
            id: 'build',
            tab: 'I build add-ons',
            title: 'Data first. Code second.',
            gets: 'Packs, Molang and the package API.',
            pitch: 'Entities, blocks and commands come from packs. Write code only for what data cannot say. Run your work with pnpm run dev, which restarts the server when your code or pack data changes.',
            code: `# in a JSPrismarine checkout\npnpm install\npnpm run dev\n\n# or take the pieces into your own project\npnpm add ${molang.name} ${packs.name}`,
            copyable: true,
            links: [
                { text: 'Extending', hint: 'packs and embedding', href: '/guide/extending' },
                { text: 'Packages', hint: `${project.packages.length} on npm`, href: '/packages' },
                { text: 'API reference', hint: 'generated from source', href: '/api/' }
            ]
        },
        {
            id: 'contribute',
            tab: 'I contribute',
            title: 'Break it, fix it, ship it.',
            gets: 'Clone it, test it, send a change.',
            pitch: 'One dev command, a parity suite that keeps the server honest, and tests next to the code.',
            code: `git clone ${project.repositoryUrl}.git\ncd JSPrismarine\npnpm install\npnpm run dev`,
            copyable: true,
            links: [
                { text: 'Contributing', hint: 'issues and pull requests', href: '/contributing' },
                { text: 'Architecture', hint: 'how it fits', href: '/data-driven/architecture' },
                { text: 'Decisions', hint: 'ADRs', href: '/adr/' }
            ]
        }
    ];
}
