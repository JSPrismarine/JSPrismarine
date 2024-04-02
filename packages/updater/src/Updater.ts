import type { Config, Logger } from '@jsprismarine/prismarine';

import fetch from 'node-fetch';
import semver from 'semver';

export default class Updater {
    private readonly logger: Logger;
    private readonly config: Config;
    private readonly version: string;

    public constructor({ config, logger, version }: { config: Config; logger: Logger; version: string }) {
        this.config = config;
        this.logger = logger;
        this.version = version;
    }

    public async check(): Promise<void> {
        // Don't check for updates in development to avoid rate-limiting
        if (process.env.NODE_ENV === 'development') return;

        const release: {
            html_url: string;
            tag_name: string;
        } = (await (
            await fetch(`https://api.github.com/repos/${this.config.getUpdateRepo()}/releases/latest`)
        ).json()) as any;

        if (!release.tag_name) {
            this.logger.debug('Failed to check for updates!', 'Updater/check');
            if ((release as any).message) this.logger.debug(`Error: ${(release as any).message}`, 'Updater/check');
            return;
        }

        try {
            if (semver.gt(release.tag_name.split('@').at(-1) as string, this.version)) {
                this.logger.info(
                    `§5There's a new version of JSPrismarine available, new version: §2${release.tag_name}`,
                    'Updater/check'
                );
                this.logger.info(`§5Download: §e${release.html_url}`, 'Updater/check');
                return;
            }

            this.logger.debug('No new version of JSPrismarine available', 'Updater/check');
        } catch (error: unknown) {
            this.logger.error(error, 'Updater/check');
        }
    }
}
