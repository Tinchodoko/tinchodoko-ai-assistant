const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1';

export const NVIDIA_TEXT_MODELS = [
  { id: 'nvidia/nemotron-3.5-super-vl-120b-a12b', name: 'Nemotron 3.5 Super VL 120B' },
  { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', name: 'Nemotron 3.5 Lightning 30B' },
  { id: 'nvidia/nemotron-3.5-bolt-e4b', name: 'Nemotron 3.5 Bolt E4B' },
] as const;
export const DEFAULT_NVIDIA_MODEL = NVIDIA_TEXT_MODELS[0].id;

function parseNvidiaError(status: number, body: string): string {
  try {
    const data = JSON.parse(body) as { message?: string; error?: { message?: string } };
    if (data.message) return data.message;
    if (data.error?.message) return data.error.message;
  } catch {}
  return body || `HTTP ${status}`;
}

async function nvidiaFetch(url: string, apiKey: string, init: RequestInit): Promise<Response> {
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

export async function validateNvidiaApiKey(apiKey: string): Promise<string[]> {
  const key = apiKey.trim();
  if (!key) throw new Error('Ingresá una API KEY de NVIDIA.');
  const response = await nvidiaFetch(`${NVIDIA_API_URL}/models`, key, { method: 'GET' });
  const body = await response.text();
  if (!response.ok) throw new Error(`NVIDIA rechazó la conexión: ${parseNvidiaError(response.status, body)}`);
  try {
    const data = JSON.parse(body) as { data?: Array<{ id?: string }> };
    return (data.data ?? []).map(item => item.id ?? '').filter(Boolean);
  } catch {
    throw new Error('Respuesta inválida de NVIDIA al consultar los modelos.');
  }
}

export async function askNvidia(apiKey: string, question: string, model: string = DEFAULT_NVIDIA_MODEL): Promise<string> {
  const key = apiKey.trim();
  if (!key) throw new Error('No hay una API KEY de NVIDIA guardada.');
  const response = await nvidiaFetch(`${NVIDIA_API_URL}/chat/completions`, key, {
    method: 'POST',
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Respondé de forma breve y directa. Para operaciones matemáticas simples, devolvé el resultado y nada más.' },
        { role: 'user', content: question },
      ],
      temperature: 0.1,
      max_tokens: 64,
      stream: false,
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`NVIDIA rechazó la consulta: ${parseNvidiaError(response.status, body)}`);
  try {
    const data = JSON.parse(body) as { choices?: Array<{ message?: { content?: string | null } }> };
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error('NVIDIA respondió sin contenido.');
    return answer;
  } catch (error) {
    if (error instanceof Error && error.message !== 'NVIDIA respondió sin contenido.') throw new Error('Respuesta inválida de NVIDIA.');
    throw error;
  }
}
