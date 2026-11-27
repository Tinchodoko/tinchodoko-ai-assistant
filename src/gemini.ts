const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

function parseGeminiError(status: number, body: string): string {
  try {
    const data = JSON.parse(body) as { error?: { message?: string } };
    if (data.error?.message) return data.error.message;
  } catch {}
  return body || `HTTP ${status}`;
}

async function geminiFetch(
  url: string,
  apiKey: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
      ...(init.headers ?? {}),
    },
  });
}

export async function validateGeminiApiKey(apiKey: string): Promise<void> {
  const key = apiKey.trim();
  if (!key) throw new Error('Ingresá una API KEY de Gemini.');

  const response = await geminiFetch(`${GEMINI_API_URL}/${GEMINI_MODEL}`, key, { method: 'GET' });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini rechazó la conexión: ${parseGeminiError(response.status, body)}`);
  }

  try {
    const data = JSON.parse(body) as { name?: string };
    if (!data.name) throw new Error('Gemini respondió sin información del modelo.');
  } catch (error) {
    if (error instanceof Error && error.message !== 'Gemini respondió sin información del modelo.') {
      throw new Error('Respuesta inválida de Gemini al consultar el modelo.');
    }
    throw error;
  }
}

export async function askGemini(
  apiKey: string,
  question: string,
): Promise<string> {
  const key = apiKey.trim();
  if (!key) throw new Error('No hay una API KEY de Gemini guardada.');

  const response = await geminiFetch(`${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent`, key, {
    method: 'POST',
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: 'Respondé de forma breve y directa. Para análisis estructurados, devolvé únicamente el JSON solicitado, completo y sin explicaciones adicionales. Para operaciones matemáticas simples, devolvé el resultado y nada más.',
          },
        ],
      },
      contents: [
        {
          parts: [{ text: question }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 256,
      },
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini rechazó la consulta: ${parseGeminiError(response.status, body)}`);
  }

  try {
    const data = JSON.parse(body) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const answer = data.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('').trim();
    if (!answer) throw new Error('Gemini respondió sin contenido.');
    return answer;
  } catch (error) {
    if (error instanceof Error && error.message !== 'Gemini respondió sin contenido.') {
      throw new Error('Respuesta inválida de Gemini.');
    }
    throw error;
  }
}
