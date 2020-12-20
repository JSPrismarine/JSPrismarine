import Server from '../Server';

export default interface CommandExecuter {
    getServer(): Server;
    sendMessage(message: string, xuid?: string, needTranslation?: string): void;
    getUsername(): string;
    getFormattedUsername(): string;
    isPlayer(): boolean;
}
