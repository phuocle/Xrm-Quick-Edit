/** Translation provider interface */
export interface TranslationProvider {
  name: string;
  requiresApiKey: boolean;
  translate(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    config?: TranslationConfig
  ): Promise<string[]>;
}

/** Config chung cho cac providers */
export interface TranslationConfig {
  apiKey?: string;
  model?: string;          // Gemini model
  customPrompt?: string;   // Gemini custom prompt
}

/** Provider IDs */
export type TranslationProviderId = 'azure' | 'deepl' | 'gemini' | 'glosbe';
