import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = resolve(root, 'package.json');
const tauriConfigPath = resolve(root, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = resolve(root, 'src-tauri', 'Cargo.toml');
const cargoLockPath = resolve(root, 'src-tauri', 'Cargo.lock');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const version = String(packageJson.version || '').trim();

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`package.json version must be semver-compatible, got: ${version || '<empty>'}`);
}

const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));
tauriConfig.version = version;
writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

const cargoToml = readFileSync(cargoTomlPath, 'utf8');
writeFileSync(
  cargoTomlPath,
  cargoToml.replace(/(^\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m, `$1"${version}"`),
);

const cargoLock = readFileSync(cargoLockPath, 'utf8');
writeFileSync(
  cargoLockPath,
  cargoLock.replace(/(\[\[package\]\]\r?\nname = "kukechat"\r?\nversion = )"[^"]+"/, `$1"${version}"`),
);

console.log(`Synced desktop version to ${version}`);
