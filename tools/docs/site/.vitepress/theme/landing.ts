import type { ProjectData } from '../../project.data.mts';
import type { Audience } from './components/AudienceTabs.vue';

/** Packages the landing page names, in order. Their descriptions and versions come from the repository. */
export const featuredPackages = [
    '@jsprismarine/protocol',
    '@jsprismarine/raknet',
    '@jsprismarine/nbt',
    '@jsprismarine/molang'
];

export const tickerItems = ['Play it', 'Host it', 'Build on it', 'Fix it'];

/** Fails the docs build when a package the page recommends is no longer published. */
function requirePackage(project: ProjectData, name: string) {
    if (!project.packages.some((published) => published.name === name)) {
        throw new Error(`The landing page names ${name}, which is not a published package.`);
    }
    return name;
}

/** One entry per audience the site serves; the brand page lists the same four. */
export function buildAudiences(project: ProjectData): Audience[] {
    const [molang, packs] = ['@jsprismarine/molang', '@jsprismarine/packs'].map((name) =>
        requirePackage(project, name)
    );
    return [
        {
            id: 'play',
            tab: 'I play',
            title: 'Join in a minute.',
            pitch: "Point Bedrock at a friend's server, or your own. No launcher, no account gymnastics.",
            code: `Add server\n  name   My world\n  host   play.example.com\n  port   ${project.defaultPort}`,
            links: [
                { text: 'Commands', hint: 'what you can type', href: '/data-driven/commands' },
                { text: 'Parity', hint: 'what matches vanilla', href: '/parity' },
                { text: 'Log levels', hint: 'quiet to silly', href: '/guide/log-levels' }
            ]
        },
        {
            id: 'host',
            tab: 'I host',
            title: 'One file. Any box.',
            pitch: 'Package the server as a single executable, or run it from source with a console that stays open across restarts.',
            code: `# Node ${project.engines.node}, pnpm ${project.engines.pnpm}\npnpm run package\n./dist/prismarine`,
            links: [
                { text: 'Running', hint: 'prerequisites and console', href: '/guide/running' },
                { text: 'Log levels', hint: 'what each level prints', href: '/guide/log-levels' },
                { text: 'Versioning', hint: 'how releases work', href: '/guide/versioning' }
            ]
        },
        {
            id: 'build',
            tab: 'I build add-ons',
            title: 'Data first. Code second.',
            pitch: 'Entities, blocks and commands come from data packs. Write code only for what data cannot say.',
            code: `pnpm add ${molang} ${packs}`,
            links: [
                { text: 'Using packs', hint: 'data-driven engine', href: '/data-driven/using-packs' },
                { text: 'Molang', hint: 'expressions', href: '/data-driven/molang' },
                { text: 'API reference', hint: `${project.packages.length} packages`, href: '/api/' }
            ]
        },
        {
            id: 'contribute',
            tab: 'I contribute',
            title: 'Break it, fix it, ship it.',
            pitch: 'One dev command, a parity suite that keeps the server honest, and tests next to the code.',
            code: `git clone ${project.repositoryUrl}.git\npnpm install\npnpm run dev`,
            links: [
                { text: 'Architecture', hint: 'how it fits', href: '/data-driven/architecture' },
                { text: 'Decisions', hint: 'ADRs', href: '/adr/' },
                { text: 'Contributors', hint: 'who writes the code', href: '/contributors' }
            ]
        }
    ];
}
