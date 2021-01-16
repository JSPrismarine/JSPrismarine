declare module 'mccolorstoconsole' {
    export function minecraftToConsole(
        text: string,
        colorPrefixChar?: string,
        clearAtEnd?: boolean
    ): string;
}
