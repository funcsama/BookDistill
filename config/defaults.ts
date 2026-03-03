/**
 * 共享配置 - Web 和 CLI 通用
 */

export const LANGUAGES = [
  { code: 'Chinese', label: '中文 (Chinese)' },
  { code: 'English', label: 'English' },
  { code: 'Japanese', label: '日本語 (Japanese)' },
  { code: 'Korean', label: '한국어 (Korean)' },
  { code: 'Spanish', label: 'Español (Spanish)' },
  { code: 'French', label: 'Français (French)' },
  { code: 'German', label: 'Deutsch (German)' },
] as const;

export const MODELS = [
  { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro (Smart)', shortName: 'Pro 3.0' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Fast)', shortName: 'Flash 2.5' },
] as const;

// 默认配置
export const DEFAULTS = {
  LANGUAGE: LANGUAGES[0].code,  // 'Chinese'
  MODEL: MODELS[0].id,          // 'gemini-3-pro-preview'
  TEMPERATURE: 0.3,
  CONTEXT_WINDOW_CHAR_LIMIT: 3500000, // ~875k tokens
} as const;

// Gemini 系统指令模板
export const SYSTEM_INSTRUCTION_TEMPLATE = (language: string) => `
Expert Book Distiller.
Task: Extract detailed knowledge and insights from the provided book.
Constraint 1: Output MUST be in ${language} language.
Constraint 2: Use clean Markdown formatting.
`.trim();
