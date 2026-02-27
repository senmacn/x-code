#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const MIN_NODE_MAJOR = 18;
const MIN_NODE_MINOR = 17;
const mode = process.argv[2] || "full";
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const parseNodeVersion = () => {
  const [major, minor] = process.versions.node.split(".").map(Number);
  return { major, minor, raw: process.version };
};

const isNodeVersionOk = () => {
  const { major, minor } = parseNodeVersion();
  if (major > MIN_NODE_MAJOR) return true;
  if (major < MIN_NODE_MAJOR) return false;
  return minor >= MIN_NODE_MINOR;
};

const logNodeVersionError = () => {
  const { raw } = parseNodeVersion();
  console.error(`\n[runtime-check] 当前 Node 版本 ${raw} 不满足要求。`);
  console.error("[runtime-check] Next.js 14 需要 Node >= 18.17.0。");
  console.error("[runtime-check] 建议执行：");
  console.error("  1) nvm use");
  console.error("  2) npm rebuild better-sqlite3\n");
};

const canLoadBetterSqlite = () => {
  const probeCode = [
    'const Database = require("better-sqlite3");',
    'const db = new Database(":memory:");',
    "db.prepare('SELECT 1').get();",
    "db.close();",
  ].join("");
  const result = spawnSync(process.execPath, ["-e", probeCode], { encoding: "utf8" });
  return {
    ok: result.status === 0,
    stderr: result.stderr || "",
  };
};

const isNativeMismatchError = (stderr) =>
  /ERR_DLOPEN_FAILED|NODE_MODULE_VERSION|incompatible architecture/i.test(stderr);

const rebuildBetterSqlite = () => {
  console.log("[runtime-check] 检测到 better-sqlite3 与当前 Node 不兼容，正在尝试自动修复...");
  const rebuild = spawnSync(npmCmd, ["rebuild", "better-sqlite3"], {
    stdio: "inherit",
  });
  return rebuild.status === 0;
};

if (!isNodeVersionOk()) {
  logNodeVersionError();
  process.exit(1);
}

if (mode === "web") {
  process.exit(0);
}

const firstCheck = canLoadBetterSqlite();
if (firstCheck.ok) {
  process.exit(0);
}

if (!isNativeMismatchError(firstCheck.stderr)) {
  console.error("\n[runtime-check] better-sqlite3 加载失败：");
  console.error(firstCheck.stderr.trim() || "未知错误");
  process.exit(1);
}

if (!rebuildBetterSqlite()) {
  console.error("\n[runtime-check] 自动修复失败，请手动执行：npm rebuild better-sqlite3");
  process.exit(1);
}

const secondCheck = canLoadBetterSqlite();
if (!secondCheck.ok) {
  console.error("\n[runtime-check] 重建后仍无法加载 better-sqlite3：");
  console.error(secondCheck.stderr.trim() || "未知错误");
  process.exit(1);
}

console.log("[runtime-check] better-sqlite3 已修复并可正常加载。");
