#!/usr/bin/env npx tsx
/**
 * BookDistill CLI
 *
 * Usage:
 *   GEMINI_API_KEY=xxx npx tsx cli/distill.ts -i book.epub -o summary.md
 *   GEMINI_API_KEY=xxx npx tsx cli/distill.ts -i book.epub  # outputs to stdout
 *
 * Options:
 *   -i, --input    Input file (epub, md, pdf)
 *   -o, --output   Output file (optional, defaults to stdout)
 *   -l, --lang     Output language (default: Chinese)
 *   -m, --model    Gemini model (default: gemini-3-pro-preview)
 *   -h, --help     Show help
 */

import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';
import { DEFAULTS, LANGUAGES, MODELS, SYSTEM_INSTRUCTION_TEMPLATE } from '../config/defaults';
import { NodeFileAdapter, NodeDOMParserAdapter } from './adapters/nodeAdapters';
import { parseEpubFile } from '../services/parsers/epubParser.universal';
import { parseMarkdownFile } from '../services/parsers/markdownParser.universal';

// ============ Minimal argument parser ============
interface Args {
  input?: string;
  output?: string;
  lang: string;
  model: string;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    lang: DEFAULTS.LANGUAGE,
    model: DEFAULTS.MODEL,
    help: false,
  };
  
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    
    switch (arg) {
      case '-i':
      case '--input':
        args.input = next;
        i++;
        break;
      case '-o':
      case '--output':
        args.output = next;
        i++;
        break;
      case '-l':
      case '--lang':
        args.lang = next;
        i++;
        break;
      case '-m':
      case '--model':
        args.model = next;
        i++;
        break;
      case '-h':
      case '--help':
        args.help = true;
        break;
    }
  }
  
  return args;
}

function showHelp() {
  const languageList = LANGUAGES.map(l => l.code).join(', ');
  const modelList = MODELS.map(m => `${m.id} (${m.shortName})`).join(', ');

  console.log(`
BookDistill CLI - Extract knowledge from books using Gemini

Usage:
  GEMINI_API_KEY=xxx npx tsx cli/distill.ts -i <file> [options]

Options:
  -i, --input <file>    Input file (epub, md, markdown)
  -o, --output <file>   Output markdown file (default: stdout)
  -l, --lang <lang>     Output language (default: ${DEFAULTS.LANGUAGE})
                        Available: ${languageList}
  -m, --model <model>   Gemini model (default: ${DEFAULTS.MODEL})
                        Available: ${modelList}
  -h, --help            Show this help

Environment:
  GEMINI_API_KEY        Required. Your Gemini API key.

Examples:
  # Basic usage (uses default model: ${DEFAULTS.MODEL})
  GEMINI_API_KEY=xxx npx tsx cli/distill.ts -i book.epub -o summary.md

  # Use faster model
  GEMINI_API_KEY=xxx npx tsx cli/distill.ts -i book.epub -m gemini-2.5-flash

  # Output in English
  GEMINI_API_KEY=xxx npx tsx cli/distill.ts -i book.epub -l English
`);
}

// ============ File Parsers (复用 Web 端解析器) ============

async function parseFile(filePath: string): Promise<{ text: string; title: string; author?: string }> {
  const ext = path.extname(filePath).toLowerCase();
  const fileAdapter = NodeFileAdapter.fromPath(filePath);

  switch (ext) {
    case '.epub': {
      const domParser = new NodeDOMParserAdapter();
      const result = await parseEpubFile(fileAdapter, { domParser });
      return { text: result.text, title: result.title, author: result.author };
    }
    case '.md':
    case '.markdown': {
      const result = await parseMarkdownFile(fileAdapter);
      return { text: result.text, title: result.title, author: result.author };
    }
    default:
      throw new Error(`Unsupported format: ${ext}. Supported: .epub, .md, .markdown`);
  }
}

// ============ Gemini API ============

async function generateSummary(
  text: string,
  title: string,
  author: string,
  language: string,
  modelId: string,
  apiKey: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  // Use shared system instruction template
  const systemInstruction = SYSTEM_INSTRUCTION_TEMPLATE(language);

  process.stderr.write(`Sending to ${modelId} (${(text.length / 1000).toFixed(0)}k chars)...\n`);

  const response = await ai.models.generateContent({
    model: modelId,
    contents: [
      {
        role: 'user',
        parts: [{ text: `Title: ${title}\nAuthor: ${author}\n\n${text}` }],
      },
    ],
    config: {
      temperature: DEFAULTS.TEMPERATURE,
      systemInstruction,
    },
  });

  return response.text || '';
}

// ============ Main ============

async function main() {
  const args = parseArgs(process.argv);
  
  if (args.help || !args.input) {
    showHelp();
    process.exit(args.help ? 0 : 1);
  }
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY environment variable is required');
    process.exit(1);
  }
  
  if (!fs.existsSync(args.input)) {
    console.error(`Error: Input file not found: ${args.input}`);
    process.exit(1);
  }
  
  try {
    // Parse input file
    process.stderr.write(`Parsing ${args.input}...\n`);
    const { text, title, author } = await parseFile(args.input);
    process.stderr.write(`Extracted: "${title}" by ${author || 'Unknown'} (${(text.length / 1000).toFixed(0)}k chars)\n`);
    
    // Check size limit
    if (text.length > DEFAULTS.CONTEXT_WINDOW_CHAR_LIMIT) {
      console.error(`Error: Book too long (${(text.length / 1_000_000).toFixed(1)}M chars). Max: ${DEFAULTS.CONTEXT_WINDOW_CHAR_LIMIT / 1_000_000}M`);
      process.exit(1);
    }
    
    // Generate summary
    const summary = await generateSummary(text, title, author || 'Unknown', args.lang, args.model, apiKey);
    
    // Output
    if (args.output) {
      fs.writeFileSync(args.output, summary, 'utf-8');
      process.stderr.write(`Written to ${args.output}\n`);
    } else {
      process.stdout.write(summary);
    }
    
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
