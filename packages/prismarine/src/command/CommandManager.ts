import { ArgumentCommandNode, CommandDispatcher } from '@jsprismarine/brigadier';

import Chat from '../chat/Chat.js';
import Command from './Command.js';
import { CommandArgument } from './CommandArguments.js';
// import CommandNode from '@jsprismarine/brigadier/dist/lib/tree/CommandNode.js';
import CommandRegisterEvent from '../events/command/CommandRegisterEvents.js';
import Entity from '../entity/Entity.js';
import { Player } from '../Prismarine.js';
import Server from '../Server.js';
import Timer from '../utils/Timer.js';
import fs from 'node:fs';
import url from 'node:url';

export default class CommandManager {
    private readonly commands: Map<string, Command> = new Map();
    private readonly server: Server;
    private dispatcher!: CommandDispatcher<Player>;

    public constructor(server: Server) {
        this.server = server;
        this.dispatcher = new CommandDispatcher();
    }

    /**
     * OnEnable hook.
     */
    public async onEnable() {
        const timer = new Timer();

        const commands = [
            ...fs.readdirSync(url.fileURLToPath(new URL('vanilla', import.meta.url))).map((a) => `/vanilla/${a}`),
            ...fs
                .readdirSync(url.fileURLToPath(new URL('jsprismarine', import.meta.url)))
                .map((a) => `/jsprismarine/${a}`)
        ];

        // Register jsprismarine commands
        await Promise.all(
            commands.map(async (id: string) => {
                if (id.includes('.test.') || id.includes('.d.ts') || id.includes('.map')) return; // Exclude test files

                if (!this.server.getConfig().getEnableEval() && id.includes('EvalCommand')) return;

                const Command = await import(`./${id}`);
                const command: Command = new (Command.default || Command)();

                const event = new CommandRegisterEvent(command);
                await this.server.getEventManager().emit('commandRegister', event);
                if (event.isCancelled()) return;

                try {
                    await this.registerClassCommand(command);
                } catch (err) {
                    this.server.getLogger()?.warn(`Failed to register command ${command.id}: ${err}`);
                    this.server.getLogger()?.debug((err as any).stack);
                }
            })
        );

        this.server
            .getLogger()
            ?.verbose(
                `Registered §b${this.commands.size}§r commands(s) (took ${timer.stop()} ms)!`,
                'CommandManager/onEnable'
            );
    }

    /**
     * OnDisable hook.
     */
    public async onDisable() {
        this.commands.clear();
        // TODO: clear commands in dispatcher
    }

    /**
     * Register a command into command manager by class.
     */
    public async registerClassCommand(command: Command) {
        if (command.id.split(':').length !== 2) throw new Error(`command is missing required "namespace" part of id`);

        if (!command?.register)
            this.server
                .getLogger()
                ?.warn(
                    `Command is missing "register" member. This is unsupported!`,
                    'CommandManager/registerClassCommand'
                );

        await command.register?.(this.dispatcher);
        this.commands.set(command.id, command);

        await Promise.all(
            this.server
                .getSessionManager()
                .getAllPlayers()
                .map(async (player) => player.getNetworkSession().sendAvailableCommands())
        );

        this.server
            .getLogger()
            ?.debug(`Command with id §b${command.id}§r registered`, 'CommandManager/registerClassCommand');
    }

    /**
     * Get all enabled commands.
     */
    public getCommands(): Map<string, Command> {
        return this.commands;
    }

    /**
     * Get a list of all command variants.
     *
     * @remarks
     * This is EXCLUDING legacy commands.
     */
    public getCommandsList(): Array<[string, /* CommandNode<Player> */ any, CommandArgument[][]]> {
        const parseNode = (node: /* CommandNode<Player> */ any): any[] => {
            if (node.getChildrenCount() <= 0) {
                return [
                    {
                        item: (node as ArgumentCommandNode<any, any>).getType(),
                        children: []
                    }
                ];
            }

            const res = Array.from(node.getChildren())
                .map((node) => parseNode(node))
                .reverse();

            return [
                node.getCommand()
                    ? {
                          item: (node as ArgumentCommandNode<any, any>).getType(),
                          children: []
                      }
                    : undefined,
                ...res.map((children: any) => ({
                    item: (node as ArgumentCommandNode<any, any>).getType(),
                    children: [...children]
                }))
            ].filter((a) => a);
        };

        const traverse = (node: any, path: any[] = [], result: any[] = []) => {
            if (!node.children.length) result.push(path.concat(node.item));
            for (const child of node.children) traverse(child, path.concat(node.item), result);
            return result;
        };

        const res = Array.from(this.server.getCommandManager().getDispatcher().getRoot().getChildren())
            .flatMap((command) => {
                const branches: any[] = [];
                if (command.getCommand()) branches.push([]);

                Array.from(command.getChildren()).forEach((node) => {
                    const parsed = parseNode(node);
                    parsed.forEach((branch) => {
                        branches.push(traverse(branch));
                    });
                });

                return branches.map((branch) => [command.getName(), command, branch]);
            })
            .filter((a) => a);

        res.toString = () => {
            return `${this.getCommandsList()
                .map((item) => {
                    if (!item[2].length) return `/${item[0]}`;
                    return item[2]
                        .map(
                            (entries) =>
                                `/${item[0]} ${entries
                                    .flat(Number.POSITIVE_INFINITY)
                                    .map((argument: any) => argument.getReadableType?.() ?? argument.constructor.name)
                                    .join(' ')}`
                        )
                        .join(`\n`);
                })
                .join('\n')}`;
        };
        return res as any;
    }

    /**
     * Get dispatcher
     */
    public getDispatcher(): CommandDispatcher<Player> {
        return this.dispatcher;
    }

    /**
     * Dispatches a command and executes them.
     *
     * @param sender the player/console who executed the command
     * @param target the Player/entity/console who should execute the command
     * @param input the command input including arguments
     */
    public async dispatchCommand(sender: Player, target: Entity | Player, input = '') {
        try {
            const parsed = this.dispatcher.parse(input.trim(), target as Player);
            const id = parsed.getReader().getString().split(' ')[0];

            // Get command from parsed string
            const command = Array.from(this.commands.values()).find(
                (command) => command.id.split(':')[1] === id || command.aliases?.includes(id)
            );

            if (
                !this.server
                    .getPermissionManager()
                    .can(sender)
                    .execute(command?.permission)
            ) {
                await sender.sendMessage(
                    "§cI'm sorry, but you do not have permission to perform this command. " +
                        'Please contact the server administrators if you believe that this is in error.'
                );
                return;
            }

            let res: string[] = [];
            if (!command?.register && command?.execute) {
                // Legacy commands
                this.server
                    .getLogger()
                    ?.warn(`${id} is using the legacy command format`, 'CommandManager/dispatchCommand');
                res.push(
                    await command.execute(
                        sender as any,
                        parsed.getReader().getString().replace(`${id} `, '').split(' ')
                    )
                );
            } else {
                // Handle aliases
                if (command?.aliases?.includes(id)) {
                    await this.dispatchCommand(sender, target, input.replace(id, command.id.split(':')[1]));
                    return;
                }
                res = await Promise.all(this.dispatcher.execute(parsed));
            }

            const feedback = (sender as any as Entity)
                .getWorld()
                .getGameruleManager()
                .getGamerule('sendCommandFeedback');

            // Make sure we don't send feedback if sendCommandFeedback is set to false
            if (feedback)
                res.forEach(async (res: any) => {
                    const chat = new Chat(
                        this.server.getConsole(),
                        `§o§7[${target.getName()}: ${res ?? `issued server command: /${input}`}]§r`,
                        [],
                        false,
                        '*.ops'
                    );

                    // TODO: should this be broadcasted to the executer?
                    await this.server.getChatManager().send(chat);
                });
            else {
                const chat = new Chat(
                    this.server.getConsole(),
                    `§o§7[${sender.getName()}: ${res ?? `issued server command: /${input}`}]§r`,
                    [],
                    false,
                    '*.console'
                );

                await this.server.getChatManager().send(chat);
            }
        } catch (error) {
            if ((error as any)?.type?.message?.toString?.() === 'Unknown command') {
                await sender.sendMessage(`§cUnknown command. Type "/help" for help.`);
                return;
            }

            await sender.sendMessage(`§c${error}`);
            this.server
                .getLogger()
                ?.debug(
                    `Player ${target.getFormattedUsername()} tried to execute ${input}, but it failed with the error: ${error}`,
                    'CommandManager/dispatchCommand'
                );
            this.server.getLogger()?.debug(`${(error as any).stack}`, 'CommandManager/dispatchCommand');
        }
    }
}
