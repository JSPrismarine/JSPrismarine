import chalk from 'chalk';

const chalkColorMap = {
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

const toConsole = Object.fromEntries(
    Object.entries(chalkColorMap).map((i) => {
        const colorData = (chalk as any)[i[1]];
        if (colorData && i[1]) {
            const symbols: any = Object.getOwnPropertySymbols(colorData);
            return [i[0], (chalk as any)[i[1]][symbols[1]].open];
        }
        return [i[0], ''];
    })
);

export { chalkColorMap, toConsole };
