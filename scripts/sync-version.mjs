/**
 * A7Box 版本同步与自增脚本
 *
 * 用法:
 *   node scripts/sync-version.mjs [patch|minor|major|x.y.z]
 *
 * 示例:
 *   node scripts/sync-version.mjs          # 显示当前版本信息
 *   node scripts/sync-version.mjs patch    # 0.1.1 → 0.1.2
 *   node scripts/sync-version.mjs minor    # 0.1.1 → 0.2.0
 *   node scripts/sync-version.mjs major    # 0.1.1 → 1.0.0
 *   node scripts/sync-version.mjs 2.0.0    # 直接指定版本号
 *
 * 由 npm version 的 postversion hook 自动触发时，仅执行同步（不修改 package.json）。
 */
import { readFileSync, writeFileSync } from 'fs'

// ─── 颜色工具 ───────────────────────────────────────────
const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
}

// ─── 语义化版本解析 ─────────────────────────────────────
function parseSemver(v) {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/)
  if (!m) throw new Error(`Invalid semver: ${v}`)
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || null }
}

function bumpVersion(current, type) {
  const v = parseSemver(current)
  switch (type) {
    case 'major':
      return `${v.major + 1}.0.0`
    case 'minor':
      return `${v.major}.${v.minor + 1}.0`
    case 'patch':
      return `${v.major}.${v.minor}.${v.patch + 1}`
    default:
      // 直接指定版本号
      if (/^\d+\.\d+\.\d+/.test(type)) return type
      throw new Error(`Unknown version bump type: "${type}". Use patch, minor, major, or x.y.z`)
  }
}

// ─── 文件同步 ───────────────────────────────────────────
const pkgPath = 'package.json'
const cargoPath = 'src-tauri/Cargo.toml'
const tauriConfPath = 'src-tauri/tauri.conf.json'

function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function syncCargo(version) {
  let cargo = readFileSync(cargoPath, 'utf-8')
  const oldMatch = cargo.match(/^version\s*=\s*"(.*)"/m)
  const oldVersion = oldMatch ? oldMatch[1] : '?'
  cargo = cargo.replace(/^version\s*=\s*".*"/m, `version = "${version}"`)
  writeFileSync(cargoPath, cargo)
  return oldVersion
}

function syncTauriConf(version) {
  try {
    const conf = readJSON(tauriConfPath)
    // Tauri 2 支持 "version": "../package.json" 引用，无需单独同步
    if (!conf.version || conf.version === '../package.json') return null
    const oldVersion = conf.version
    conf.version = version
    writeFileSync(tauriConfPath, JSON.stringify(conf, null, 2) + '\n')
    return oldVersion
  } catch {
    return null
  }
}

function updatePkgVersion(version) {
  const pkg = readJSON(pkgPath)
  const old = pkg.version
  pkg.version = version
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  return old
}

// ─── 主逻辑 ─────────────────────────────────────────────
const arg = process.argv[2]
const pkg = readJSON(pkgPath)
const currentVersion = pkg.version

// 无参数：检测是否由 npm version postversion hook 触发
if (!arg) {
  // postversion hook: npm 已更新 package.json，检查其他文件是否需要同步
  const cargo = readFileSync(cargoPath, 'utf-8')
  const cargoVer = cargo.match(/^version\s*=\s*"(.*)"/m)?.[1] || '?'

  if (cargoVer !== currentVersion) {
    // 由 npm version 触发，自动同步
    console.log('')
    console.log(`  ${c.bold('A7Box Post-Version Sync')}`)
    console.log(`  ${'─'.repeat(40)}`)

    const oldCargo = syncCargo(currentVersion)
    console.log(`  ${c.green('✓')} Cargo.toml:       ${c.dim(oldCargo)} → ${c.green(currentVersion)}`)

    const oldTauri = syncTauriConf(currentVersion)
    if (oldTauri !== null) {
      console.log(`  ${c.green('✓')} tauri.conf.json:  ${c.dim(oldTauri)} → ${c.green(currentVersion)}`)
    }

    console.log('')
    console.log(`  ${c.green('✓')} All synced to ${c.bold(currentVersion)}`)
    console.log('')
    process.exit(0)
  }

  // 纯查看模式
  console.log('')
  console.log(`  ${c.bold('A7Box Version Info')}`)
  console.log(`  ${'─'.repeat(40)}`)
  console.log(`  package.json:     ${c.cyan(currentVersion)}`)
  console.log(`  Cargo.toml:       ${c.green(cargoVer)} ${c.dim('(in sync)')}`)

  try {
    const conf = readJSON(tauriConfPath)
    if (conf.version) {
      if (conf.version === '../package.json') {
        console.log(`  tauri.conf.json:  ${c.green('(ref package.json)')}`)
      } else {
        const confMatch = conf.version === currentVersion
        console.log(`  tauri.conf.json:  ${confMatch ? c.green(conf.version) : c.red(conf.version)} ${confMatch ? '' : c.yellow('(out of sync!)')}`)
      }
    }
  } catch { /* ignore */ }

  console.log('')
  console.log(`  ${c.dim('Usage: node scripts/sync-version.mjs [patch|minor|major|x.y.z]')}`)
  console.log('')
  process.exit(0)
}

// 计算新版本
const newVersion = bumpVersion(currentVersion, arg)

if (newVersion === currentVersion) {
  console.log(c.yellow(`  Version is already ${currentVersion}, nothing to do.`))
  process.exit(0)
}

console.log('')
console.log(`  ${c.bold('A7Box Version Bump')}`)
console.log(`  ${'─'.repeat(40)}`)
console.log(`  ${c.dim(currentVersion)} → ${c.green(c.bold(newVersion))}  ${c.dim(`(${arg})`)}`)
console.log('')

// 更新 package.json
const oldPkg = updatePkgVersion(newVersion)
console.log(`  ${c.green('✓')} package.json:     ${c.dim(oldPkg)} → ${c.green(newVersion)}`)

// 同步 Cargo.toml
const oldCargo = syncCargo(newVersion)
console.log(`  ${c.green('✓')} Cargo.toml:       ${c.dim(oldCargo)} → ${c.green(newVersion)}`)

// 同步 tauri.conf.json
const oldTauri = syncTauriConf(newVersion)
if (oldTauri !== null) {
  console.log(`  ${c.green('✓')} tauri.conf.json:  ${c.dim(oldTauri)} → ${c.green(newVersion)}`)
}

console.log('')
console.log(`  ${c.green('✓')} All version files synced to ${c.bold(newVersion)}`)
console.log('')

// 提示后续操作
console.log(`  ${c.dim('Next steps:')}`)
console.log(`  ${c.dim('  git add -A && git commit -m "chore: bump version to ' + newVersion + '"')}`)
console.log(`  ${c.dim('  git tag v' + newVersion)}`)
console.log('')
