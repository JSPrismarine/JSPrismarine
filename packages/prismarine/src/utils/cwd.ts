import path from 'node:path';
import process from 'node:process';

export const cwd = () => {
    if (process.env.JSP_DIR) return path.resolve(process.cwd(), process.env.JSP_DIR);
    else return process.cwd();
};

export const withCwd = (...file: string[]) => {
    return path.resolve(cwd(), path.join(...file));
};
