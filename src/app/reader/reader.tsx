"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import * as mammoth from "mammoth";
import styles from "./reader.module.css";
import { loadLibrary, saveLibrary } from "./storage";

type ChapterClues = {
  realm: string;
  realmNote: string;
  characters: string;
  region: string;
  location: string;
  locationNote: string;
  foreshadow: string;
  time: string;
};

type Chapter = {
  id: string;
  number: number;
  title: string;
  volume: string;
  html: string;
  clues: ChapterClues;
};

type ImportMode = "append" | "replace";

type PublishedManifest = {
  title: string;
  version: number;
  chapters: Array<{ file: string }>;
};

const emptyClues = (): ChapterClues => ({
  realm: "",
  realmNote: "",
  characters: "",
  region: "",
  location: "",
  locationNote: "",
  foreshadow: "",
  time: "",
});

const SAMPLE_CHAPTERS: Chapter[] = [
  {
    id: "sample-1",
    number: 1,
    title: "山河之外",
    volume: "第一卷 · 白石镇篇",
    html: `<p>天玄历四千七百二十一年，冬。</p><p>那一年，大雪下了整整十三日。</p><p>雪从北方黑云深处落下，越过横亘三千里的苍莽山脉，覆过大虞王朝十九州，最后落在青州最北边一个连地图上都很难找到的小地方。</p><p>那里叫——白石镇。</p><p>镇外有山。山名大青。</p><p>他们不知道，在距离此地一千七百里之外，有仙人御剑横渡长河。更不知道，在他们头顶那片看似寻常的天空之外，还有一座座悬浮于云海之间的仙山。</p><p>而传说中真正走到修行尽头的人，甚至可以渡过天地大劫，肉身不朽，元神不灭。</p><p class="emphasis">世人将那种境界称作——大成。</p>`,
    clues: { ...emptyClues(), realm: "凡人境", realmNote: "尚未引气入体", characters: "林川｜初生\n林守山｜父亲 · 樵夫\n沈芸｜母亲", region: "青州北境", location: "白石镇", locationNote: "大青山下 · 大虞王朝", foreshadow: "黑色石碑在积雪下苏醒。", time: "天玄历 · 冬" },
  },
  {
    id: "sample-2",
    number: 2,
    title: "雪中仙人",
    volume: "第一卷 · 白石镇篇",
    html: `<p>第二日。</p><p>雪停了。</p><p>白石镇被埋在一片苍白之中。屋檐下垂着长长的冰棱，街上的积雪已经没过脚踝。</p><p>林川醒的时候，母亲已经在灶房生火。柴火噼啪作响，粥的香气从门缝里飘来。</p><p>昨晚的那个声音，又在他脑海里响了一遍。</p><p class="emphasis">来。</p><p>只有一个字。不像是在耳边响起，更像是直接落进了脑子里。</p><p>他并不知道，一条通往山河之外的路，已经在雪中向他打开。</p>`,
    clues: { ...emptyClues(), realm: "凡人境", realmNote: "尚未引气入体", characters: "林川｜八岁 · 沉静寡言\n林守山｜父亲 · 樵夫\n灰袍老人｜身份未知", region: "青州北境", location: "白石镇", locationNote: "大青山下 · 大虞王朝", foreshadow: "“七百年了。它终于又开始找人了。”", time: "天玄历 · 冬" },
  },
];

const CHAPTER_PATTERN = /^(?:第\s*)?([零〇一二三四五六七八九十百千万两\d]+)\s*[章节集回]\s*[：:、.·\-]?\s*(.*)$/;
const VOLUME_PATTERN = /^第\s*[零〇一二三四五六七八九十百千万两\d]+\s*卷\s*[：:、.·\-]?\s*(.*)$/;
const END_MARKER_PATTERN = /^(?:(?:第\s*)?[零〇一二三四五六七八九十百千万两\d]+\s*[章节集回]\s*[·.、：:\-]?\s*)?(?:完|终|结束|全文完|本章完|本集完)$/;

function textOf(element: Element) {
  return (element.textContent || "").replace(/\s+/g, " ").trim();
}

function chineseNumberToNumber(value: string): number | null {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const character of value) {
    if (character in digits) {
      digit = digits[character];
    } else if (character in units) {
      const unit = units[character];
      if (unit === 10000) {
        section = (section + digit) * unit;
        total += section;
        section = 0;
      } else {
        section += (digit || 1) * unit;
      }
      digit = 0;
    } else {
      return null;
    }
  }
  return total + section + digit || null;
}

function chapterId(volume: string, number: number) {
  return `${volume.trim().toLowerCase()}::${number}`;
}

function parseDocxHtml(html: string): Chapter[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const nodes = Array.from(document.body.children);
  const chapters: Chapter[] = [];
  let volume = "正文";
  let currentTitle = "";
  let currentNumber: number | null = null;
  let currentNodes: string[] = [];

  const save = () => {
    if (!currentTitle) return;
    const number = currentNumber ?? chapters.length + 1;
    chapters.push({
      id: chapterId(volume, number),
      number,
      title: currentTitle,
      volume,
      html: currentNodes.join(""),
      clues: emptyClues(),
    });
  };

  nodes.forEach((node) => {
    const text = textOf(node);
    if (!text) return;
    const tag = node.tagName.toLowerCase();
    const volumeMatch = text.match(VOLUME_PATTERN);
    const chapterMatch = text.match(CHAPTER_PATTERN);
    const isVolume = tag === "h1" || Boolean(volumeMatch);
    const isChapter = tag === "h2" || Boolean(chapterMatch);

    if (END_MARKER_PATTERN.test(text)) {
      return;
    }
    if (isVolume && volumeMatch) {
      save();
      currentTitle = "";
      currentNumber = null;
      currentNodes = [];
      volume = text;
    } else if (isChapter) {
      save();
      currentTitle = chapterMatch?.[2]?.trim() || text;
      currentNumber = chapterMatch ? chineseNumberToNumber(chapterMatch[1]) : null;
      currentNodes = [];
    } else if (currentTitle) {
      currentNodes.push(node.outerHTML);
    }
  });
  save();
  return chapters.sort((a, b) => a.number - b.number);
}

function mergeChapters(existing: Chapter[], incoming: Chapter[]) {
  const merged = new Map(existing.map((chapter) => [chapter.id, chapter]));
  let updated = 0;
  incoming.forEach((chapter) => {
    const previous = merged.get(chapter.id);
    if (previous) updated += 1;
    merged.set(chapter.id, { ...chapter, clues: previous?.clues || chapter.clues });
  });
  return {
    chapters: Array.from(merged.values()).sort((a, b) => a.number - b.number),
    updated,
  };
}

async function loadPublishedBook(): Promise<{ title: string; version: number; chapters: Chapter[] } | null> {
  try {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const response = await fetch(`${basePath}/books/jintian/manifest.json`, { cache: "no-store" });
    if (!response.ok) return null;
    const manifest = await response.json() as PublishedManifest;
    const chapters = await Promise.all(manifest.chapters.map(async ({ file }) => {
      const chapterResponse = await fetch(`${basePath}/books/jintian/${file}`, { cache: "no-store" });
      if (!chapterResponse.ok) throw new Error("Failed to load a published chapter");
      return chapterResponse.json() as Promise<Chapter>;
    }));
    return { title: manifest.title, version: manifest.version, chapters };
  } catch {
    return null;
  }
}

export default function Reader() {
  const [chapters, setChapters] = useState<Chapter[]>(SAMPLE_CHAPTERS);
  const [activeChapterId, setActiveChapterId] = useState(SAMPLE_CHAPTERS[1].id);
  const [sourceNames, setSourceNames] = useState<string[]>([]);
  const [builtInVersion, setBuiltInVersion] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("append");
  const [editingClues, setEditingClues] = useState(false);
  const [notice, setNotice] = useState("");
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    Promise.all([loadLibrary<Chapter>(), loadPublishedBook()])
      .then(([library, published]) => {
        if (library?.chapters.length) {
          const shouldUpdatePublishedBook = Boolean(library.builtInVersion && published && published.version > library.builtInVersion);
          const restoredChapters = shouldUpdatePublishedBook ? mergeChapters(library.chapters, published!.chapters).chapters : library.chapters;
          setChapters(restoredChapters);
          setActiveChapterId(library.activeChapterId || library.chapters[0].id);
          setSourceNames(library.sourceNames || []);
          setBuiltInVersion(shouldUpdatePublishedBook ? published!.version : library.builtInVersion || 0);
        } else if (published?.chapters.length) {
          setChapters(published.chapters);
          setActiveChapterId(published.chapters[0].id);
          setSourceNames([`《${published.title}》·网站内置`]);
          setBuiltInVersion(published.version);
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated || !sourceNames.length) return;
    const timer = window.setTimeout(() => {
      void saveLibrary({ chapters, activeChapterId, sourceNames, builtInVersion });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [chapters, activeChapterId, sourceNames, builtInVersion, hydrated]);

  const activeIndex = Math.max(0, chapters.findIndex((chapter) => chapter.id === activeChapterId));
  const current = chapters[activeIndex] || chapters[0];
  const filtered = useMemo(
    () => chapters.filter((chapter) => `${chapter.number}${chapter.title}${chapter.volume}`.toLowerCase().includes(query.toLowerCase())),
    [chapters, query],
  );
  const fileLabel = sourceNames.length ? `${sourceNames.length} 个本地原稿` : "演示内容 · 《烬天》";
  const characterLines = current?.clues.characters.split("\n").filter(Boolean) || [];

  const selectChapter = (chapter: Chapter) => {
    setActiveChapterId(chapter.id);
    setEditingClues(false);
    setMenuOpen(false);
    articleRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const updateClue = (field: keyof ChapterClues, value: string) => {
    setChapters((items) => items.map((chapter) => chapter.id === current.id ? { ...chapter, clues: { ...chapter.clues, [field]: value } } : chapter));
  };

  const importDocx = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setNotice("请选择 .docx 格式的 Word 文档");
      return;
    }
    setNotice("正在本地识别章节…");
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        { styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Heading 1'] => h1:fresh", "p[style-name='Heading 2'] => h2:fresh"] },
      );
      const parsed = parseDocxHtml(result.value);
      if (!parsed.length) {
        setNotice("没有识别到章节。请给章节使用“标题 2”，或采用“第一章 标题”的格式。");
        return;
      }

      const shouldReplace = importMode === "replace" || sourceNames.length === 0;
      if (shouldReplace) {
        setChapters(parsed);
        setActiveChapterId(parsed[0].id);
        setSourceNames([file.name]);
        setBuiltInVersion(0);
        setNotice(`已导入 ${parsed.length} 集。原稿仅保存在此浏览器。`);
      } else {
        const merged = mergeChapters(chapters, parsed);
        setChapters(merged.chapters);
        setActiveChapterId(parsed[0].id);
        setSourceNames((names) => Array.from(new Set([...names, file.name])));
        setNotice(`已添加 ${parsed.length} 集${merged.updated ? `，并更新 ${merged.updated} 个同集数章节` : ""}。`);
      }
    } catch {
      setNotice("读取失败，请确认文件未损坏且格式为 DOCX。");
    }
  };

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <button className={styles.mobileButton} onClick={() => setMenuOpen(true)} aria-label="打开目录">目</button>
        <div className={styles.brand}><span className={styles.seal}>烬</span><div><strong>烬天</strong><small>JINTIAN READER</small></div></div>
        <div className={styles.bookStatus}><span>{fileLabel}</span><i>{sourceNames.length ? "已保存在此浏览器" : "导入后自动保存"}</i></div>
        <button className={styles.importButton} onClick={() => { setNotice(""); setImportOpen(true); }}><span>＋</span> 导入原稿</button>
        <button className={styles.mobileButton} onClick={() => setInfoOpen(true)} aria-label="打开设定">设</button>
      </header>

      <div className={styles.workspace}>
        <aside className={`${styles.navigator} ${menuOpen ? styles.open : ""}`}>
          <div className={styles.panelHeader}><div><small>目录</small><strong>{chapters.length} 集</strong></div><button onClick={() => setMenuOpen(false)}>×</button></div>
          <label className={styles.search}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索集数或标题" /><kbd>⌘ K</kbd></label>
          <div className={styles.volumeTitle}><span>{current?.volume || "正文"}</span><small>{current?.clues.realm || "未标注"}</small></div>
          <nav className={styles.chapterList} aria-label="章节目录">
            {filtered.map((chapter) => {
              const realIndex = chapters.indexOf(chapter);
              const active = chapter.id === current.id;
              return (
                <button key={chapter.id} className={active ? styles.activeChapter : ""} onClick={() => selectChapter(chapter)}>
                  <span className={styles.chapterNumber}>{String(chapter.number).padStart(2, "0")}</span>
                  <span><strong>{chapter.title}</strong><small>{realIndex < activeIndex ? "已读" : active ? "阅读中" : "未读"}</small></span>
                  <i>{realIndex < activeIndex ? "✓" : active ? "◆" : ""}</i>
                </button>
              );
            })}
          </nav>
          <div className={styles.progressBlock}><div><span>阅读进度</span><strong>{Math.round(((activeIndex + 1) / chapters.length) * 100)}%</strong></div><div className={styles.progressTrack}><i style={{ width: `${((activeIndex + 1) / chapters.length) * 100}%` }} /></div><small>{sourceNames.length ? "正文与进度已保存在此浏览器" : "当前为演示内容"}</small></div>
        </aside>

        <article className={styles.reader} ref={articleRef}>
          <div className={styles.snow} aria-hidden="true" />
          <div className={styles.readingColumn} key={current?.id}>
            <div className={styles.eyebrow}><span>{current?.volume}</span><i /><span>第 {current?.number} 集</span></div>
            <h1>{current?.title}</h1>
            {(current?.clues.time || current?.clues.location) && <div className={styles.chapterMeta}><span>{current.clues.time}</span>{current.clues.time && current.clues.location && <b>◇</b>}<span>{current.clues.location}</span></div>}
            <div className={styles.prose} dangerouslySetInnerHTML={{ __html: current?.html || "" }} />
            <div className={styles.chapterEnd}>此集 · 完</div>
            <div className={styles.pageNav}>
              <button
                disabled={activeIndex === 0}
                onClick={() => selectChapter(chapters[activeIndex - 1])}
                aria-label={activeIndex === 0 ? "已经是第一集" : `上一集：${chapters[activeIndex - 1]?.title}`}
              >
                <b aria-hidden="true">←</b><span>上一集</span>
              </button>
              <span>{activeIndex + 1} / {chapters.length}</span>
              <button
                disabled={activeIndex === chapters.length - 1}
                onClick={() => selectChapter(chapters[activeIndex + 1])}
                aria-label={activeIndex === chapters.length - 1 ? "已经是最后一集" : `下一集：${chapters[activeIndex + 1]?.title}`}
              >
                <span>下一集</span><b aria-hidden="true">→</b>
              </button>
            </div>
          </div>
        </article>

        <aside className={`${styles.context} ${infoOpen ? styles.open : ""}`}>
          <div className={styles.panelHeader}>
            <div><small>本集线索</small><strong>{current?.title}</strong></div>
            <button onClick={() => setInfoOpen(false)}>×</button>
          </div>
          <button className={styles.editClues} onClick={() => setEditingClues((value) => !value)}>{editingClues ? "完成编辑" : "编辑线索"}</button>
          {editingClues ? (
            <div className={styles.clueEditor}>
              <label>境界<input value={current?.clues.realm || ""} onChange={(event) => updateClue("realm", event.target.value)} placeholder="例如：凡人境" /></label>
              <label>境界说明<input value={current?.clues.realmNote || ""} onChange={(event) => updateClue("realmNote", event.target.value)} placeholder="尚未引气入体" /></label>
              <label>出场人物<textarea value={current?.clues.characters || ""} onChange={(event) => updateClue("characters", event.target.value)} placeholder={'每行一人，例如：\n林川｜八岁 · 沉静寡言'} /></label>
              <label>区域<input value={current?.clues.region || ""} onChange={(event) => updateClue("region", event.target.value)} placeholder="青州北境" /></label>
              <label>地点<input value={current?.clues.location || ""} onChange={(event) => updateClue("location", event.target.value)} placeholder="白石镇" /></label>
              <label>地点说明<input value={current?.clues.locationNote || ""} onChange={(event) => updateClue("locationNote", event.target.value)} placeholder="大青山下 · 大虞王朝" /></label>
              <label>时间<input value={current?.clues.time || ""} onChange={(event) => updateClue("time", event.target.value)} placeholder="天玄历 · 冬" /></label>
              <label>伏笔<textarea value={current?.clues.foreshadow || ""} onChange={(event) => updateClue("foreshadow", event.target.value)} placeholder="记录本集伏笔" /></label>
            </div>
          ) : (
            <>
              <section><h2>境界</h2>{current?.clues.realm ? <div className={styles.realm}><span>{current.clues.realm.charAt(0)}</span><div><strong>{current.clues.realm}</strong><small>{current.clues.realmNote || "暂无说明"}</small></div></div> : <p className={styles.emptyClue}>尚未整理</p>}</section>
              <section><h2>出场人物</h2>{characterLines.length ? <ul className={styles.clueList}>{characterLines.map((line) => { const [name, detail] = line.split("｜"); return <li key={line}><span>{name}</span><small>{detail || "暂无说明"}</small></li>; })}</ul> : <p className={styles.emptyClue}>尚未整理</p>}</section>
              <section><h2>地点</h2>{current?.clues.location ? <div className={styles.location}><span>{current.clues.region}</span><strong>{current.clues.location}</strong><small>{current.clues.locationNote}</small></div> : <p className={styles.emptyClue}>尚未整理</p>}</section>
              <section><h2>伏笔</h2>{current?.clues.foreshadow ? <blockquote>{current.clues.foreshadow}</blockquote> : <p className={styles.emptyClue}>尚未整理</p>}</section>
              <p className={styles.spoiler}>线索由你编辑，不会自动发送给 AI</p>
            </>
          )}
        </aside>
      </div>

      {(menuOpen || infoOpen) && <button className={styles.backdrop} onClick={() => { setMenuOpen(false); setInfoOpen(false); }} aria-label="关闭面板" />}

      {importOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setImportOpen(false)}>
          <section className={styles.importModal} role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className={styles.closeModal} onClick={() => setImportOpen(false)}>×</button>
            <span className={styles.modalSeal}>文</span><small>本地导入</small><h2 id="import-title">打开小说原稿</h2>
            <p>文档仅在浏览器中解析并保存。结束语“第一集·完”不会再被识别为新章节。</p>
            <div className={styles.modeSwitch}>
              <button className={importMode === "append" ? styles.selectedMode : ""} onClick={() => setImportMode("append")}><strong>添加章节</strong><small>保留现有内容</small></button>
              <button className={importMode === "replace" ? styles.selectedMode : ""} onClick={() => setImportMode("replace")}><strong>替换整本</strong><small>清除现有目录</small></button>
            </div>
            <label className={styles.fileDrop}><input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={importDocx} /><span>选择 DOCX 文件</span><small>推荐小于 50 MB</small></label>
            {notice && <div className={styles.notice}>{notice}</div>}
          </section>
        </div>
      )}
    </main>
  );
}
