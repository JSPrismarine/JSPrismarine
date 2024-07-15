import type { CommandContext, StringReader } from '@jsprismarine/brigadier';
import { Suggestions } from '@jsprismarine/brigadier';
import CommandParameter, { CommandParameterFlags, CommandParameterType } from '../network/type/CommandParameter';

import { Vector3 } from '@jsprismarine/math';
import { getGametypeId, getGametypeName } from '@jsprismarine/minecraft';
import type Player from '../Player';
import type Server from '../Server';
import { CommandEnum } from '../network/type/CommandEnum';
import ParseTargetSelector from '../utils/ParseTargetSelector';
import ParseTildeCaretNotation from '../utils/ParseTildeCaretNotation';

export abstract class CommandArgument {
    public getReadableType(): string {
        return '';
    }
    // eslint-disable-next-line unused-imports/no-unused-vars
    public getParameters(server: Server): Set<CommandParameter> | undefined {
        return new Set();
    }
}

export class CommandArgumentGamemode implements CommandArgument {
    private name: string;
    private optional: boolean;
    private flags: CommandParameterFlags;
    private postfix: string | null;

    public constructor(data?: { name?: string; optional?: boolean; flags?: CommandParameterFlags; postfix?: string }) {
        this.name = data?.name ?? 'gameMode';
        this.optional = data?.optional ?? false;
        this.flags = data?.flags ?? CommandParameterFlags.NONE;
        this.postfix = data?.postfix ?? null;
    }

    public parse(reader: StringReader, _context: CommandContext<Player>) {
        return getGametypeName(getGametypeId(reader.readString()));
    }
    public async listSuggestions(_context: any, _builder: any) {
        // TODO
        return Suggestions.empty();
    }
    public getExamples() {
        return ['survival', 'creative', 'adventure', 'spectator'];
    }

    public getReadableType(): string {
        return this.name;
    }

    public getParameters(): Set<CommandParameter> {
        const gameModeEnum = new CommandEnum();
        gameModeEnum.name = 'GameMode';

        // TODO: this should be dynamic
        gameModeEnum.values = ['survival', 'creative', 'adventure', 'spectator'];
        return new Set([
            new CommandParameter({
                paramName: this.name,
                isOptional: this.optional,
                flags: this.flags,
                enum: gameModeEnum,
                postfix: this.postfix
            })
        ]);
    }
}

export class CommandArgumentMob implements CommandArgument {
    private name: string;
    private optional: boolean;
    private flags: CommandParameterFlags;
    private postfix: string | null;

    public constructor(data?: { name?: string; optional?: boolean; flags?: CommandParameterFlags; postfix?: string }) {
        this.name = data?.name ?? 'entityType';
        this.optional = data?.optional ?? false;
        this.flags = data?.flags ?? CommandParameterFlags.NONE;
        this.postfix = data?.postfix ?? null;
    }

    public parse(reader: StringReader, _context: CommandContext<Player>) {
        let str = '';
        while (reader.canRead()) {
            const pos = reader.getCursor();
            const char = reader.read();
            if (char === ' ') {
                reader.setCursor(pos);
                break;
            }

            str += char;
        }

        return str;
    }
    public async listSuggestions(_context: any, _builder: any) {
        // TODO
        return Suggestions.empty();
    }
    public getExamples() {
        return [];
    }

    public getReadableType(): string {
        return this.name;
    }

    public getParameters(): Set<CommandParameter> {
        const entityTypeEnum = new CommandEnum();
        entityTypeEnum.name = 'EntityType';
        entityTypeEnum.values = []; //Object.entries(Entities).map(([, entity]) => entity.MOB_ID);
        return new Set([
            new CommandParameter({
                paramName: this.name,
                isOptional: this.optional,
                flags: this.flags,
                enum: entityTypeEnum,
                postfix: this.postfix
            })
        ]);
    }
}

export class CommandArgumentEntity implements CommandArgument {
    private name: string;
    private optional: boolean;
    private flags: CommandParameterFlags;
    private postfix: string | null;

    public constructor(data?: { name?: string; optional?: boolean; flags?: CommandParameterFlags; postfix?: string }) {
        this.name = data?.name ?? 'target';
        this.optional = data?.optional ?? false;
        this.flags = data?.flags ?? CommandParameterFlags.NONE;
        this.postfix = data?.postfix ?? null;
    }

    public parse(reader: StringReader, context: CommandContext<Player>) {
        let player = '';
        while (reader.canRead()) {
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
                return ParseTargetSelector({
                    input: player,
                    source: context.getSource(),
                    entities: context.getSource().getWorld().getEntities()
                });
            } catch (error: unknown) {
                if (!(error as any).message.includes('no results')) throw error;
                return [];
            }

        return [context.getSource().getServer().getSessionManager().getPlayerByExactName(player)]; // TODO: by name not exact
    }

    public getReadableType(): string {
        return this.name;
    }

    public getParameters(): Set<CommandParameter> {
        return new Set([
            new CommandParameter({
                paramName: this.name,
                paramType: CommandParameterType.Target,
                isOptional: this.optional,
                flags: this.flags,
                postfix: this.postfix
            })
        ]);
    }
}

export class CommandArgumentPosition extends Vector3 implements CommandArgument {
    private name: string;
    private optional: boolean;
    private flags: CommandParameterFlags;
    private postfix: string | null;

    public constructor(data?: { name?: string; optional?: boolean; flags?: CommandParameterFlags; postfix?: string }) {
        super(0, 0, 0);
        this.name = data?.name ?? 'position';
        this.optional = data?.optional ?? false;
        this.flags = data?.flags ?? CommandParameterFlags.NONE;
        this.postfix = data?.postfix ?? null;
    }

    public parse(reader: StringReader, context: CommandContext<Player>) {
        const getPos = () => {
            let pos = '';
            while (reader.canRead()) {
                const cursor = reader.getCursor();
                const char = reader.read();
                if (char === ' ') {
                    reader.setCursor(cursor);
                    break;
                }

                pos += char;
            }
            return pos;
        };

        this.setX(
            ParseTildeCaretNotation({
                input: getPos(),
                source: context.getSource(),
                type: 'x'
            })
        );
        reader.skip();
        this.setY(
            ParseTildeCaretNotation({
                input: getPos(),
                source: context.getSource(),
                type: 'y'
            })
        );
        reader.skip();
        this.setZ(
            ParseTildeCaretNotation({
                input: getPos(),
                source: context.getSource(),
                type: 'z'
            })
        );
        return this;
    }

    public getReadableType(): string {
        return this.name;
    }

    public getParameters(): Set<CommandParameter> {
        return new Set([
            new CommandParameter({
                paramName: this.name,
                paramType: CommandParameterType.Position,
                isOptional: this.optional,
                flags: this.flags,
                postfix: this.postfix
            })
        ]);
    }
}

export class CommandArgumentCommand implements CommandArgument {
    private name: string;
    private optional: boolean;
    private flags: CommandParameterFlags;
    private postfix: string | null;

    public constructor(data?: { name?: string; optional?: boolean; flags?: CommandParameterFlags; postfix?: string }) {
        this.name = data?.name ?? 'command';
        this.optional = data?.optional ?? false;
        this.flags = data?.flags ?? CommandParameterFlags.NONE;
        this.postfix = data?.postfix ?? null;
    }

    public parse(reader: StringReader, _context: CommandContext<Player>) {
        const command = reader.readString();

        return command;
    }

    public getReadableType(): string {
        return this.name;
    }

    public getParameters(): Set<CommandParameter> {
        return new Set([
            new CommandParameter({
                paramName: this.name,
                paramType: CommandParameterType.Position,
                isOptional: this.optional,
                flags: this.flags,
                postfix: this.postfix
            })
        ]);
    }
}

export class BooleanArgumentCommand implements CommandArgument {
    private name: string;
    private optional: boolean;
    private flags: CommandParameterFlags;
    private postfix: string | null;

    public constructor(data?: { name?: string; optional?: boolean; flags?: CommandParameterFlags; postfix?: string }) {
        this.name = data?.name ?? 'boolean';
        this.optional = data?.optional ?? false;
        this.flags = data?.flags ?? CommandParameterFlags.NONE;
        this.postfix = data?.postfix ?? null;
    }

    public parse(reader: StringReader, _context: CommandContext<Player>) {
        const boolean = reader.readString();

        if (boolean === 'true') return true;

        return false;
    }

    public getReadableType(): string {
        return this.name;
    }

    public getParameters(): Set<CommandParameter> {
        const booleanEnum = new CommandEnum();
        booleanEnum.name = 'Boolean';
        booleanEnum.values = ['true', 'false'];
        return new Set([
            new CommandParameter({
                paramName: this.name,
                isOptional: this.optional,
                enum: booleanEnum,
                flags: this.flags,
                postfix: this.postfix
            })
        ]);
    }
}

export class PlayerArgumentCommand implements CommandArgument {
    private name: string;
    private optional: boolean;
    private flags: CommandParameterFlags;
    private postfix: string | null;

    public constructor(data?: { name?: string; optional?: boolean; flags?: CommandParameterFlags; postfix?: string }) {
        this.name = data?.name ?? 'player';
        this.optional = data?.optional ?? false;
        this.flags = data?.flags ?? CommandParameterFlags.NONE;
        this.postfix = data?.postfix ?? null;
    }

    public parse(reader: StringReader, _context: CommandContext<Player>) {
        const player = reader.readString();
        return player;
    }

    public getReadableType(): string {
        return this.name;
    }

    public getParameters(server: Server): Set<CommandParameter> {
        const playerEnum = new CommandEnum();
        playerEnum.name = 'Player';
        try {
            playerEnum.values = server
                .getSessionManager()
                .getAllPlayers()
                .map((player) => player.getName());
        } catch {
            playerEnum.values = [];
        }

        return new Set([
            new CommandParameter({
                paramName: this.name,
                isOptional: this.optional,
                enum: playerEnum,
                flags: this.flags,
                postfix: this.postfix
            })
        ]);
    }
}
