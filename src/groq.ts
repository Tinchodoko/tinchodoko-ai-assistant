const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';
export const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant';

function parseGroqError(status: number, body: string): string {
  try {
    const data = JSON.parse(body) as { error?: { message?: string } };
    if (data.error?.message) return data.error.message;
  } catch {}
  return body || `HTTP ${status}`;
}

async function groqFetch(
  url: string,
  apiKey: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers ?? {}),
    },
  });
}

export async function validateGroqApiKey(apiKey: string): Promise<void> {
  const key = apiKey.trim();
  if (!key) throw new Error('Ingresá una API KEY de Groq.');

  const response = await groqFetch(GROQ_MODELS_URL, key, { method: 'GET' });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Groq rechazó la conexión: ${parseGroqError(response.status, body)}`);
  }
}

export async function askGroq(
  apiKey: string,
  question: string,
  model: string = DEFAULT_GROQ_MODEL,
): Promise<string> {
  const key = apiKey.trim();
  if (!key) throw new Error('No hay una API KEY de Groq guardada.');

  const response = await groqFetch(GROQ_API_URL, key, {
    method: 'POST',
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'Respondé de forma breve y directa. Para operaciones matemáticas simples, devolvé el resultado y nada más.',
        },
        { role: 'user', content: question },
      ],
      temperature: 0.1,
      max_completion_tokens: 64,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Groq rechazó la consulta: ${parseGroqError(response.status, body)}`);
  }

  try {
    const data = JSON.parse(body) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error('Groq respondió sin contenido.');
    return answer;
  } catch (error) {
    if (error instanceof Error && error.message !== 'Groq respondió sin contenido.') {
      throw new Error('Respuesta inválida de Groq.');
    }
    throw error;
  }
}
