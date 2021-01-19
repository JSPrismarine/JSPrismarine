import Server from "../Server";
import Command from "./Command";

export default class CommandManager {
    private readonly commands: Map<string, Command> = new Map();
    private readonly server: Server;

    public constructor(server: Server) {
        this.server = server;
    }

    public async onEnable(): Promise<void> {
        // TODO
    }

    public async onDisable(): Promise<void> {
        this.commands.clear();
    }

    public async registerCommand(command: Command) {
        if (!(command instanceof Function)) {
            throw new Error(
                `Command must be a class that extends Command`
            );
        }
        if (command.id.split(':').length !== 2)
            throw new Error(
                `Failed to register command with name "${command.constructor.name}" as no namespace was found from the id.`
            );

        if (!command.execute)
            throw new Error(
                `Failed to register command with name "${command.constructor.name}" as no "execute" member was found.`
            );

        for (let [pos, argument] of command.arguments.getRegistered()) {
            // TODO: Check arguments, and see if return types are valid.
        }

        await Promise.all(
            this.server
                .getPlayerManager()
                .getOnlinePlayers()
                .map(async (player) => {
                    await player.getConnection().sendAvailableCommands();
                })
        );

        this.server
            .getLogger()
            .silly(
                `Command with id §b${command.id}§r registered`,
                'CommandManager/registerClassCommand'
            );
    }
}