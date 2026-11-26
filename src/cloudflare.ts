const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4';

export const CLOUDFLARE_TEXT_MODELS = [
  { id: '@cf/zai-org/glm-5.3', name: 'GLM-5.3 · requiere pago' },
  { id: '@cf/google/gemma-4-26b-a4b-it', name: 'Gemma 4 26B A4B' },
] as const;

export const DEFAULT_CLOUDFLARE_MODEL = CLOUDFLARE_TEXT_MODELS[1].id;

function parseCloudflareError(status:number,body:string):string {
  try {
    const data=JSON.parse(body) as {errors?:Array<{message?:string;code?:number}>;messages?:Array<{message?:string}>};
    const message=data.errors?.map(error=>error.message).filter(Boolean).join('; ');
    if(message) return message;
    const messages=data.messages?.map(item=>item.message).filter(Boolean).join('; ');
    if(messages) return messages;
  } catch {}
  return body || `HTTP ${status}`;
}

async function cloudflareFetch(url:string,apiToken:string,init:RequestInit):Promise<Response> {
  return fetch(url,{
    ...init,
    headers:{
      Accept:'application/json',
      'Content-Type':'application/json',
      Authorization:`Bearer ${apiToken}`,
      ...(init.headers??{}),
    },
  });
}

export async function validateCloudflareCredentials(apiToken:string,accountId:string):Promise<void> {
  const token=apiToken.trim();
  const account=accountId.trim();
  if(!token) throw new Error('Ingresá un API TOKEN de Cloudflare.');
  if(!/^[a-f0-9]{32}$/i.test(account)) throw new Error('El ACCOUNT ID debe tener 32 caracteres hexadecimales.');

  const tokenResponse=await cloudflareFetch(`${CLOUDFLARE_API_URL}/user/tokens/verify`,token,{method:'GET'});
  const tokenBody=await tokenResponse.text();
  if(!tokenResponse.ok) throw new Error(`Cloudflare rechazó el API TOKEN: ${parseCloudflareError(tokenResponse.status,tokenBody)}`);
  try {
    const tokenData=JSON.parse(tokenBody) as {success?:boolean;result?:{status?:string}};
    if(tokenData.success!==true || tokenData.result?.status!=='active') throw new Error('El API TOKEN no está activo o no tiene un estado válido.');
  } catch(error) {
    if(error instanceof Error && error.message!=='El API TOKEN no está activo o no tiene un estado válido.') throw new Error('Cloudflare devolvió una respuesta inválida al verificar el token.');
    throw error;
  }

  const modelsResponse=await cloudflareFetch(`${CLOUDFLARE_API_URL}/accounts/${account}/ai/models/search?search=gemma-4-26b-a4b-it`,token,{method:'GET'});
  const modelsBody=await modelsResponse.text();
  if(!modelsResponse.ok) throw new Error(`No se pudo validar el ACCOUNT ID o los permisos Workers AI: ${parseCloudflareError(modelsResponse.status,modelsBody)}`);
  try {
    const modelsData=JSON.parse(modelsBody) as {success?:boolean;errors?:Array<{message?:string}>};
    if(modelsData.success!==true) throw new Error(parseCloudflareError(modelsResponse.status,modelsBody));
  } catch(error) {
    if(error instanceof Error && error.message!=='Cloudflare devolvió una respuesta inválida al consultar los modelos.') throw error;
    throw new Error('Cloudflare devolvió una respuesta inválida al consultar los modelos.');
  }
}

export async function askCloudflare(apiToken:string,accountId:string,question:string,model:string=DEFAULT_CLOUDFLARE_MODEL):Promise<string> {
  const token=apiToken.trim();
  const account=accountId.trim();
  if(!token || !account) throw new Error('Faltan el API TOKEN o el ACCOUNT ID de Cloudflare.');
  if(!CLOUDFLARE_TEXT_MODELS.some(item=>item.id===model)) throw new Error('El modelo seleccionado no está habilitado en esta integración.');

  const response=await cloudflareFetch(`${CLOUDFLARE_API_URL}/accounts/${account}/ai/run/${model}`,token,{
    method:'POST',
    body:JSON.stringify({
      messages:[
        {role:'system',content:'Respondé de forma breve y directa. Para operaciones matemáticas simples, devolvé el resultado y nada más.'},
        {role:'user',content:question},
      ],
      temperature:0.1,
      max_tokens:128,
      // Gemma 4 supports thinking; disable it for short direct-response tests.
      ...(model==='@cf/google/gemma-4-26b-a4b-it' ? {chat_template_kwargs:{enable_thinking:false}} : {}),
    }),
  });
  const body=await response.text();
  if(!response.ok) {
    const detail=parseCloudflareError(response.status,body);
    if(response.status===402 || /paid|billing|credit|payment/i.test(detail)) {
      throw new Error(`Cloudflare no habilitó este modelo con la facturación actual: ${detail}`);
    }
    throw new Error(`Cloudflare rechazó la consulta (${response.status}): ${detail}`);
  }

  let data: {
    success?:boolean;
    result?:{
      response?:string;
      generated_text?:string;
      output_text?:string;
      choices?:Array<{message?:{content?:string|null}}>;
    };
    response?:string;
    output_text?:string;
  };
  try {
    data=JSON.parse(body);
  } catch {
    throw new Error('Cloudflare devolvió una respuesta que no es JSON válido.');
  }
  if(data.success===false) throw new Error(`Cloudflare informó un error: ${parseCloudflareError(response.status,body)}`);
  const answer=data.result?.response?.trim()
    || data.result?.generated_text?.trim()
    || data.result?.output_text?.trim()
    || data.result?.choices?.[0]?.message?.content?.trim()
    || data.response?.trim()
    || data.output_text?.trim();
  if(!answer) {
    const shape=Object.keys(data.result??data).join(', ') || 'sin campos';
    throw new Error(`Cloudflare no devolvió texto en el formato esperado (campos: ${shape}).`);
  }
  return answer;
}
