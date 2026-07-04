/**
 * Sync version from package.json to Cargo.toml
 * Triggered automatically by `npm version` via postversion hook
 */
import { readFileSync, writeFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
const version = pkg.version

// Sync Cargo.toml
const cargoPath = 'src-tauri/Cargo.toml'
let cargo = readFileSync(cargoPath, 'utf-8')
cargo = cargo.replace(/^version\s*=\s*".*"/m, `version = "${version}"`)
writeFileSync(cargoPath, cargo)

console.log(`\x1b[32m✓\x1b[0m Synced version ${version} to Cargo.toml`)
