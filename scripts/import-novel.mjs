import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import mammoth from "mammoth";

const sourcePath = process.argv[2];
const bookId = process.argv[3] || "jintian";
const suppliedTitle = process.argv[4];

if (!sourcePath) {
  console.error('用法：npm run import-novel -- "/路径/小说.docx或分集文件夹" [book-id] [书名]');
  process.exit(1);
}

const CHAPTER_PATTERN = /^(?:第\s*)?([零〇一二三四五六七八九十百千万两\d]+)\s*[章节集回]\s*[：:、.·\-]?\s*(.*)$/;
const VOLUME_PATTERN = /^第\s*[零〇一二三四五六七八九十百千万两\d]+\s*卷\s*[：:、.·\-]?\s*(.*)$/;
const END_MARKER_PATTERN = /^(?:(?:第\s*)?[零〇一二三四五六七八九十百千万两\d]+\s*[章节集回]\s*[·.、：:\-]?\s*)?(?:完|终|结束|全文完|本章完|本集完)$/;

function decodeText(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function chineseNumberToNumber(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const character of value) {
    if (character in digits) digit = digits[character];
    else if (character in units) {
      const unit = units[character];
      if (unit === 10000) {
        total += (section + digit) * unit;
        section = 0;
      } else section += (digit || 1) * unit;
      digit = 0;
    }
  }
  return total + section + digit;
}

function emptyClues() {
  return { realm: "", realmNote: "", characters: "", region: "", location: "", locationNote: "", foreshadow: "", time: "" };
}

function parseHtml(html) {
  const nodes = Array.from(html.matchAll(/<(h1|h2|p)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi));
  const chapters = [];
  let volume = "正文";
  let current = null;

  const save = () => {
    if (current) {
      const { body, ...chapter } = current;
      chapters.push({ ...chapter, html: body.join("") });
    }
  };

  for (const match of nodes) {
    const tag = match[1].toLowerCase();
    const nodeHtml = match[0];
    const text = decodeText(match[2]);
    if (!text || END_MARKER_PATTERN.test(text)) continue;
    const volumeMatch = text.match(VOLUME_PATTERN);
    const chapterMatch = text.match(CHAPTER_PATTERN);
    if ((tag === "h1" || volumeMatch) && volumeMatch) {
      save();
      current = null;
      volume = text;
    } else if (tag === "h2" || chapterMatch) {
      save();
      const number = chapterMatch ? chineseNumberToNumber(chapterMatch[1]) : chapters.length + 1;
      current = {
        id: `${volume.trim().toLowerCase()}::${number}`,
        number,
        title: chapterMatch?.[2]?.trim() || text,
        volume,
        body: [],
        clues: emptyClues(),
      };
    } else if (current) {
      current.body.push(nodeHtml);
    }
  }
  save();
  return chapters.sort((a, b) => a.number - b.number);
}

const resolvedSource = path.resolve(sourcePath);
const sourceStat = await fs.stat(resolvedSource);
const sourceFiles = sourceStat.isDirectory()
  ? (await fs.readdir(resolvedSource))
      .filter((fileName) => fileName.toLowerCase().endsWith(".docx") && !fileName.startsWith("~$"))
      .map((fileName) => path.join(resolvedSource, fileName))
  : [resolvedSource];
const sourceVersion = Math.max(...await Promise.all(sourceFiles.map(async (filePath) => Math.floor((await fs.stat(filePath)).mtimeMs))));

const chapterMap = new Map();
for (const filePath of sourceFiles) {
  const result = await mammoth.convertToHtml(
    { path: filePath },
    { styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Heading 1'] => h1:fresh", "p[style-name='Heading 2'] => h2:fresh"] },
  );
  for (const chapter of parseHtml(result.value)) chapterMap.set(chapter.id, chapter);
}
const chapters = Array.from(chapterMap.values()).sort((a, b) => a.number - b.number);
if (!chapters.length) {
  console.error("没有识别到章节。请使用 Word 标题 2，或采用“第一集 标题”的格式。");
  process.exit(1);
}

const outputRoot = path.resolve("public", "books", bookId);
const chapterRoot = path.join(outputRoot, "chapters");
await fs.mkdir(chapterRoot, { recursive: true });

const manifestChapters = [];
for (const chapter of chapters) {
  const fileName = `${String(chapter.number).padStart(4, "0")}.json`;
  await fs.writeFile(path.join(chapterRoot, fileName), `${JSON.stringify(chapter, null, 2)}\n`, "utf8");
  manifestChapters.push({ number: chapter.number, title: chapter.title, volume: chapter.volume, file: `chapters/${fileName}` });
}

const manifest = {
  id: bookId,
  title: suppliedTitle || path.basename(resolvedSource, path.extname(resolvedSource)),
  version: sourceVersion,
  totalChapters: chapters.length,
  chapters: manifestChapters,
};
await fs.writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`已生成《${manifest.title}》：${chapters.length} 集 → ${outputRoot}`);
