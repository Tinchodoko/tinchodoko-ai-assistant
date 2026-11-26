import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

type AiProvider = 'groq'|'gemini'|'nvidia'|'cloudflare'|'openrouter';
export type NeuralProvider = { id:string; provider:AiProvider; model:string; apiKey:string; accountId:string; default:boolean; status:'offline'|'online'|'connecting'|'error'; };
export type NeuralRunner = (provider:NeuralProvider, question:string)=>Promise<string>;
type ImportLog = {id:string;symbol:string;timeframe:string;requested:number;received:number;at:number;status:string;firstCandle?:string;lastCandle?:string;gapCount?:number;weekendGapCount?:number;missingCandles?:number};
type ChatMessage = {id:string;provider:string;model:string;question:string;answer:string;ms:number;error?:boolean;at:number};

const LOG_KEY='tinchodoko.market.import.log.v1';
const HISTORY_KEY='tinchodoko.ai.neural.chat.v1';
const DEFAULT_INSTRUCTIONS=`The response must be returned in structured JSON format using this style.
The examples below are ONLY examples of the required response format. They are NOT real answers and must NOT be repeated or copied as the answer.

For BUY or SELL:
{
  "pair": "EURUSD",
  "signal": "BUY or SELL",
  "reason": "Example: bullish breakout confirmed by trend and momentum.",
  "entry": value,
  "tp": value,
  "sl": value
}

For WAIT:
{
  "pair": "EURUSD",
  "signal": "WAIT",
  "reason": "Example: there is not enough confirmation for an entry.",
  "entry": null,
  "tp": null,
  "sl": null
}

Return only the structured JSON response. The "reason" field must contain a concise explanation with a maximum of 300 characters.
If the signal is WAIT, entry, tp and sl MUST be null.
The examples above describe the format only; replace all example values with the actual analysis results.`;
const providerLabel=(p:AiProvider)=>({groq:'GROQ',gemini:'GEMINI',nvidia:'NVIDIA',cloudflare:'CLOUDFLARE',openrouter:'OPENROUTER'}[p]);
const providerAsset=(p:AiProvider)=>({groq:require('../assets/groq.png'),gemini:require('../assets/gemini.png'),nvidia:require('../assets/nvidia.png'),cloudflare:require('../assets/cloudflare.png'),openrouter:require('../assets/openrouter.png')}[p]);
const initials=(p:AiProvider)=>providerLabel(p)[0];
const statusColor=(status:NeuralProvider['status'],active:boolean)=>!active?'#6d7480':status==='online'?'#28d17c':status==='error'?'#e05252':status==='connecting'?'#f0a429':'#6d7480';

function safeDate(value?:string|number){if(value===undefined||value===null)return '—';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('es-AR',{dateStyle:'short',timeStyle:'medium'}):'—';}
function buildImportAnswer(imports:ImportLog[]){if(!imports.length)return 'Lista de importaciones\\nNo hay importaciones guardadas.';return ['Lista de importaciones',...imports.map(x=>`${x.symbol} ${x.timeframe} ${x.status} · ${x.received}/${x.requested} velas`),'Seleccione un par si desea obtener más información.'].join('\\n');}
function isImportQuestion(text:string){return /historial.*import|importad|importacion|importaciones|qué historiales|que historiales/i.test(text);}

export default function NeuralScreen({providers,runner,accountId}:{providers:NeuralProvider[];runner:NeuralRunner;accountId:string}){
 const [instructions,setInstructions]=useState(DEFAULT_INSTRUCTIONS);
 const [instructionsExpanded,setInstructionsExpanded]=useState(true);
 const [settingsOpen,setSettingsOpen]=useState(false);
 const [activeIds,setActiveIds]=useState<string[]>([]);
 const [messages,setMessages]=useState<ChatMessage[]>([]);
 const [question,setQuestion]=useState('');
 const [busy,setBusy]=useState(false);
 const [runtimeStatus,setRuntimeStatus]=useState<Record<string,NeuralProvider['status']>>({});
 const [imports,setImports]=useState<ImportLog[]>([]);
 const [analysisImport,setAnalysisImport]=useState<ImportLog|null>(null);
 const [detailsImport,setDetailsImport]=useState<ImportLog|null>(null);
 const [importPickerOpen,setImportPickerOpen]=useState(false);
 const [historyExpanded,setHistoryExpanded]=useState(true);
 const [importsExpanded,setImportsExpanded]=useState(true);

 useEffect(()=>{Promise.all([AsyncStorage.getItem('tinchodoko.ai.neural.instructions'),AsyncStorage.getItem('tinchodoko.ai.neural.activeProviders'),AsyncStorage.getItem(HISTORY_KEY),AsyncStorage.getItem(LOG_KEY)]).then(([i,a,h,l])=>{
   if(i)setInstructions(i);
   if(a){try{const ids=JSON.parse(a);if(Array.isArray(ids))setActiveIds(ids);}catch{}}
   else setActiveIds(providers.filter(p=>p.apiKey&&p.status==='online').map(p=>p.id));
   if(h){try{const x=JSON.parse(h);if(Array.isArray(x))setMessages(x.slice(-200));}catch{}}
   if(l){try{const x=JSON.parse(l);if(Array.isArray(x))setImports(x);}catch{}}
 }).catch(()=>{});},[]);
 useEffect(()=>{if(!activeIds.length&&providers.length&&messages.length===0){const online=providers.filter(p=>p.apiKey&&p.status==='online').map(p=>p.id);if(online.length)setActiveIds(online);}},[providers,messages.length]);
 useEffect(()=>{AsyncStorage.setItem('tinchodoko.ai.neural.instructions',instructions).catch(()=>{});},[instructions]);
 useEffect(()=>{AsyncStorage.setItem('tinchodoko.ai.neural.activeProviders',JSON.stringify(activeIds)).catch(()=>{});},[activeIds]);
 useEffect(()=>{AsyncStorage.setItem(HISTORY_KEY,JSON.stringify(messages.slice(-200))).catch(()=>{});},[messages]);

 const effectiveProviders=useMemo(()=>providers.map(p=>({...p,status:runtimeStatus[p.id]??p.status})),[providers,runtimeStatus]);
 const activeProviders=effectiveProviders.filter(p=>activeIds.includes(p.id));
 function toggleProvider(id:string){setActiveIds(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);}

 async function marketContext():Promise<string>{
   const chosen=analysisImport;
   if(!chosen)return '';
   let indicatorRows:any[]=[];let configuration:any=null;
   try{
     const raw=await AsyncStorage.getItem('tinchodoko.market.indicators.'+accountId+'.'+chosen.symbol+'.'+chosen.timeframe+'.'+chosen.id+'.v1');
     const data=raw?JSON.parse(raw):null;
     indicatorRows=Array.isArray(data?.rows)?data.rows.slice(-8):[];
     configuration=data?.configuration??null;
   }catch{}
   const compactRows=indicatorRows.map((r:any)=>({
     time:r.time??r.timestamp??r.date,
     open:r.open,high:r.high,low:r.low,close:r.close,volume:r.volume,
     ema20:r.ema20,ema50:r.ema50,rsi:r.rsi,adx:r.adx,macd:r.macd,bollinger:r.bollinger,zScore:r.zScore
   }));
   return `\\n\\nSELECTED MARKET DATA (${chosen.symbol} ${chosen.timeframe}):\\n${JSON.stringify({
     symbol:chosen.symbol,timeframe:chosen.timeframe,candles:chosen.received,
     firstCandle:chosen.firstCandle,lastCandle:chosen.lastCandle,gaps:chosen.gapCount,missing:chosen.missingCandles,
     indicatorConfiguration:configuration,latestIndicatorRows:compactRows
   })}`;
 }

 async function copyText(text:string){try{await Clipboard.setStringAsync(text);Alert.alert('COPIADO','El mensaje fue copiado al portapapeles.');}catch{Alert.alert('ERROR','No se pudo copiar el mensaje.');}}
 async function clearChat(){if(!messages.length)return;Alert.alert('BORRAR HISTORIAL','¿Desea eliminar todo el historial de conversación?', [{text:'CANCELAR',style:'cancel'},{text:'BORRAR',style:'destructive',onPress:()=>setMessages([])}]);}
 async function saveChat(){if(!messages.length){Alert.alert('HISTORIAL','No hay mensajes para guardar.');return;}try{const payload=JSON.stringify({exportedAt:new Date().toISOString(),messages},null,2);const dir=FileSystem.documentDirectory??FileSystem.cacheDirectory;if(!dir)throw new Error('storage unavailable');const path=dir+'tinchodoko-neural-chat-'+Date.now()+'.json';await FileSystem.writeAsStringAsync(path,payload);Alert.alert('CHAT GUARDADO',`El historial fue guardado en el almacenamiento interno.\\n\\n${path}`);}catch{Alert.alert('ERROR','No se pudo guardar el historial.');}}
 async function copyGroup(questionText:string){
   const group=messages.filter(m=>m.question===questionText);
   if(!group.length)return;
   const text=[`Tinchodoko · ${safeDate(group[0].at)}`,`\\nPregunta\\n${questionText}`,...group.map(m=>`\\n\\n--- ${m.provider} · ${m.model} · ${safeDate(m.at)} ---\\nResponse time: ${m.ms} ms (${(m.ms/1000).toFixed(2)} s)\\n\\n${m.answer}`)].join('');
   await copyText(text);
 }

 async function ask(){
   const q=question.trim();if(!q||busy)return;
   setQuestion('');
   if(isImportQuestion(q)){setMessages(current=>[...current,{id:`q-${Date.now()}`,provider:'TS',model:'TypeScript',question:q,answer:buildImportAnswer(imports),ms:0,at:Date.now()}]);return;}
   if(!activeProviders.length){Alert.alert('PROVEEDORES','No hay proveedores activos para consultar.');return;}
   const prompt=`SYSTEM INSTRUCTIONS:\\n${instructions}\\n\\nUSER QUESTION:\\n${q}${await marketContext()}\\n\\nFollow the system instructions exactly. Analyze the selected imported market data when provided.\\nDo not invent market data that is not included in the selected data.`;
   setBusy(true);const started=Date.now();
   const results=await Promise.all(activeProviders.map(async provider=>{
     const t0=Date.now();setRuntimeStatus(s=>({...s,[provider.id]:'connecting'}));
     try{const answer=await runner(provider,prompt);const ms=Date.now()-t0;setRuntimeStatus(s=>({...s,[provider.id]:'online'}));return{id:`${provider.id}-${Date.now()}-${Math.random()}`,provider:providerLabel(provider.provider),model:provider.model,question:q,answer,ms,error:false,at:started};}
     catch(error){const ms=Date.now()-t0;setRuntimeStatus(s=>({...s,[provider.id]:'error'}));return{id:`${provider.id}-${Date.now()}-${Math.random()}`,provider:providerLabel(provider.provider),model:provider.model,question:q,answer:error instanceof Error?error.message:String(error),ms,error:true,at:started};}
   }));
   setMessages(current=>[...current,...results]);setBusy(false);
 }

 return <ScrollView contentContainerStyle={n.content} onScrollBeginDrag={()=>{if(importPickerOpen)setImportPickerOpen(false);}}>
   <View style={n.neuralHeader}>
    <View style={n.titleRow}><View style={n.neuronIcon}><View style={n.nodeA}/><View style={n.nodeB}/><View style={n.nodeC}/><View style={n.linkA}/><View style={n.linkB}/></View><Text style={n.title}>NEURONA</Text></View>
    <View style={n.headerActions}><Pressable onPress={()=>void clearChat()} style={n.headerButton}><Text style={n.headerIcon}>⌫</Text></Pressable><Pressable onPress={()=>void saveChat()} style={n.headerButton}><Text style={n.headerIcon}>⇩</Text></Pressable><Pressable onPress={()=>setSettingsOpen(v=>!v)} style={n.gear}><Text style={n.gearText}>⚙</Text></Pressable></View>
   </View>

   {settingsOpen&&<View style={n.settingsCard}><Text style={n.settingsTitle}>PROVEEDORES</Text><Text style={n.settingsSub}>Activá o desactivá los proveedores que participarán del análisis.</Text><View style={n.providerGrid}>
    {effectiveProviders.map((p,index)=><Pressable key={p.id} onPress={()=>toggleProvider(p.id)} style={[n.providerSquare,{borderColor:statusColor(p.status,activeIds.includes(p.id)),backgroundColor:p.status==='online'&&activeIds.includes(p.id)?'rgba(40,209,124,0.16)':'#0f131a'}]}>
      <Text style={n.providerNumber}>{index+1}</Text><Text style={[n.providerMark,{color:statusColor(p.status,activeIds.includes(p.id))}]}>{providerMark(p.provider)}</Text><Text style={[n.providerInitial,{color:statusColor(p.status,activeIds.includes(p.id))}]}>{initials(p.provider)}</Text>
    </Pressable>)}
   </View></View>}

   <View style={n.panel}><Pressable onPress={()=>setInstructionsExpanded(v=>!v)} style={n.panelHeader}><Text style={n.arrow}>{instructionsExpanded?'▲':'▼'}</Text><Text style={n.panelTitle}>INSTRUCCIONES</Text></Pressable>{instructionsExpanded&&<TextInput value={instructions} onChangeText={setInstructions} multiline textAlignVertical="top" style={n.instructionsInput}/>}</View>

   <View style={n.panel}>
    <Pressable onPress={()=>setHistoryExpanded(v=>!v)} style={n.panelHeader}><Text style={n.arrow}>{historyExpanded?'▲':'▼'}</Text><Text style={n.panelTitle}>HISTORIAL DE CONVERSACIÓN</Text><Text style={n.historyCount}>{messages.length}</Text></Pressable>
    {historyExpanded&&(messages.length===0?<Text style={n.empty}>Todavía no hay consultas.</Text>:messages.map(m=><View key={m.id} style={[n.message,m.error&&n.messageError]}>
      <View style={n.messageHead}><Text style={n.providerName}>{m.provider}</Text><Text style={n.latency}>{m.ms} ms · {(m.ms/1000).toFixed(2)} s</Text></View>
      <View style={n.chatBubble}><View style={n.bubbleHead}><Text style={n.bubbleLabel}>Tinchodoko · {safeDate(m.at)}</Text><Pressable onPress={()=>void copyText(`Tinchodoko · ${safeDate(m.at)}\\n\\nPregunta\\n${m.question}`)}><Text style={n.clip}>⌇</Text></Pressable></View><Text style={n.question}>{m.question}</Text></View>
      <View style={[n.chatBubble,n.answerBubble]}><View style={n.bubbleHead}><Text style={n.bubbleLabel}>{m.provider} · {m.model} · {safeDate(m.at)}</Text><Pressable onPress={()=>void copyText(`${m.provider} · ${m.model} · ${safeDate(m.at)}\\n\\nResponse time: ${m.ms} ms (${(m.ms/1000).toFixed(2)} s)\\n\\n${m.answer}`)}><Text style={n.clip}>⌇</Text></Pressable></View><Text style={n.answer}>{m.answer}</Text></View>
    </View>))}
    {historyExpanded&&messages.length>0&&<Pressable onPress={()=>void copyGroup(messages[messages.length-1].question)} style={n.copyAllButton}><Text style={n.copyAllIcon}>⌇</Text><Text style={n.copyAllText}>COPIAR RESPUESTAS DE LA ÚLTIMA CONSULTA</Text></Pressable>}
   </View>

   <View style={n.questionBox}>
    <Text style={n.panelTitle}>ANALIZAR DATOS</Text>
    <Pressable onPress={()=>setImportPickerOpen(v=>!v)} style={n.importSelector}><Text style={n.importSelected}>{analysisImport?analysisImport.symbol+' · '+analysisImport.timeframe:'Seleccionar par y timeframe importado'}</Text><Text style={n.importArrow}>{importPickerOpen?'▲':'▼'}</Text></Pressable>
    {importPickerOpen&&<View style={n.importOptions}>{imports.map(item=><Pressable key={item.id} onPress={()=>{setAnalysisImport(item);setImportPickerOpen(false);}} style={[n.importOption,analysisImport?.id===item.id&&n.importOptionSelected]}><Text style={n.importPair}>{item.symbol}</Text><Text style={n.importTf}>{item.timeframe}</Text><Text style={n.importMeta}>{item.received} velas</Text></Pressable>)}</View>}
    <TextInput value={question} onChangeText={setQuestion} multiline placeholder="Ej.: What trend is currently visible according to the imported data?" placeholderTextColor="#6f7785" style={n.questionInput}/>
    <Pressable disabled={busy||!analysisImport} onPress={()=>void ask()} style={[n.askButton,(busy||!analysisImport)&&{opacity:.5}]}>{busy?<ActivityIndicator color="#0b0e13"/>:<Text style={n.askText}>CONSULTAR</Text>}</Pressable>
   </View>

   <View style={n.panel}>
    <Pressable onPress={()=>setImportsExpanded(v=>!v)} style={n.panelHeader}><Text style={n.arrow}>{importsExpanded?'▲':'▼'}</Text><Text style={n.panelTitle}>IMPORTACIONES DISPONIBLES</Text><Text style={n.historyCount}>{imports.length}</Text></Pressable>
    {importsExpanded&&imports.map(item=><Pressable key={item.id} onPress={()=>{setDetailsImport(item);}} style={[n.importRow,detailsImport?.id===item.id&&n.importRowSelected]}><Text style={n.importPair}>{item.symbol}</Text><Text style={n.importTf}>{item.timeframe}</Text><Text style={n.importMeta}>{item.received} velas</Text><Text style={n.importArrow}>›</Text></Pressable>)}
    {importsExpanded&&detailsImport&&<View style={n.detailBox}><View style={n.detailHeader}><Text style={n.panelTitle}>{detailsImport.symbol} · {detailsImport.timeframe}</Text><Pressable onPress={()=>setDetailsImport(null)}><Text style={n.close}>×</Text></Pressable></View><Text style={n.detail}>Cantidad de velas: {detailsImport.received}</Text><Text style={n.detail}>Huecos: {detailsImport.gapCount??0}</Text><Text style={n.detail}>Primer vela: {safeDate(detailsImport.firstCandle)}</Text><Text style={n.detail}>Última vela: {safeDate(detailsImport.lastCandle)}</Text>{detailsImport.missingCandles!==undefined&&<Text style={n.detail}>Velas faltantes: {detailsImport.missingCandles}</Text>}</View>}
   </View>
 </ScrollView>;
}

const n=StyleSheet.create({
 content:{padding:16,gap:14,paddingBottom:32},neuralHeader:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},headerActions:{flexDirection:'row',alignItems:'center',gap:2},headerButton:{width:38,height:38,alignItems:'center',justifyContent:'center'},headerIcon:{color:'#fff',fontSize:22,fontWeight:'900'},titleRow:{flexDirection:'row',alignItems:'center',gap:10},title:{color:'#fff',fontSize:22,fontWeight:'900'},gear:{width:40,height:40,alignItems:'center',justifyContent:'center'},gearText:{color:'#fff',fontSize:23},
 neuronIcon:{width:30,height:30,position:'relative'},nodeA:{position:'absolute',left:2,top:13,width:8,height:8,borderRadius:4,backgroundColor:'#28d17c'},nodeB:{position:'absolute',right:2,top:4,width:8,height:8,borderRadius:4,backgroundColor:'#7ea7ff'},nodeC:{position:'absolute',right:5,bottom:2,width:8,height:8,borderRadius:4,backgroundColor:'#e05252'},linkA:{position:'absolute',left:8,top:10,width:15,height:2,backgroundColor:'#697386',transform:[{rotate:'-20deg'}]},linkB:{position:'absolute',left:10,top:18,width:14,height:2,backgroundColor:'#697386',transform:[{rotate:'25deg'}]},
 settingsCard:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:13,padding:14,gap:10},settingsTitle:{color:'#fff',fontWeight:'900',fontSize:13},settingsSub:{color:'#9da6b5',fontSize:12},providerGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},providerSquare:{width:58,height:58,borderRadius:11,borderWidth:2,alignItems:'center',justifyContent:'center',position:'relative',overflow:'hidden'},providerNumber:{position:'absolute',left:5,top:3,color:'#9da6b5',fontSize:10,fontWeight:'900'},providerLogo:{position:'absolute',width:42,height:42,opacity:.34},providerInitial:{fontSize:24,fontWeight:'900',zIndex:2},
 panel:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:13,padding:14,gap:10},panelHeader:{flexDirection:'row',alignItems:'center',gap:8},arrow:{color:'#fff',fontSize:15,width:20},panelTitle:{color:'#fff',fontSize:13,fontWeight:'900',flex:1},historyCount:{color:'#7f8998',fontSize:11,fontWeight:'900'},instructionsInput:{minHeight:260,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',color:'#fff',padding:12,fontSize:12,lineHeight:18},
 empty:{color:'#8f98a8',fontSize:13,paddingVertical:8},message:{backgroundColor:'#0f131a',borderWidth:1,borderColor:'#303744',borderRadius:10,padding:12,gap:7},messageError:{borderColor:'#e05252'},messageHead:{flexDirection:'row',justifyContent:'space-between',gap:8},chatBubble:{backgroundColor:'#10151d',borderWidth:1,borderColor:'#303744',borderRadius:10,padding:10,gap:7},answerBubble:{borderColor:'#263444'},bubbleHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},bubbleLabel:{color:'#9da6b5',fontSize:10,fontWeight:'800',flex:1},clip:{color:'#fff',fontSize:18,fontWeight:'900',paddingHorizontal:4},providerName:{color:'#fff',fontSize:12,fontWeight:'900'},latency:{color:'#28d17c',fontSize:11,fontWeight:'900'},question:{color:'#9da6b5',fontSize:12},answer:{color:'#fff',fontSize:13,lineHeight:19},
 copyAllButton:{minHeight:44,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},copyAllIcon:{color:'#fff',fontSize:18,fontWeight:'900'},copyAllText:{color:'#fff',fontSize:11,fontWeight:'900'},
 questionBox:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:13,padding:12,gap:10},importSelector:{minHeight:48,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',paddingHorizontal:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},importSelected:{color:'#fff',fontSize:12,fontWeight:'800',flex:1},importArrow:{color:'#fff',fontSize:24},importOptions:{gap:6},importOption:{minHeight:44,borderWidth:1,borderColor:'#303744',borderRadius:9,backgroundColor:'#0f131a',paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:10},importOptionSelected:{borderColor:'#28d17c',backgroundColor:'rgba(40,209,124,0.10)'},questionInput:{minHeight:70,maxHeight:180,color:'#fff',backgroundColor:'#0f131a',borderWidth:1,borderColor:'#3b4350',borderRadius:9,padding:12,textAlignVertical:'top'},askButton:{minHeight:48,borderRadius:9,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},askText:{color:'#0b0e13',fontWeight:'900'},
 importRow:{minHeight:48,borderWidth:1,borderColor:'#303744',borderRadius:9,backgroundColor:'#0f131a',paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:8},importRowSelected:{borderColor:'#f0b429'},importPair:{color:'#fff',fontWeight:'900',flex:1},importTf:{color:'#f0b429',fontWeight:'900'},importMeta:{color:'#9da6b5',fontSize:11},detailBox:{borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#10151d',padding:12,gap:6},detailHeader:{flexDirection:'row',alignItems:'center'},close:{color:'#e05252',fontSize:25,fontWeight:'900'},detail:{color:'#dce1e9',fontSize:13,lineHeight:19}
});