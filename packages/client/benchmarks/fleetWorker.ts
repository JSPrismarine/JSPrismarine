import Fleet from '../src/bot/Fleet';
import type { FleetOptions } from '../src/bot/Fleet';

type FleetWorkerRequest = { readonly type: 'start'; readonly options: FleetOptions } | { readonly type: 'stop' };

const send = (message: { readonly type: string; readonly [key: string]: unknown }): void => {
    if (process.send) process.send(message);
};

let fleet: Fleet | undefined;

process.on('message', async (message: FleetWorkerRequest) => {
    if (message.type === 'start') {
        try {
            fleet = new Fleet(message.options);
            const progressTimer = setInterval(() => {
                send({
                    type: 'progress',
                    connected: fleet?.getBots().filter((bot) => bot.loginLatencyMs !== null).length ?? 0,
                    requested: message.options.count
                });
            }, 1000);
            await fleet.connect();
            clearInterval(progressTimer);
            send({ type: 'connected', report: fleet.report() });
        } catch (error: unknown) {
            send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
            setTimeout(() => process.exit(1), 50).unref();
        }
        return;
    }

    if (!fleet) {
        send({ type: 'error', message: 'Cannot stop a bot fleet before it starts' });
        setTimeout(() => process.exit(1), 50).unref();
        return;
    }

    fleet.stop();
    send({ type: 'stopped', report: fleet.report() });
    setTimeout(() => process.exit(0), 500).unref();
});
