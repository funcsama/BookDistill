/**
 * Node.js 适配器 - 仅用于 CLI
 */
import * as fs from 'fs';
import * as path from 'path';
import type {
  FileAdapter,
  DOMParserAdapter,
  DocumentAdapter,
  ElementAdapter
} from '../../src/services/parsers/adapters';

export class NodeFileAdapter implements FileAdapter {
  constructor(
    public name: string,
    private buffer: Buffer
  ) {}

  async readAsText(): Promise<string> {
    return this.buffer.toString('utf-8');
  }

  async readAsArrayBuffer(): Promise<ArrayBuffer> {
    const slice = this.buffer.buffer.slice(
      this.buffer.byteOffset,
      this.buffer.byteOffset + this.buffer.byteLength
    );
    return slice as ArrayBuffer;
  }

  static fromPath(filePath: string): NodeFileAdapter {
    const buffer = fs.readFileSync(filePath);
    const name = path.basename(filePath);
    return new NodeFileAdapter(name, buffer);
  }
}

class NodeElementAdapter implements ElementAdapter {
  constructor(private element: any) {} // jsdom Element

  getAttribute(name: string): string | null {
    return this.element.getAttribute(name);
  }

  get textContent(): string | null {
    return this.element.textContent;
  }

  remove(): void {
    this.element.remove();
  }
}

class NodeDocumentAdapter implements DocumentAdapter {
  constructor(private document: any) {} // jsdom Document

  querySelector(selector: string): ElementAdapter | null {
    const el = this.document.querySelector(selector);
    return el ? new NodeElementAdapter(el) : null;
  }

  querySelectorAll(selector: string): ElementAdapter[] {
    const elements = Array.from(this.document.querySelectorAll(selector));
    return elements.map((el: any) => new NodeElementAdapter(el));
  }

  get body(): ElementAdapter | undefined {
    return this.document.body ? new NodeElementAdapter(this.document.body) : undefined;
  }
}

export class NodeDOMParserAdapter implements DOMParserAdapter {
  private JSDOM: any = null;

  private async loadJSDOM() {
    if (!this.JSDOM) {
      const jsdom = await import('jsdom');
      this.JSDOM = jsdom.JSDOM;
    }
  }

  parseFromString(text: string, mimeType: 'text/xml' | 'text/html'): Promise<DocumentAdapter> {
    return this.loadJSDOM().then(() => {
      const dom = new this.JSDOM(text, { contentType: mimeType });
      return new NodeDocumentAdapter(dom.window.document);
    });
  }
}
