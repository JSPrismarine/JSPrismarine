import fetch, { Headers } from 'node-fetch';
import { machineIdSync } from 'node-machine-id';
import PluginFile from '../plugin/PluginFile';
import Server from '../Server';

export default class TelemetryManager {
    private readonly id = this.generateAnonomizedId();
    private readonly server: Server;
    private ticker: any;
    private readonly enabled: boolean;
    private readonly urls: string[];

    constructor(server: Server) {
        this.server = server;
        const { enabled, urls } = server.getConfig().getTelemetry();
        this.enabled = enabled;
        this.urls = urls;

        if (!this.enabled) return;

        process.on('uncaughtException', async (err) => {
            await this.sendCrashLog(err, urls);
            console.error(err);
            this.server.getLogger().error(`${err}`);
            process.exit(1);
        });
    }

    public async onEnable() {
        if (!this.enabled) return;

        this.server
            .getLogger()
            .info(
                'Thank you for helping us improve JSPrismarine by enabling anonymized telemetry data.'
            );
        this.server
            .getLogger()
            .info(
                "To find out exactly what we're collecting please visit the following url(s):"
            );
        this.urls.forEach((url) =>
            this.server.getLogger().info(`- ${url}/id/${this.id}`)
        );

        await this.tick();
        this.ticker = setInterval(this.tick, 5 * 60 * 1000);
    }

    public async onDisable() {
        clearInterval(this.ticker);
    }

    private async tick() {
        if (!this.server) return;

        const body = {
            id: this.id,
            version: `${this.server.getConfig().getVersion()}:${
                this.server.getQueryManager().git_rev
            }`,
            online_mode: this.server.getConfig().getOnlineMode(),
            player_count:
                this.server.getRaknet()?.getName().getOnlinePlayerCount() || 0,
            max_player_count: this.server.getConfig().getMaxPlayers(),
            plugins: this.server
                .getPluginManager()
                ?.getPlugins()
                .map((plugin: PluginFile) => ({
                    name: plugin.getName(),
                    version: plugin.getVersion()
                })),
            tps: this.server.getTPS(),
            uptime: Math.trunc(process.uptime() * 1000),
            node_env: process.env.NODE_ENV
        };

        await Promise.all(
            this.urls.map(async (url) => {
                try {
                    await fetch(`${url}/api/heartbeat`, {
                        method: 'POST',
                        body: JSON.stringify(body),
                        headers: new Headers({
                            'Content-Type': 'application/json'
                        })
                    });
                    this.server.getLogger().silly('[telemetry] Sent heartbeat');
                } catch (error) {
                    this.server
                        .getLogger()
                        .warn(`[telemetry] Failed to tick: ${url} (${error})`);
                }
            })
        );
    }

    public generateAnonomizedId(): string {
        return machineIdSync();
    }

    public async sendCrashLog(crashlog: Error, urls: string[]) {
        this.server
            .getLogger()
            .error(
                "JSPrismarine has crashed, we're now submitting the error to the telemetry service..."
            );
        const body = {
            id: this.generateAnonomizedId(),
            error: {
                name: crashlog.name,
                message: crashlog.message,
                stack: crashlog.stack
            }
        };

        const links = (
            await Promise.all(
                urls.map(async (url) => {
                    try {
                        const res = await fetch(`${url}/api/error`, {
                            method: 'POST',
                            body: JSON.stringify(body),
                            headers: new Headers({
                                'Content-Type': 'application/json'
                            })
                        });
                        return `${url}/error/${(await res.json()).id}`;
                    } catch {
                        return null;
                    }
                })
            )
        ).filter((a) => a);

        if (!links.length) {
            this.server
                .getLogger()
                .error('Failed to submit error to telemetry service!');
            return;
        }

        this.server
            .getLogger()
            .error(
                'JSPrismarine has crashed, please report the following url(s) to the maintainers:'
            );
        links.forEach((url) => this.server.getLogger().error(`- ${url}`));
    }
}
