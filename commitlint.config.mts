import type { UserConfig } from '@commitlint/types';

/** Backticked spans are code by definition; drop them before looking for bare code. */
const stripCode = (text: string): string => text.replaceAll(/`[^`]*`/g, '');

/** Bare code that should have been wrapped in backticks. */
const BARE_CODE_PATTERNS: Array<{ pattern: RegExp; what: string }> = [
    {
        // settings.json, dev.mts, release.yml, Server.ts
        pattern: /(?<![\w./-])[\w-]+(?:\.[\w-]+)*\.(?:[cm]?[jt]sx?|json|md|ya?ml|exp|toml|lock|env)(?![\w.-])/,
        what: 'file names'
    },
    {
        // process.loadEnvFile, Vector3.equals, server.shutdown()
        pattern: /(?<![\w.-])[A-Za-z_$][\w$]*\.(?!(?:g|e|io|dev|com|org|net)(?![\w$]))[a-z_$][\w$]*(?![\w-])/,
        what: 'member names'
    },
    {
        // shutdown(), createLogger()
        pattern: /(?<![\w.-])[A-Za-z_$][\w$]*\(\)/,
        what: 'function calls'
    },
    {
        // --watch, --no-verify
        pattern: /(?<![\w-])--[a-z][\w-]*/,
        what: 'command-line flags'
    }
];

const config: UserConfig = {
    extends: ['@commitlint/config-conventional'],
    plugins: [
        {
            rules: {
                'footer-max-line-length': ({ footer }, _when, value = 0) => {
                    const lines = footer?.split(/\r?\n/).filter((line) => !/^Co-authored-by:/i.test(line));
                    const valid = lines?.every((line) => /\bhttps?:\/\/\S+/.test(line) || line.length <= value) ?? true;
                    return [valid, `footer's lines must not be longer than ${value} characters`];
                },
                'subject-code-in-backticks': ({ header }) => {
                    const bare = stripCode(header ?? '');
                    const hits = BARE_CODE_PATTERNS.filter(({ pattern }) => pattern.test(bare)).map(({ what }) => what);
                    return [
                        hits.length === 0,
                        `wrap ${hits.join(', ')} in backticks, for example "fix(server): read \`.env\` with \`process.loadEnvFile\`"`
                    ];
                }
            }
        }
    ],
    rules: {
        // "feat(labels): sync CodeRabbit labels": a lowercase type and scope, an
        // imperative lowercase subject, no trailing period, names keep their case.
        'header-max-length': [2, 'always', 72],
        'subject-full-stop': [2, 'never', '.'],
        'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
        'scope-case': [2, 'always', 'kebab-case'],
        'body-max-line-length': [2, 'always', 100],
        'footer-max-line-length': [2, 'always', 100],
        'subject-code-in-backticks': [2, 'always']
    }
};

export default config;
