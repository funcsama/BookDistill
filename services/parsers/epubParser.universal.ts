/**
 * 通用 EPUB 解析器 - 支持浏览器和 Node.js
 */
import JSZip from 'jszip';
import { FileAdapter, DOMParserAdapter } from './adapters';
import { FileFormat, ParseResult, ParseError } from '../../types';

export interface EpubParserOptions {
  domParser: DOMParserAdapter;
}

/**
 * 纯函数 EPUB 解析逻辑 - 环境无关
 */
export async function parseEpubFile(
  file: FileAdapter,
  options: EpubParserOptions
): Promise<ParseResult> {
  try {
    const { domParser } = options;
    const arrayBuffer = await file.readAsArrayBuffer();

    // 1. 加载 ZIP
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(arrayBuffer);

    // 2. 查找 OPF 路径
    const containerXml = await loadedZip.file("META-INF/container.xml")?.async("string");
    if (!containerXml) {
      throw new Error("Invalid EPUB: Missing container.xml");
    }

    const containerDoc = await Promise.resolve(domParser.parseFromString(containerXml, "text/xml"));
    const rootFile = containerDoc.querySelector("rootfile");
    const opfPath = rootFile?.getAttribute("full-path");
    if (!opfPath) {
      throw new Error("Invalid EPUB: Cannot find OPF path");
    }

    // 3. 读取 OPF
    const opfContent = await loadedZip.file(opfPath)?.async("string");
    if (!opfContent) {
      throw new Error("Invalid EPUB: OPF file missing");
    }

    const opfDoc = await Promise.resolve(domParser.parseFromString(opfContent, "text/xml"));

    // 4. 提取元数据
    const title = opfDoc.querySelector("metadata > title, metadata title")?.textContent
      || file.name.replace('.epub', '');
    const author = opfDoc.querySelector("metadata > creator, metadata creator")?.textContent
      || undefined;

    // 5. 构建 manifest 映射
    const manifestItems = opfDoc.querySelectorAll("manifest > item, manifest item");
    const manifestMap = new Map<string, string>();
    manifestItems.forEach(item => {
      const id = item.getAttribute("id");
      const href = item.getAttribute("href");
      if (id && href) {
        manifestMap.set(id, href);
      }
    });

    // 6. 获取 spine 阅读顺序
    const spineItems = opfDoc.querySelectorAll("spine > itemref, spine itemref");

    // 解析相对路径
    const opfFolder = opfPath.substring(0, opfPath.lastIndexOf('/'));
    const resolvePath = (href: string) => {
      if (opfFolder === "") return href;
      return `${opfFolder}/${href}`;
    };

    // 7. 提取章节文本
    let fullText = "";

    for (const item of spineItems) {
      const idref = item.getAttribute("idref");
      if (!idref) continue;

      const href = manifestMap.get(idref);
      if (!href) continue;

      const fullPath = resolvePath(href);
      const fileContent = await loadedZip.file(fullPath)?.async("string");

      if (fileContent) {
        const doc = await Promise.resolve(domParser.parseFromString(fileContent, "text/html"));

        // 移除脚本和样式
        const scriptsAndStyles = doc.querySelectorAll("script, style");
        scriptsAndStyles.forEach(el => el.remove());

        const text = doc.body?.textContent || "";
        fullText += text.replace(/\s+/g, ' ').trim() + "\n\n";
      }
    }

    return {
      text: fullText,
      title,
      author,
      format: FileFormat.EPUB,
    };

  } catch (error) {
    throw new ParseError(
      `EPUB parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      FileFormat.EPUB,
      error instanceof Error ? error : undefined
    );
  }
}
