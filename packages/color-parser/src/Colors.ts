import chalk from 'chalk';

// Minecraft color codes -> chalk color names.
export const chalkColorMap = {
    0: 'black',
    1: 'blue',
    2: 'green',
    3: 'cyan',
    4: 'red',
    5: 'magenta',
    6: 'yellow',
    7: 'white',
    8: 'blackBright',
    9: 'blueBright',
    a: 'greenBright',
    b: 'cyanBright',
    c: 'redBright',
    d: 'magentaBright',
    e: 'yellowBright',
    f: 'whiteBright',

    k: '',
    l: 'bold',
    m: 'strikethrough',
    n: 'underline',
    o: 'italic',

    r: 'reset'
};

export type ChalkColorMap = {
    [key: string]: keyof typeof chalk;
};

export const toConsole: ChalkColorMap = Object.fromEntries(
    Object.entries(chalkColorMap).map((conversion) => {
        const chalkColorData = chalk[conversion[1] as keyof typeof chalk];

        if (chalkColorData && conversion[1]) {
            const symbols: any = Object.getOwnPropertySymbols(chalkColorData);
            return [conversion[0], (chalk as any)[conversion[1]][symbols[1]].open];
        }

        return [conversion[0], ''];
    })
);
