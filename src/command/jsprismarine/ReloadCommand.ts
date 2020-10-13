import Player from "../../player/Player";
import Command from "../Command";

export default class ReloadCommand extends Command {
    constructor() {
        super({ namespace: 'jsprismarine', name: 'reload', description: 'Reloads the server' });
    }

    public execute(sender: Player, args: Array<string>): void {
        sender.sendMessage('§cPlease note that this command is not supported and may cause issues when using some plugins.');
        sender.sendMessage('§cIf you encounter any issues please use the /stop command to restart your server.');
        sender.getServer().reload();
        sender.sendMessage('§aReload complete.');
    }
}
