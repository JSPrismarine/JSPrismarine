/**
 * Refuses installs that did not come through pnpm.
 *
 * Runs as the root `preinstall` hook. Every package manager sets
 * `npm_config_user_agent` before running lifecycle scripts, so the first
 * token says which one is executing this script.
 */

const userAgent = process.env.npm_config_user_agent ?? '';
const manager = userAgent.split('/')[0] ?? '';

if (manager !== 'pnpm') {
    const message = [
        'This repository only supports pnpm.',
        `Detected ${manager || 'an unknown package manager'}; run "pnpm install" instead.`,
        'Use "pnpm dlx" or "pnpx" in place of "npx". Install pnpm from https://pnpm.io/installation.'
    ].join('\n');
    console.error(`\n${message}\n`);
    process.exit(1);
}
