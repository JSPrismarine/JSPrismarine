import fetch from 'node-fetch';
import Config from '../config/Config';
import LoggerBuilder from '../utils/Logger';
import semver from 'semver';
import pkg from '../../package.json';

export default class Updater {
    private logger: LoggerBuilder;
    private config: Config;

    constructor({ config, logger }: { config: Config; logger: LoggerBuilder }) {
        this.config = config;
        this.logger = logger;
    }

    public check(): Promise<void> {
        return new Promise(async (resolve) => {
            let release: {
                html_url: string;
                tag_name: string;
            };

            if (this.config.getUpdateChannel() === 'release')
                release = await (
                    await fetch(
                        `https://api.github.com/repos/${this.config.getUpdateRepo()}/releases/latest`
                    )
                ).json();
            else
                release = (
                    await (
                        await fetch(
                            `https://api.github.com/repos/${this.config.getUpdateRepo()}/releases`
                        )
                    ).json()
                ).filter((a: any) => a.prerelease)[0];

            if (!release.tag_name) {
                this.logger.debug('Failed to check for updates!');
                return resolve();
            }

            if (semver.gt(release.tag_name, pkg.version)) {
                this.logger.info(
                    `§5There's a new version of JSPrismarine available, new version: §2${release.tag_name}`
                );
                this.logger.info(`§5Download: §e${release.html_url}`);
            }

            resolve();
        });
    }
}
