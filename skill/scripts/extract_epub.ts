#!/usr/bin/env npx tsx
/**
 * Self-contained EPUB text extractor — no AI calls, no external project deps.
 * Requires: jszip, jsdom (auto-installed by npx tsx via package.json or inline import)
 *
 * Usage: npx tsx extract_epub.ts <epub-file>
 * Output: plain text → stdout, title/author/length → stderr
 */
import * as fs from 'fs';
import * as path from 'path';

(async () => {
  const filePath = process.argv[2];
  if (!filePath) {
    process.stderr.write(`Usage: npx tsx ${process.argv[1]} <epub-file>\n`);
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  const buffer = fs.readFileSync(absPath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

  // Load jszip
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(arrayBuffer);

  // Load jsdom
  const { JSDOM } = await import('jsdom');
  const parse = (text: string, mime: 'text/xml' | 'text/html') =>
    new JSDOM(text, { contentType: mime }).window.document;

  // Find OPF path from container.xml
  const containerXml = await loadedZip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('Invalid EPUB: missing container.xml');
  const containerDoc = parse(containerXml, 'text/xml');
  const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('Invalid EPUB: cannot find OPF path');

  // Parse OPF
  const opfContent = await loadedZip.file(opfPath)?.async('string');
  if (!opfContent) throw new Error('Invalid EPUB: OPF file missing');
  const opfDoc = parse(opfContent, 'text/xml');

  const title = opfDoc.querySelector('metadata > title, metadata title')?.textContent
    || path.basename(absPath, '.epub');
  const author = opfDoc.querySelector('metadata > creator, metadata creator')?.textContent || 'Unknown';

  // Build manifest map
  const manifestMap = new Map<string, string>();
  opfDoc.querySelectorAll('manifest > item, manifest item').forEach(item => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) manifestMap.set(id, href);
  });

  // Follow spine order
  const opfFolder = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/')) : '';
  const resolvePath = (href: string) => opfFolder ? `${opfFolder}/${href}` : href;

  let fullText = '';
  for (const itemref of Array.from(opfDoc.querySelectorAll('spine > itemref, spine itemref'))) {
    const idref = itemref.getAttribute('idref');
    if (!idref) continue;
    const href = manifestMap.get(idref);
    if (!href) continue;
    const content = await loadedZip.file(resolvePath(href))?.async('string');
    if (!content) continue;
    const doc = parse(content, 'text/html');
    doc.querySelectorAll('script, style').forEach(el => el.remove());
    const text = doc.body?.textContent || '';
    fullText += text.replace(/\s+/g, ' ').trim() + '\n\n';
  }

  process.stderr.write(`Title: ${title}\nAuthor: ${author}\nLength: ${fullText.length} chars\n`);
  process.stdout.write(fullText);
})();
