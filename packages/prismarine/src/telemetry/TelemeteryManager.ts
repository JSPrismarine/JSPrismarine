import exitHook from 'async-exit-hook';
import type PluginFile from '../plugin/PluginFile.js';
import type Server from '../Server.js';
import fetch, { Headers } from 'node-fetch';
import pkg from 'node-machine-id';
const { machineId } = pkg;

export default class TelemetryManager {
    private readonly id = this.generateAnonomizedId();
    private readonly server: Server;
    private ticker: any;
    private readonly enabled: boolean;
    private readonly urls: string[];

    public constructor(server: Server) {
        this.server = server;
        const { enabled, urls } = server.getConfig().getTelemetry();
        this.enabled = enabled;
        this.urls = urls;

        if (!this.enabled) return;

        exitHook.uncaughtExceptionHandler(this.handleCrash);
        exitHook.unhandledRejectionHandler(this.handleCrash);
    }

    private async handleCrash(error: Error): Promise<void> {
        console.log((<Error>error).stack);
        await this.sendCrashLog(error, this.urls);
        this.server.getLogger()?.error((<Error>error).message, 'TelemetryManager');
        await this.server.shutdown({
            crash: true
        });
    }

    public async onEnable() {
        if (!this.enabled) return;

        this.server
            .getLogger()
            ?.info(
                'Thank you for helping us improve JSPrismarine by enabling anonymized telemetry data.',
                'TelemetryManager/onEnable'
            );
        this.server
            .getLogger()
            ?.info(
                "To find out exactly what we're collecting please visit the following url(s):",
                'TelemetryManager/onEnable'
            );
        this.urls.forEach((url) => {
            this.server.getLogger()?.info(`- ${url}/id/${this.id}`, 'TelemetryManager/onEnable');
        });

        await this.tick();
        this.ticker = setInterval(async () => this.tick(), 60 * 1000);
    }

    public async onDisable() {
        clearInterval(this.ticker);
    }

    private async tick() {
        if (!this.server) return;

        const body = {
            id: this.id,
            version: `${this.server.getConfig().getVersion()}:${this.server.getQueryManager().git_rev}`,
            online_mode: this.server.getConfig().getOnlineMode(),
            player_count: 0, // TODO
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
                    this.server.getLogger()?.debug('Sent heartbeat', 'TelemetryManager/tick');
                } catch (error) {
                    this.server.getLogger()?.warn(`Failed to tick: ${url} (${error})`, 'TelemetryManager/tick');
                    this.server.getLogger()?.debug((error as any).stack, 'TelemetryManager/tick');
                }
            })
        );
    }

    public async generateAnonomizedId(): Promise<string> {
        return machineId();
    }

    public async sendCrashLog(crashlog: Error, urls: string[]) {
        this.server
            .getLogger()
            ?.error(
                "JSPrismarine has crashed, we're now submitting the error to the telemetry service...",
                'TelemetryManager/sendCrashLog'
            );
        this.server.getLogger()?.debug(crashlog?.stack!, 'TelemetryManager/sendCrashLog');

        const body = {
            id: await this.generateAnonomizedId(),
            version: `${this.server.getConfig().getVersion()}:${this.server.getQueryManager().git_rev}`,
            error: {
                name: crashlog.name,
                message: crashlog.message,
                stack: crashlog.stack,
                log: this.server.getLogger()?.getLog()
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
                        return `${url}/error/${((await res.json()) as any).id}`;
                    } catch (error) {
                        this.server.getLogger()?.debug((error as any).stack, 'TelemetryManager/sendCrashLog');
                    }
                })
            )
        ).filter((a) => a);

        if (!links.length) {
            this.server
                .getLogger()
                ?.error('Failed to submit error to telemetry service!', 'TelemetryManager/sendCrashLog');
            return;
        }

        this.server
            .getLogger()
            ?.error(
                'JSPrismarine has crashed, please report the following url(s) to the maintainers:',
                'TelemetryManager/sendCrashLog'
            );
        links.forEach((url) => {
            this.server.getLogger()?.error(`- ${url}`, 'TelemetryManager/sendCrashLog');
        });
    }
}
