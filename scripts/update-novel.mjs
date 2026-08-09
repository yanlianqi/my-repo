import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const shouldPublish = process.argv.includes("--publish");
const projectRoot = process.cwd();
const configPath = path.join(projectRoot, "novel.config.local.json");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (options.allowExitCodes?.includes(result.status)) return result;
  if (result.status !== 0) {
    if (options.capture) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    process.exit(result.status || 1);
  }
  return result;
}

let config;
try {
  config = JSON.parse(await fs.readFile(configPath, "utf8"));
} catch {
  console.error("找不到 novel.config.local.json。请复制 novel.config.example.json 并填写原稿文件夹路径。");
  process.exit(1);
}

const { sourceDirectory, bookId = "jintian", title = "烬天" } = config;
if (!sourceDirectory) {
  console.error("novel.config.local.json 缺少 sourceDirectory。");
  process.exit(1);
}

console.log(`\n读取原稿：${sourceDirectory}`);
run(process.execPath, ["scripts/import-novel.mjs", sourceDirectory, bookId, title]);

console.log("\n检查网站构建…");
run("npm", ["run", "build"]);

if (!shouldPublish) {
  console.log("\n更新完成。确认内容后运行 npm run publish-novel 发布到 GitHub Pages。");
  process.exit(0);
}

const publicBookPath = `public/books/${bookId}`;
run("git", ["add", publicBookPath]);
const diff = run("git", ["diff", "--cached", "--quiet", "--", publicBookPath], { capture: true, allowExitCodes: [0, 1] });
if (diff.status === 0) {
  console.log("\n没有检测到新的或修改过的章节，无需发布。");
  process.exit(0);
}

const manifest = JSON.parse(await fs.readFile(path.join(projectRoot, publicBookPath, "manifest.json"), "utf8"));
const latest = manifest.chapters.at(-1);
const message = latest ? `发布《${title}》第${latest.number}集：${latest.title}` : `更新《${title}》`;
run("git", ["commit", "-m", message]);

console.log("\n推送并触发 GitHub Pages…");
const push = spawnSync("git", ["push", "origin", "main"], { cwd: projectRoot, encoding: "utf8", stdio: "inherit" });
if (push.status !== 0) {
  console.error("\n推送失败。请先完成 GitHub 登录，然后重新运行 npm run publish-novel。");
  process.exit(push.status || 1);
}

console.log("\n发布完成。GitHub Pages 通常会在几分钟内更新。");
