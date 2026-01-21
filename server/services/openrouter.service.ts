import { serverEnv } from '@shared/config/env';

/**
 * OpenRouter API response types (OpenAI-compatible format)
 */
interface IOpenRouterMessage {
  role: 'assistant';
  content: string;
}

interface IOpenRouterChoice {
  message: IOpenRouterMessage;
  finish_reason: string;
}

interface IOpenRouterResponse {
  id: string;
  model: string;
  choices: IOpenRouterChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface IOpenRouterError {
  error: {
    message: string;
    type: string;
    code: string;
  };
}

/**
 * OpenRouter service for Vision-Language model analysis.
 * Uses OpenAI-compatible chat completions API format.
 *
 * @see https://openrouter.ai/docs/api-reference
 */
export class OpenRouterService {
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.apiKey = serverEnv.OPENROUTER_API_KEY;
    this.model = serverEnv.OPENROUTER_VL_MODEL;
  }

  /**
   * Check if OpenRouter is configured with an API key
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Analyze an image using a Vision-Language model via OpenRouter.
   *
   * @param imageDataUrl - Base64 data URL of the image (e.g., "data:image/jpeg;base64,...")
   * @param prompt - Text prompt describing what to analyze
   * @returns The model's text response
   * @throws Error if API call fails
   */
  async analyzeImage(imageDataUrl: string, prompt: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('OpenRouter API key not configured');
    }

    const requestBody = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: imageDataUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 1024,
      temperature: 0.2,
    };

    console.log('[OpenRouter] Sending request to', this.model);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': serverEnv.BASE_URL,
        'X-Title': serverEnv.APP_NAME,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => ({}))) as IOpenRouterError;
      const errorMessage = errorBody.error?.message || response.statusText;
      console.error('[OpenRouter] API error:', response.status, errorMessage);
      throw new Error(`OpenRouter API error: ${response.status} - ${errorMessage}`);
    }

    const data = (await response.json()) as IOpenRouterResponse;

    if (!data.choices?.[0]?.message?.content) {
      console.error('[OpenRouter] Unexpected response format:', data);
      throw new Error('OpenRouter returned empty or invalid response');
    }

    const content = data.choices[0].message.content;

    console.log('[OpenRouter] Response received, tokens used:', data.usage?.total_tokens || 'N/A');

    return content;
  }

  /**
   * Build the request payload for testing/debugging purposes.
   * Does not make an API call.
   */
  buildRequestPayload(
    imageDataUrl: string,
    prompt: string
  ): {
    model: string;
    messages: Array<{
      role: string;
      content: Array<{ type: string; text?: string; image_url?: { url: string } }>;
    }>;
    max_tokens: number;
    temperature: number;
  } {
    return {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: imageDataUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 1024,
      temperature: 0.2,
    };
  }
}
