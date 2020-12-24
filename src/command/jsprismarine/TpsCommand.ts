import Command from '../Command';
import Player from '../../player/Player';

export default class PluginsCommand extends Command {
    constructor() {
        super({ id: 'jsprismarine:tps', description: 'Get current TPS.' });
    }

    private formatTPS(tps: number): string {
        let color = '§4';
        if (tps >= 19) color = '§2';
        else if (tps >= 15) color = '§e';
        else color = '§4';

        return `${color}${tps}§r`;
    }

    public execute(sender: Player, args: Array<any>): void {
        const tps = sender.getServer().getTPS();
        const history = sender.getServer().getAverageTPS();

        sender.sendMessage(
            `TPS from last 0m, 1m, 5m, 10m: ${this.formatTPS(
                tps
            )}, ${this.formatTPS(history.one)}, ${this.formatTPS(
                history.five
            )}, ${this.formatTPS(history.ten)}`
        );
        return;
    }
}
