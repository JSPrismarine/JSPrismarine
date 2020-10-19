import Player from "../../player";
import Command from "../";

export default class ReloadCommand extends Command {
    constructor() {
        super({ id: 'jsprismarine:reload', description: 'Reloads the server' });
    }

    public execute(sender: Player, args: Array<string>): void {
        sender.sendMessage('§cPlease note that this command is not supported and may cause issues when using some plugins.');
        sender.sendMessage('§cIf you encounter any issues please use the /stop command to restart your server.');
        sender.getServer().reload().then(() => {
            sender.sendMessage('§aReload complete.');
        });
    }
}
