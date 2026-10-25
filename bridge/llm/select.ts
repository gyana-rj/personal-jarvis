import { ConfigError, type LLMProvider } from './types';
import { GeminiProvider, DEFAULT_GEMINI_MODEL, DEFAULT_SEARCH_MODEL } from './providers/gemini';
import { AnthropicProvider } from './providers/anthropic';
import { MockProvider } from './providers/mock';

export const PROVIDERS = ['gemini', 'anthropic', 'mock'] as const;

/** Builds the provider named by LLM_PROVIDER, failing loudly (and safely) when its key is missing. */
export function selectProvider(env: NodeJS.ProcessEnv, opts: { mcpServers?: Record<string, unknown> } = {}): LLMProvider {
  const name = (env.LLM_PROVIDER || 'gemini').trim().toLowerCase();
  switch (name) {
    case 'gemini': {
      const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new ConfigError(
          'LLM_PROVIDER=gemini but GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey, ' +
            'put it in .env, and restart the bridge. (To use Claude instead set LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY.)',
        );
      }
      return new GeminiProvider({
        apiKey,
        model: env.LLM_MODEL || DEFAULT_GEMINI_MODEL,
        searchModel: env.GEMINI_SEARCH_MODEL || DEFAULT_SEARCH_MODEL,
      });
    }
    case 'anthropic': {
      if (!env.ANTHROPIC_API_KEY) {
        throw new ConfigError(
          'LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set. Add it to .env and restart the bridge, ' +
            'or switch to the free default with LLM_PROVIDER=gemini and GEMINI_API_KEY.',
        );
      }
      return new AnthropicProvider({ model: env.LLM_MODEL || env.JARVIS_MODEL || undefined, mcpServers: opts.mcpServers ?? {} });
    }
    case 'mock':
      return new MockProvider();
    default:
      throw new ConfigError(`Unknown LLM_PROVIDER "${name}". Use one of: ${PROVIDERS.join(', ')}.`);
  }
}
