import fetch from 'node-fetch';
import Config from '../config/Config';
import LoggerBuilder from '../utils/Logger';
import semver from 'semver';
import pkg from '../../package.json';

export default class Updater {
    private readonly logger: LoggerBuilder;
    private readonly config: Config;

    constructor({ config, logger }: { config: Config; logger: LoggerBuilder }) {
        this.config = config;
        this.logger = logger;
    }

    public async check(): Promise<void> {
        const release: {
            html_url: string;
            tag_name: string;
        } =
            this.config.getUpdateChannel() === 'release' &&
            !semver.prerelease(pkg.version)?.length
                ? await (
                      await fetch(
                          `https://api.github.com/repos/${this.config.getUpdateRepo()}/releases/latest`
                      )
                  ).json()
                : (
                      await (
                          await fetch(
                              `https://api.github.com/repos/${this.config.getUpdateRepo()}/releases`
                          )
                      ).json()
                  ).find?.((a: any) => a.prerelease);

        if (!release?.tag_name) {
            this.logger.debug('Failed to check for updates!');
            if ((release as any)?.message)
                this.logger.debug(`Error: ${(release as any).message}`);
            return;
        }

        if (semver.gt(release.tag_name, pkg.version)) {
            this.logger.info(
                `§5There's a new version of JSPrismarine available, new version: §2${release.tag_name}`
            );
            this.logger.info(`§5Download: §e${release.html_url}`);
        }
    }
}
