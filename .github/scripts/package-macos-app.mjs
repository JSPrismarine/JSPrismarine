import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const [binaryPath, architecture] = process.argv.slice(2);
if (!binaryPath || !['arm64', 'x64'].includes(architecture)) {
    throw new Error('Usage: node .github/scripts/package-macos-app.mjs <binary-path> <arm64|x64>');
}
const clangArchitecture = architecture === 'x64' ? 'x86_64' : 'arm64';

const bundleName = `JSPrismarine-${architecture}.app`;
const outputDirectory = path.dirname(path.resolve(repositoryRoot, binaryPath));
const bundlePath = path.join(outputDirectory, bundleName);
const contentsPath = path.join(bundlePath, 'Contents');
const macOSPath = path.join(contentsPath, 'MacOS');
const resourcesPath = path.join(contentsPath, 'Resources');
const executablePath = path.join(macOSPath, 'prismarine');
const appExecutablePath = path.join(macOSPath, 'JSPrismarine');
const appCommandPath = path.join(resourcesPath, 'JSPrismarine.command');
const iconPath = path.join(resourcesPath, 'icon.icns');
const iconsetPath = mkdtempSync(path.join(os.tmpdir(), 'jsprismarine-icon-'));
const temporaryIconsetPath = path.join(iconsetPath, 'icon.iconset');
const sourceIconPath = path.join(repositoryRoot, '.github/assets/icon.png');
const entitlementsPath = path.join(repositoryRoot, '.github/assets/entitlements.plist');
const launcherSourcePath = path.join(repositoryRoot, '.github/scripts/macos-app-launcher.m');
const sourceBinaryPath = path.resolve(repositoryRoot, binaryPath);
const zipPath = path.join(outputDirectory, `${bundleName}.zip`);
const signArguments = ['--deep', '--force', '-vvvv', '--sign', '-', '--entitlements', entitlementsPath];

rmSync(bundlePath, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(macOSPath, { recursive: true });
mkdirSync(resourcesPath, { recursive: true });
mkdirSync(temporaryIconsetPath, { recursive: true });
if (statSync(sourceBinaryPath).size === 0) throw new Error(`Executable is empty: ${binaryPath}`);
execFileSync('codesign', [...signArguments, sourceBinaryPath], { stdio: 'inherit' });
execFileSync('codesign', ['-vvv', '--verify', sourceBinaryPath], { stdio: 'inherit' });
copyFileSync(sourceBinaryPath, executablePath);
chmodSync(executablePath, 0o755);
execFileSync(
    'clang',
    [
        '-arch',
        clangArchitecture,
        '-mmacosx-version-min=10.13',
        '-fobjc-arc',
        '-framework',
        'Foundation',
        launcherSourcePath,
        '-o',
        appExecutablePath
    ],
    { stdio: 'inherit' }
);
chmodSync(appExecutablePath, 0o755);

writeFileSync(
    appCommandPath,
    `#!/bin/bash
set -e

app_path="$(cd "$(dirname "$0")/../.." && pwd -P)"
data_directory="\${HOME}/JSPrismarine"
mkdir -p "$data_directory"
cd "$data_directory"
exec "$app_path/Contents/MacOS/prismarine" "$@"
`
);
chmodSync(appCommandPath, 0o755);

const iconSizes = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024]
];

for (const [fileName, size] of iconSizes) {
    execFileSync(
        'sips',
        ['-z', String(size), String(size), sourceIconPath, '--out', path.join(temporaryIconsetPath, fileName)],
        {
            stdio: 'inherit'
        }
    );
}

execFileSync('iconutil', ['-c', 'icns', temporaryIconsetPath, '-o', iconPath], { stdio: 'inherit' });

const escapeXml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const buildVersion = process.env.BUILD_VERSION ?? '0.0.0';
const shortVersion = buildVersion.split('-')[0];
const buildNumber = process.env.GITHUB_RUN_NUMBER ?? '1';
const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key><string>en</string>
	<key>CFBundleDisplayName</key><string>JSPrismarine</string>
	<key>CFBundleExecutable</key><string>JSPrismarine</string>
	<key>CFBundleIconFile</key><string>icon</string>
	<key>CFBundleIdentifier</key><string>org.jsprismarine.server</string>
	<key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
	<key>CFBundleName</key><string>JSPrismarine</string>
	<key>CFBundlePackageType</key><string>APPL</string>
	<key>CFBundleShortVersionString</key><string>${escapeXml(shortVersion)}</string>
	<key>CFBundleVersion</key><string>${escapeXml(buildNumber)}</string>
	<key>JSPBuildFlavor</key><string>${escapeXml(process.env.BUILD_FLAVOR ?? 'JSPrismarine')}</string>
	<key>JSPBuildType</key><string>${escapeXml(process.env.BUILD_TYPE ?? '')}</string>
	<key>JSPBuildVersion</key><string>${escapeXml(buildVersion)}</string>
	<key>JSPBuildTime</key><string>${escapeXml(process.env.BUILD_TIME ?? '')}</string>
	<key>JSPGitHash</key><string>${escapeXml(process.env.BUILD_GIT_HASH ?? '')}</string>
	<key>LSApplicationCategoryType</key><string>public.app-category.developer-tools</string>
</dict>
</plist>
`;

writeFileSync(path.join(contentsPath, 'Info.plist'), infoPlist);
writeFileSync(path.join(contentsPath, 'PkgInfo'), 'APPL????');
if (statSync(executablePath).size === 0) throw new Error(`Executable is empty: ${binaryPath}`);

execFileSync('codesign', [...signArguments, executablePath], { stdio: 'inherit' });
execFileSync('codesign', [...signArguments, appExecutablePath], { stdio: 'inherit' });
execFileSync('codesign', [...signArguments, bundlePath], { stdio: 'inherit' });
execFileSync('codesign', ['-vvv', '--verify', executablePath], { stdio: 'inherit' });
execFileSync('codesign', ['-vvv', '--verify', appExecutablePath], { stdio: 'inherit' });
execFileSync('codesign', ['-vvv', '--verify', bundlePath], { stdio: 'inherit' });
execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', bundlePath, zipPath], { stdio: 'inherit' });

rmSync(iconsetPath, { recursive: true, force: true });
