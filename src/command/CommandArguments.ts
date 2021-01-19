import {
    CommandContext,
    StringReader,
    Suggestions
} from '@jsprismarine/brigadier';
import CommandParameter, {
    CommandParameterType
} from '../network/type/CommandParameter';

import Gamemode from '../world/Gamemode';
import ParseEntityArgument from '../utils/ParseEntityArgument';
import Player from '../player/Player';
import Server from '../Server';
import Vector3 from '../math/Vector3';

export abstract class CommandArgument {
    public getReadableType(): string {
        return '';
    }
    public getParameters(): Set<CommandParameter> {
        return new Set();
    }
}

export class CommandArgumentGamemode implements CommandArgument {
    public parse(reader: StringReader, context: CommandContext<Player>) {
        const gm = reader.readString();

        Gamemode.getGamemodeId(gm);
        return gm;
    }
    public async listSuggestions(context: any, builder: any) {
        // TODO
        return Suggestions.empty();
    }
    public getExamples() {
        return ['survival', 'creative', 'adventure', 'spectator'];
    }

    public getReadableType(): string {
        return '<gamemode>';
    }

    public getParameters(): Set<CommandParameter> {
        return new Set([
            new CommandParameter({
                name: 'gamemode',
                type: CommandParameterType.Enum,
                enumValues: ['survival', 'creative', 'adventure', 'spectator'],
                optional: false
            })
        ]);
    }
}

export class CommandArgumentEntity implements CommandArgument {
    private targetName;

    public constructor(targetName = 'target') {
        this.targetName = targetName;
    }

    public parse(reader: StringReader, context: CommandContext<Player>) {
        let player = '';
        while (true) {
            if (!reader.canRead()) break;

            const pos = reader.getCursor();
            const char = reader.read();
            if (char === ' ') {
                reader.setCursor(pos);
                break;
            }

            player += char;
        }

        if (player.startsWith('@'))
            try {
                return ParseEntityArgument({
                    input: player,
                    source: context.getSource(),
                    entities: context.getSource().getWorld().getEntities()
                });
            } catch (error) {
                console.error(error);
                if (!error.message.includes('no results')) throw error;
                return [];
            }

        return [Server.instance.getPlayerManager().getPlayerByName(player)];
    }

    public getReadableType(): string {
        return `<${this.targetName}>`;
    }

    public getParameters(): Set<CommandParameter> {
        return new Set([
            new CommandParameter({
                name: this.targetName,
                type: CommandParameterType.Target,
                optional: false
            })
        ]);
    }
}

export class CommandArgumentPosition
    extends Vector3
    implements CommandArgument {
    private xName;
    private yName;
    private zName;

    public constructor(xName = 'x', yName = 'y', zName = 'z') {
        super();
        this.xName = xName;
        this.yName = yName;
        this.zName = zName;
    }

    public parse(reader: StringReader, context: CommandContext<Player>) {
        this.setX(reader.readFloat());
        reader.skip();
        this.setY(reader.readFloat());
        reader.skip();
        this.setZ(reader.readFloat());
        return this;
    }

    public getExamples() {
        return ['1 2 3'];
    }

    public getReadableType(): string {
        return `[${this.xName}] [${this.yName}] [${this.zName}]`;
    }

    public getParameters(): Set<CommandParameter> {
        return new Set([
            new CommandParameter({
                name: this.xName,
                type: CommandParameterType.Position,
                optional: false
            }),
            new CommandParameter({
                name: this.yName,
                type: CommandParameterType.Position,
                optional: false
            }),
            new CommandParameter({
                name: this.zName,
                type: CommandParameterType.Position,
                optional: false
            })
        ]);
    }
}