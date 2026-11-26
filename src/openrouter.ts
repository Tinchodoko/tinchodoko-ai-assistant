const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';

export const OPENROUTER_TEXT_MODELS = [
  { id: 'baidu/ernie-5.5-flash-preview:free', name: 'ERNIE 5.5 Flash Preview' },
  { id: 'google/gemma-4-26b-a4b-it:free', name: 'Gemma 4 26B A4B' },
  { id: 'inclusionai/ling-3.2-flash:free', name: 'Ling 3.2 Flash' },
] as const;

export const DEFAULT_OPENROUTER_MODEL = OPENROUTER_TEXT_MODELS[0].id;

function parseOpenRouterError(status: number, body: string): string {
  try {
    const data = JSON.parse(body) as { error?: { message?: string; code?: number } };
    if (data.error?.message) return data.error.message;
  } catch {}
  return body || `HTTP ${status}`;
}

async function openRouterFetch(url: string, apiKey: string, init: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-Title': 'Tinchodoko AI Assistant',
      ...(init.headers ?? {}),
    },
  });
}

export async function validateOpenRouterApiKey(apiKey: string): Promise<void> {
  const key = apiKey.trim();
  if (!key) throw new Error('Ingresá una API KEY de OpenRouter.');

  const response = await openRouterFetch(`${OPENROUTER_API_URL}/key`, key, { method: 'GET' });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`OpenRouter rechazó la API KEY: ${parseOpenRouterError(response.status, body)}`);
  }

  try {
    const data = JSON.parse(body) as { data?: { label?: string; usage?: number } };
    if (!data.data) throw new Error('OpenRouter no devolvió información válida de la API KEY.');
  } catch (error) {
    if (error instanceof Error && error.message === 'OpenRouter no devolvió información válida de la API KEY.') throw error;
    throw new Error('Respuesta inválida de OpenRouter al verificar la API KEY.');
  }
}

export async function askOpenRouter(
  apiKey: string,
  question: string,
  model: string = DEFAULT_OPENROUTER_MODEL,
): Promise<string> {
  const key = apiKey.trim();
  if (!key) throw new Error('No hay una API KEY de OpenRouter guardada.');
  if (!OPENROUTER_TEXT_MODELS.some(item => item.id === model)) {
    throw new Error('El modelo seleccionado no está habilitado en esta integración.');
  }

  const response = await openRouterFetch(`${OPENROUTER_API_URL}/chat/completions`, key, {
    method: 'POST',
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Respondé de forma breve y directa. Para operaciones matemáticas simples, devolvé el resultado y nada más.' },
        { role: 'user', content: question },
      ],
      temperature: 0.1,
      max_tokens: 96,
      stream: false,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`OpenRouter rechazó la consulta: ${parseOpenRouterError(response.status, body)}`);
  }

  try {
    const data = JSON.parse(body) as {
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> | null } }>;
    };
    const raw = data.choices?.[0]?.message?.content;
    const answer = typeof raw === 'string'
      ? raw.trim()
      : Array.isArray(raw) ? raw.map(part => part.text ?? '').join('').trim() : '';
    if (!answer) throw new Error('OpenRouter respondió sin contenido.');
    return answer;
  } catch (error) {
    if (error instanceof Error && error.message === 'OpenRouter respondió sin contenido.') throw error;
    throw new Error('Respuesta inválida de OpenRouter.');
  }
}
