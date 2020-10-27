<<<<<<< HEAD:src/command/vanilla/say-command.js
const Command = require('../').default;
const Player = require('../../player/Player').default;

class SayCommand extends Command {
=======
import Command from "..";
import type Player from "../../player";
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/command/vanilla/SayCommand.ts

export default class SayCommand extends Command {
    constructor() {
        // TODO: add permissions to command
        super({ id: 'minecraft:say', description: 'Say something to all players.' });
    }

    execute(sender: Player, args: Array<string>) {
        if (!args[0]) {
            return sender.sendMessage(`§cPlease specify a message.`);
        }

        let message = args.join(' ');
        let messageToSend = `§5[${sender.getUsername()}] ${message}`;

        sender.getServer().getLogger().info(messageToSend);
        for (let player of sender.getServer().getOnlinePlayers()) {
            player.sendMessage(messageToSend);
        }
        return null;
    }
};
