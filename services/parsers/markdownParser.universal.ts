/**
 * 通用 Markdown 解析器 - 支持浏览器和 Node.js
 */
import { FileAdapter } from './adapters';
import { FileFormat, ParseResult, ParseError } from '../../types';

/**
 * 解析 YAML Frontmatter
 */
function parseFrontmatter(text: string): {
  content: string;
  metadata: { title?: string; author?: string };
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = text.match(frontmatterRegex);

  if (!match) {
    // 无 Frontmatter,整个文件作为内容
    return { content: text, metadata: {} };
  }

  const [, frontmatter, content] = match;
  const metadata: { title?: string; author?: string } = {};

  // 简单解析 YAML (仅支持 title 和 author)
  const titleMatch = frontmatter.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
  const authorMatch = frontmatter.match(/^author:\s*['"]?(.+?)['"]?\s*$/m);

  if (titleMatch) metadata.title = titleMatch[1].trim();
  if (authorMatch) metadata.author = authorMatch[1].trim();

  return { content: content.trim(), metadata };
}

/**
 * 纯函数 Markdown 解析逻辑 - 环境无关
 */
export async function parseMarkdownFile(
  file: FileAdapter
): Promise<ParseResult> {
  try {
    const text = await file.readAsText();
    const { content, metadata } = parseFrontmatter(text);

    // 从文件名提取默认标题
    const defaultTitle = file.name.replace(/\.md(arkdown)?$/i, '');

    return {
      text: content,
      title: metadata.title || defaultTitle,
      author: metadata.author,
      format: FileFormat.MARKDOWN,
    };

  } catch (error) {
    throw new ParseError(
      `Markdown parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      FileFormat.MARKDOWN,
      error instanceof Error ? error : undefined
    );
  }
}
