import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import type { Credentials } from './exness';
import { getMarketCandles, type MarketTimeframe } from './exness';
import { calculateIndicatorSeries, calculateIndicators, DEFAULT_INDICATOR_CONFIG, type IndicatorConfig, type IndicatorRow, type IndicatorSnapshot } from './marketIndicators';

type Props = { credentials: Credentials; accessPoint: string; instruments: string[]; selectedInstrument: string; onSelectInstrument: (symbol:string)=>void };
type Config = Record<MarketTimeframe,number>;
type MarketCandle = { time:string; open:number; high:number; low:number; close:number; volume:number };
type LogItem = { id:string; symbol:string; timeframe:MarketTimeframe; requested:number; received:number; at:number; status:'OK'|'PARCIAL'|'FALLO'; message?:string; firstCandle?:string; lastCandle?:string; observedSpanMs?:number; expectedSpanMs?:number; gapCount?:number; weekendGapCount?:number; weekendGapHours?:number; missingCandles?:number };
const TFS:MarketTimeframe[]=['M1','M5','M15','M30','H1','H4'];
const DEFAULTS:Config={M1:5000,M5:500,M15:500,M30:300,H1:250,H4:250};
const MAX:Record<MarketTimeframe,number>={M1:10000,M5:3000,M15:1800,M30:1200,H1:1000,H4:700};
const MIN=200;
const CONFIG_KEY='tinchodoko.market.import.config.v1';
const LOG_KEY='tinchodoko.market.import.log.v1';
const INDICATOR_CONFIG_KEY='tinchodoko.market.indicator.config.v1';
const EXPORT_DIRECTORY_KEY='tinchodoko.market.export.downloadUri.v1';
const pad=(n:number)=>String(n).padStart(2,'0');
function formatDate(ms:number){const d=new Date(ms);return pad(d.getDate())+pad(d.getMonth()+1)+d.getFullYear()+'-'+pad(d.getHours())+pad(d.getMinutes());}
function exportFilename(symbol:string,tf:MarketTimeframe,ms:number){const d=new Date(ms);return symbol+'-'+tf+'-'+pad(d.getDate())+pad(d.getMonth()+1)+d.getFullYear()+'-'+pad(d.getHours())+pad(d.getMinutes())+'.json';}
function normalizeIndicatorConfig(raw?:Partial<IndicatorConfig>):IndicatorConfig{const d=DEFAULT_INDICATOR_CONFIG;return {rsi:{...d.rsi,...raw?.rsi},atr:{...d.atr,...raw?.atr},ema20:{...d.ema20,...raw?.ema20},ema50:{...d.ema50,...raw?.ema50},adx:{...d.adx,...raw?.adx},macd:{...d.macd,...raw?.macd},bollinger:{...d.bollinger,...raw?.bollinger},zScore:{...d.zScore,...raw?.zScore}};}
function datasetKey(account:string,symbol:string,tf:MarketTimeframe,id?:string){return 'tinchodoko.market.candles.'+account+'.'+symbol+'.'+tf+(id?'.'+id:'')+'.v1';}
function indicatorDatasetKey(account:string,symbol:string,tf:MarketTimeframe,id?:string){return 'tinchodoko.market.indicators.'+account+'.'+symbol+'.'+tf+(id?'.'+id:'')+'.v1';}
function indicatorValue(value:number|null){return value===null||value===undefined?'—':String(value);}
function buildImportDiagnostics(candles:MarketCandle[],requested:number,timeframe:MarketTimeframe){
 const interval=({M1:60000,M5:300000,M15:900000,M30:1800000,H1:3600000,H4:14400000} as Record<MarketTimeframe,number>)[timeframe];
 const times=candles.map(c=>Date.parse(c.time)).filter(Number.isFinite).sort((a,b)=>a-b);
 const first=times[0],last=times[times.length-1];
 let gapCount=0,weekendGapCount=0,weekendGapMs=0;
 for(let i=1;i<times.length;i++){
  const gap=times[i]-times[i-1];
  if(gap>interval*1.5){
   gapCount++;
   const before=new Date(times[i-1]);
   const after=new Date(times[i]);
   const beforeDay=before.getUTCDay();
   const afterDay=after.getUTCDay();
   if((beforeDay===5||beforeDay===6)&&(afterDay===0||afterDay===1)){
    weekendGapCount++; weekendGapMs+=gap-interval;
   }
  }
 }
 return {
  firstCandle:first?new Date(first).toISOString():undefined,
  lastCandle:last?new Date(last).toISOString():undefined,
  observedSpanMs:first&&last?Math.max(0,last-first):undefined,
  expectedSpanMs:Math.max(0,requested-1)*interval,
  gapCount,
  weekendGapCount,
  weekendGapHours:weekendGapMs/3600000,
  missingCandles:Math.max(0,requested-candles.length),
 };
}
function formatDiagnosticDate(value?:string){return value?new Date(value).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'medium'}):'—';}
function formatDuration(ms?:number){if(!Number.isFinite(ms))return '—';const total=Math.round((ms??0)/60000);const d=Math.floor(total/1440);const h=Math.floor((total%1440)/60);const m=total%60;return (d?d+' d ':'')+(h?h+' h ':'')+m+' min';}
function importLogText(item:LogItem){
 const lines=[
  'TINCHODOKO AI ASSISTANT — IMPORTACIÓN DE DATOS',
  'SÍMBOLO: '+item.symbol,
  'TIMEFRAME: '+item.timeframe,
  'ESTADO: '+item.status,
  'SOLICITADAS: '+item.requested,
  'RECIBIDAS: '+item.received,
  'FALTANTES: '+(item.missingCandles??Math.max(0,item.requested-item.received)),
  'FECHA DE IMPORTACIÓN: '+formatDiagnosticDate(new Date(item.at).toISOString()),
  item.message?('MENSAJE: '+item.message):'',
  item.firstCandle?'PRIMERA VELA: '+formatDiagnosticDate(item.firstCandle):'',
  item.lastCandle?'ÚLTIMA VELA: '+formatDiagnosticDate(item.lastCandle):'',
  item.observedSpanMs!==undefined?'PERÍODO OBSERVADO: '+formatDuration(item.observedSpanMs):'',
  item.expectedSpanMs!==undefined?'PERÍODO ESPERADO: '+formatDuration(item.expectedSpanMs):'',
  item.gapCount!==undefined?'HUECOS DETECTADOS: '+item.gapCount:'',
  item.weekendGapCount!==undefined?'HUECOS COMPATIBLES CON FIN DE SEMANA: '+item.weekendGapCount:'',
  item.weekendGapHours!==undefined?'TIEMPO ESTIMADO SIN VELAS EN ESOS HUECOS: '+item.weekendGapHours.toFixed(1)+' h':'',
 ].filter(Boolean);
 return lines.join('\\n');
}

export default function MarketDataScreen({credentials,accessPoint,instruments,selectedInstrument,onSelectInstrument}:Props){
 const [config,setConfig]=useState<Config>(DEFAULTS);
 const [tf,setTf]=useState<MarketTimeframe|null>('M1');
 const [indicatorConfig,setIndicatorConfig]=useState<IndicatorConfig>(DEFAULT_INDICATOR_CONFIG);
 const [indicatorConfigOpen,setIndicatorConfigOpen]=useState(false);
 const [candleEditorOpen,setCandleEditorOpen]=useState(false);
 const [candleDraft,setCandleDraft]=useState('');
 const [searchOpen,setSearchOpen]=useState(false);
 const [instrumentSearch,setInstrumentSearch]=useState('');
 const [log,setLog]=useState<LogItem[]>([]);
 const [busy,setBusy]=useState(false);
 const [menu,setMenu]=useState(false);
 const [alphaOpen,setAlphaOpen]=useState(false);
 const [alpha,setAlpha]=useState<string|null>(null);
 const [indicatorTf,setIndicatorTf]=useState<MarketTimeframe|null>(null);
 const [indicator,setIndicator]=useState<IndicatorSnapshot|null>(null);
 const [indicatorRows,setIndicatorRows]=useState<IndicatorRow[]>([]);
 const [indicatorSource,setIndicatorSource]=useState<LogItem|null>(null);
 const [width,setWidth]=useState(1);
 const [saving,setSaving]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const [expandedImports,setExpandedImports]=useState<Record<string,boolean>>({});
 const [expandedPanels,setExpandedPanels]=useState<Record<string,boolean>>({indicator:true,calculate:true,config:true,chart:true,table:true});
 useEffect(()=>{let cancelled=false;Promise.all([AsyncStorage.getItem(CONFIG_KEY),AsyncStorage.getItem(LOG_KEY),AsyncStorage.getItem(INDICATOR_CONFIG_KEY)]).then(([rawConfig,rawLog,rawIndicatorConfig])=>{if(cancelled)return;if(rawConfig){try{const saved=JSON.parse(rawConfig) as Partial<Config>;const next={...DEFAULTS};for(const item of TFS){const n=Number(saved[item]);if(Number.isInteger(n)&&n>=MIN&&n<=MAX[item])next[item]=n;}setConfig(next);}catch{}}if(rawLog){try{const saved=JSON.parse(rawLog);if(Array.isArray(saved))setLog(saved.filter(x=>x&&typeof x.id==='string').slice(0,200));}catch{}}if(rawIndicatorConfig){try{setIndicatorConfig(normalizeIndicatorConfig(JSON.parse(rawIndicatorConfig)));}catch{}}setLoaded(true);}).catch(()=>setLoaded(true));return()=>{cancelled=true;};},[]);
 const value=tf?config[tf]:0;
 const max=tf?MAX[tf]:MIN;
 const fill=tf?Math.max(0,Math.min(1,(value-MIN)/(max-MIN))):0;
 const symbols=useMemo(()=>instruments.slice().sort((a,b)=>a.localeCompare(b)),[instruments]);
 const filteredSymbols=useMemo(()=>{const q=instrumentSearch.trim().toUpperCase();if(q)return symbols.filter(symbol=>symbol.toUpperCase().startsWith(q));return alpha?symbols.filter(symbol=>symbol.toUpperCase().startsWith(alpha)):symbols;},[symbols,alpha,instrumentSearch]);
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
 function choose(next:MarketTimeframe){if(tf===next){setTf(null);return;}setTf(next);}
 function slide(x:number){if(!tf)return;const ratio=Math.max(0,Math.min(1,x/Math.max(1,width)));const next=Math.max(MIN,Math.min(MAX[tf],Math.round((MIN+ratio*(MAX[tf]-MIN))/10)*10));setConfig(old=>({...old,[tf]:next}));}
 async function saveConfig(){setSaving(true);try{await AsyncStorage.setItem(CONFIG_KEY,JSON.stringify(config));Alert.alert('CONFIGURACIÓN GUARDADA','Las cantidades quedaron guardadas localmente.');}catch(e){Alert.alert('ERROR AL GUARDAR',e instanceof Error?e.message:String(e));}finally{setSaving(false);}}
 async function resetConfig(){setConfig(DEFAULTS);setTf('M1');try{await AsyncStorage.setItem(CONFIG_KEY,JSON.stringify(DEFAULTS));Alert.alert('CONFIGURACIÓN RESTABLECIDA','Se restauraron todos los valores predeterminados.');}catch(e){Alert.alert('ERROR AL RESTABLECER',e instanceof Error?e.message:String(e));}}
async function saveIndicatorConfig(){try{const normalized=normalizeIndicatorConfig(indicatorConfig);setIndicatorConfig(normalized);await AsyncStorage.setItem(INDICATOR_CONFIG_KEY,JSON.stringify(normalized));setIndicatorConfigOpen(false);Alert.alert('CONFIGURACIÓN DE INDICADORES','Los valores quedaron guardados. Presioná CALCULAR INDICADORES para aplicarlos.');}catch(e){Alert.alert('ERROR AL GUARDAR INDICADORES',e instanceof Error?e.message:String(e));}}
function setIndicatorNumber(section:keyof IndicatorConfig,field:string,text:string){const digits=text.replace(/[^0-9.]/g,'');setIndicatorConfig(old=>{const next:any={...old,[section]:{...old[section],[field]:digits===''?'':Number(digits)}};return next;});}
async function editCandleQuantity(){const n=Number(candleDraft);if(!Number.isInteger(n)||n<MIN||n>max){Alert.alert('CANTIDAD NO VÁLIDA','Ingresá un número entero entre '+MIN+' y '+max+' velas.');return;}if(!tf)return;setConfig(old=>({...old,[tf]:n}));setCandleEditorOpen(false);setCandleDraft('');}
 async function saveLog(next:LogItem[]){const trimmed=next.slice(0,200);setLog(trimmed);await AsyncStorage.setItem(LOG_KEY,JSON.stringify(trimmed));}
 async function deleteImport(item:LogItem){
  Alert.alert('CONFIRMAR ELIMINACIÓN','DESEA ELIMINAR LA IMPORTACIÓN\n'+item.symbol+'\\n'+item.timeframe+' - '+item.received+'/'+item.requested+' velas\\n'+formatDate(item.at),[
   {text:'CANCELAR',style:'cancel'},
   {text:'CONFIRMAR',style:'destructive',onPress:async()=>{try{await AsyncStorage.removeItem(datasetKey(credentials.accountId,item.symbol,item.timeframe,item.id));await AsyncStorage.removeItem(datasetKey(credentials.accountId,item.symbol,item.timeframe));await AsyncStorage.removeItem(indicatorDatasetKey(credentials.accountId,item.symbol,item.timeframe,item.id));const next=log.filter(x=>x.id!==item.id);await saveLog(next);if(indicatorSource?.id===item.id){setIndicator(null);setIndicatorRows([]);setIndicatorSource(null);setIndicatorTf(null);}Alert.alert('IMPORTACIÓN ELIMINADA','Los datos de la importación fueron eliminados del dispositivo.');}catch(e){Alert.alert('ERROR AL ELIMINAR',e instanceof Error?e.message:String(e));}}}
  ]);
 }
 async function restorePersistedIndicators(item:LogItem){
  try{
   const raw=await AsyncStorage.getItem(indicatorDatasetKey(credentials.accountId,item.symbol,item.timeframe,item.id));
   if(!raw)return false;
   const parsed=JSON.parse(raw);
   if(!Array.isArray(parsed.rows)||!parsed.rows.length)return false;
   const rows=parsed.rows as IndicatorRow[];
   const last=rows[rows.length-1];
   setIndicator({rsi:last.rsi14,atr:last.atr14,ema20:last.ema20,ema50:last.ema50,adx:last.adx14,macd:last.macd,macdSignal:last.macdSignal,macdHistogram:last.macdHistogram,bollingerUpper:last.bollingerUpper,bollingerMiddle:last.bollingerMiddle,bollingerLower:last.bollingerLower,bollingerWidth:last.bollingerWidth,zScore:last.zScore});
   setIndicatorRows(rows);setIndicatorSource(item);setIndicatorTf(item.timeframe);
   if(parsed.configuration)setIndicatorConfig(normalizeIndicatorConfig(parsed.configuration));
   return true;
  }catch{return false;}
 }
 useEffect(()=>{if(!loaded||!log.length||indicatorSource)return;let cancelled=false;(async()=>{for(const item of log){if(cancelled)break;const found=await restorePersistedIndicators(item);if(found)break;}})();return()=>{cancelled=true;};},[loaded,log,indicatorSource]);

 async function loadIndicators(item:LogItem){
  try{
   const raw=await AsyncStorage.getItem(datasetKey(credentials.accountId,item.symbol,item.timeframe,item.id));
   const fallback=raw?raw:await AsyncStorage.getItem(datasetKey(credentials.accountId,item.symbol,item.timeframe));
   if(!fallback){Alert.alert('DATOS NO DISPONIBLES','No se encontraron las velas de esta importación.');return;}
   const parsed=JSON.parse(fallback);
   const candles=Array.isArray(parsed.candles)?parsed.candles:[] as any[];
   if(candles.length<20){Alert.alert('DATOS INSUFICIENTES','Se necesitan al menos 20 velas para calcular los indicadores.');return;}
   const rows=calculateIndicatorSeries(candles,indicatorConfig);
   const snapshot=calculateIndicators(candles,indicatorConfig);
   await AsyncStorage.setItem(indicatorDatasetKey(credentials.accountId,item.symbol,item.timeframe,item.id),JSON.stringify({
    version:2,symbol:item.symbol,timeframe:item.timeframe,sourceCandleCount:candles.length,generatedAt:Date.now(),configuration:indicatorConfig,rows
   }));
   setIndicator(snapshot);setIndicatorRows(rows);setIndicatorSource(item);setIndicatorTf(item.timeframe);
  }catch(e){Alert.alert('ERROR DE INDICADORES',e instanceof Error?e.message:String(e));}
 }
 async function exportImportJson(item:LogItem){
  try{
   const raw=await AsyncStorage.getItem(datasetKey(credentials.accountId,item.symbol,item.timeframe,item.id));
   const fallback=raw?raw:await AsyncStorage.getItem(datasetKey(credentials.accountId,item.symbol,item.timeframe));
   if(!fallback){Alert.alert('DATOS NO DISPONIBLES','No se encontraron las velas de esta importación.');return;}
   const parsed=JSON.parse(fallback);
   const candles=Array.isArray(parsed.candles)?parsed.candles:[];
   if(!candles.length){Alert.alert('DATOS VACÍOS','Esta importación no contiene velas para exportar.');return;}
   const indicatorRaw=await AsyncStorage.getItem(indicatorDatasetKey(credentials.accountId,item.symbol,item.timeframe,item.id));
   const rows=indicatorRaw?((JSON.parse(indicatorRaw)?.rows??[]) as IndicatorRow[]):calculateIndicatorSeries(candles,indicatorConfig);
   const payload={
    format:'tinchodoko-market-data',
    version:1,
    exportedAt:new Date().toISOString(),
    source:'Exness',
    symbol:item.symbol,
    timeframe:item.timeframe,
    import:{id:item.id,requested:item.requested,received:item.received,importedAt:new Date(item.at).toISOString(),diagnostics:{
      firstCandle:item.firstCandle,lastCandle:item.lastCandle,observedSpanMs:item.observedSpanMs,expectedSpanMs:item.expectedSpanMs,gapCount:item.gapCount,weekendGapCount:item.weekendGapCount,weekendGapHours:item.weekendGapHours,missingCandles:item.missingCandles
    }},
    candles,
    indicators:{version:1,calculation:'local-typescript',rows}
   };
   const json=JSON.stringify(payload,null,2);
   const filename=exportFilename(item.symbol,item.timeframe,item.at);
   let directoryUri=await AsyncStorage.getItem(EXPORT_DIRECTORY_KEY);
   let fileUri:string|undefined;
   const openExportDirectory=async()=>{
    const permission=await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if(!permission.granted)return null;
    const selectedUri=permission.directoryUri;
    await AsyncStorage.setItem(EXPORT_DIRECTORY_KEY,selectedUri);
    return selectedUri;
   };
   if(directoryUri){
    try{
     fileUri=await FileSystem.StorageAccessFramework.createFileAsync(directoryUri,filename,'application/json');
    }catch{
     await AsyncStorage.removeItem(EXPORT_DIRECTORY_KEY);
     directoryUri=null;
    }
   }
   if(!fileUri){
    directoryUri=await openExportDirectory();
    if(!directoryUri)return;
    try{
     fileUri=await FileSystem.StorageAccessFramework.createFileAsync(directoryUri,filename,'application/json');
    }catch{
     await AsyncStorage.removeItem(EXPORT_DIRECTORY_KEY);
     Alert.alert('ERROR DE CARPETA','No se pudo crear el archivo en la carpeta seleccionada. Volvé a intentarlo y elegí una carpeta permitida por Android.');
     return;
    }
   }
   await FileSystem.writeAsStringAsync(fileUri,json,{encoding:FileSystem.EncodingType.UTF8});
   Alert.alert('EXPORTACIÓN COMPLETADA','JSON guardado como '+filename+'. Las IA no dependen de este archivo: el análisis usa los datos almacenados dentro de la aplicación.');
  }catch(e){Alert.alert('ERROR AL EXPORTAR',e instanceof Error?e.message:String(e));}
 }
 async function importData(){
  if(busy)return;
  if(!accessPoint||!credentials.apiKey||!credentials.secret||!credentials.accountId){Alert.alert('CUENTA NO CONECTADA','Primero conectá tu cuenta demo de Exness.');return;}
  if(!selectedInstrument){Alert.alert('SÍMBOLO NO SELECCIONADO','Seleccioná un instrumento desde el selector de par.');return;}
  if(!tf){Alert.alert('TIMEFRAME NO SELECCIONADO','Seleccioná un único timeframe.');return;}
  const selectedTf=tf;const requested=config[selectedTf];setBusy(true);
  try{
   const candles=await getMarketCandles(credentials,accessPoint,selectedInstrument,selectedTf,requested);
   const now=Date.now();
   const diagnostics=buildImportDiagnostics(candles,requested,selectedTf);
   const item:LogItem={id:String(now)+'-'+selectedInstrument+'-'+selectedTf,symbol:selectedInstrument,timeframe:selectedTf,requested,received:candles.length,at:now,status:candles.length===requested?'OK':'PARCIAL',message:candles.length===requested?undefined:'Exness devolvió '+candles.length+' de '+requested+' velas.',...diagnostics};
   await AsyncStorage.setItem(datasetKey(credentials.accountId,selectedInstrument,selectedTf,item.id),JSON.stringify({id:item.id,symbol:selectedInstrument,timeframe:selectedTf,requested,received:candles.length,importedAt:now,candles}));
   await saveLog([item,...log]);
   Alert.alert(item.status==='OK'?'IMPORTACIÓN COMPLETADA':'IMPORTACIÓN PARCIAL',selectedInstrument+' '+selectedTf+': '+candles.length+'/'+requested+' velas guardadas localmente.');
  }catch(e){
   const message=e instanceof Error?e.message:String(e);const now=Date.now();
   const item:LogItem={id:String(now)+'-'+selectedInstrument+'-'+selectedTf,symbol:selectedInstrument,timeframe:selectedTf,requested,received:0,at:now,status:'FALLO',message,missingCandles:requested};
   try{await saveLog([item,...log]);}catch{}
   Alert.alert('ERROR DE IMPORTACIÓN',message);
  }finally{setBusy(false);}
 }
 return <>
 <ScrollView contentContainerStyle={s.content}>
  <Text style={s.title}>IMPORTACIÓN DE DATOS DE MERCADO</Text>
  <Text style={s.subtitle}>Importá un timeframe por operación. Las velas OHLC se guardan localmente en este dispositivo.</Text>
  <View style={s.card}>
   <View style={s.selectorTools}><Text style={s.label}>SELECCIONAR INSTRUMENTO</Text><View style={s.selectorButtons}><Pressable onPress={()=>setAlphaOpen(v=>!v)} style={s.alphaButton}><Text style={s.alphaText}>{alpha??'aZ'}</Text></Pressable><Pressable onPress={()=>{setSearchOpen(v=>!v);if(searchOpen){setInstrumentSearch('');}}} style={s.searchButton}><Text style={searchOpen?s.searchX:s.searchIcon}>{searchOpen?'✕':'⌕'}</Text></Pressable></View></View>
   {searchOpen&&<TextInput autoFocus value={instrumentSearch} onChangeText={v=>{const next=v.replace(/[^a-zA-Z]/g,'').toUpperCase().slice(0,6);setInstrumentSearch(next);setAlpha(null);}} maxLength={6} autoCapitalize="characters" placeholder="BUSCAR INSTRUMENTO" placeholderTextColor="#7f8999" style={s.searchInput}/>}
   {alphaOpen&&<View style={s.alphaPanel}><View style={s.alphaGrid}>{alphabet.map(letter=><Pressable key={letter} onPress={()=>{setAlpha(letter);setAlphaOpen(false);setMenu(true);}} style={s.alphaLetter}><Text style={s.alphaText}>{letter}</Text></Pressable>)}<Pressable onPress={()=>{setAlpha(null);setAlphaOpen(false);setMenu(true);}} style={s.alphaLetter}><Text style={s.clearX}>✕</Text></Pressable></View></View>}
   <Pressable onPress={()=>setMenu(v=>!v)} style={s.select}><Text style={s.selectText}>{selectedInstrument||'SELECCIONAR INSTRUMENTO'}</Text><Text style={s.muted}>{menu?'▲':'▼'}</Text></Pressable>
   {menu&&<ScrollView style={s.symbolList} nestedScrollEnabled showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">{filteredSymbols.length===0?<Text style={s.muted}>No hay instrumentos que comiencen con {alpha??'esta letra'}.</Text>:filteredSymbols.map(symbol=><Pressable key={symbol} onPress={()=>{onSelectInstrument(symbol);setMenu(false);}} style={s.symbolOption}><Text style={s.selectText}>{symbol}</Text></Pressable>)}</ScrollView>}
   <Text style={s.label}>TIMEFRAME</Text>
   <View style={s.timeframes}>{TFS.map(item=><Pressable key={item} onPress={()=>choose(item)} style={[s.timeframe,tf===item&&s.timeframeSelected]}><Text style={[s.tfText,tf===item&&s.tfTextSelected]}>{item}</Text></Pressable>)}</View>
   <Text style={s.hint}>Elegí uno. Para cambiar, tocá el timeframe activo para desmarcarlo y luego seleccioná otro.</Text>
   <View style={s.sliderHeader}><Text style={s.label}>CANTIDAD DE VELAS</Text><View style={s.quantityValue}><Text style={s.value}>{tf?value.toLocaleString('es-AR'):'—'}</Text>{tf&&<Pressable onPress={()=>{setCandleDraft(String(value));setCandleEditorOpen(true);}} style={s.pencilButton}><Text style={s.pencilText}>✎</Text></Pressable>}</View></View>
   <View onLayout={e=>setWidth(e.nativeEvent.layout.width)} onStartShouldSetResponder={()=>!!tf} onStartShouldSetResponderCapture={()=>!!tf} onMoveShouldSetResponder={()=>!!tf} onMoveShouldSetResponderCapture={()=>!!tf} onResponderTerminationRequest={()=>false} onResponderGrant={e=>slide(e.nativeEvent.locationX)} onResponderMove={e=>slide(e.nativeEvent.locationX)} style={[s.track,!tf&&s.disabled]}><View style={s.rail}/><View style={[s.progress,{width:`${fill*100}%` as `${number}%`}]}/><View style={[s.thumb,{left:`${fill*100}%` as `${number}%`}]}/></View>
   <View style={s.range}><Text style={s.muted}>{MIN.toLocaleString('es-AR')}</Text><Text style={s.muted}>{tf?max.toLocaleString('es-AR'):'MÁXIMO'}</Text></View>
   <Text style={s.hint}>{tf?'Rango permitido: '+MIN+'–'+max+' velas':'Elegí un timeframe para configurar la cantidad.'}</Text>
   <View style={s.actions}><Pressable disabled={saving} onPress={saveConfig} style={s.secondary}><Text style={s.secondaryText}>{saving?'GUARDANDO...':'GUARDAR CONFIGURACIÓN'}</Text></Pressable><Pressable onPress={resetConfig} style={s.secondary}><Text style={s.secondaryText}>RESTABLECER</Text></Pressable></View>
   <Pressable disabled={busy||!tf||!selectedInstrument||!accessPoint} onPress={importData} style={[s.importButton,(busy||!tf||!selectedInstrument||!accessPoint)&&s.disabled]}>{busy?<ActivityIndicator color="#0b0e13"/>:<Text style={s.importText}>IMPORTAR DATOS</Text>}</Pressable>
   {loaded&&<Text style={s.hint}>Configuración e historial guardados en el dispositivo.</Text>}
  </View>
  <View style={s.logHeader}><Text style={s.section}>HISTORIAL DE IMPORTACIONES</Text><Text style={s.muted}>{log.length}</Text></View>
  {log.length===0?<View style={s.card}><Text style={s.muted}>Todavía no hay importaciones registradas.</Text></View>:log.map(item=>{const expanded=!!expandedImports[item.id];return <View key={item.id} style={s.logCard}><View style={s.logTop}><View style={{flex:1,gap:4}}><Text style={s.logSymbol}>{item.symbol}</Text><Text style={s.logLine}>{item.timeframe} · {item.received.toLocaleString('es-AR')}/{item.requested.toLocaleString('es-AR')} velas · {formatDate(item.at)}</Text></View><Text style={[s.status,item.status==='OK'?s.ok:item.status==='PARCIAL'?s.partial:s.fail]}>{item.status}</Text></View>{item.message&&<Text style={s.error} numberOfLines={expanded?undefined:3}>{item.message}</Text>}<View style={s.logUtilityRow}><Pressable onPress={()=>setExpandedImports(old=>({...old,[item.id]:!expanded}))} style={s.expandButton}><Text style={s.expandButtonText}>{expanded?'▲ OCULTAR DETALLES':'▼ EXPANDIR DETALLES'}</Text></Pressable><Pressable onPress={async()=>{try{await Clipboard.setStringAsync(importLogText(item));Alert.alert('COPIADO','La información de esta importación fue copiada al portapapeles.');}catch(e){Alert.alert('ERROR AL COPIAR',e instanceof Error?e.message:String(e));}}} style={s.copyButton}><Text style={s.copyButtonText}>📎 COPIAR</Text></Pressable><Pressable onPress={()=>exportImportJson(item)} style={s.exportLogButton}><Text style={s.exportLogButtonText}>⬇ JSON</Text></Pressable></View>{expanded&&<View style={s.detailsBox}><Text style={s.detailLine}>SOLICITADAS: {item.requested.toLocaleString('es-AR')}</Text><Text style={s.detailLine}>RECIBIDAS: {item.received.toLocaleString('es-AR')}</Text><Text style={s.detailLine}>FALTANTES: {(item.missingCandles??Math.max(0,item.requested-item.received)).toLocaleString('es-AR')}</Text><Text style={s.detailLine}>PRIMERA VELA: {formatDiagnosticDate(item.firstCandle)}</Text><Text style={s.detailLine}>ÚLTIMA VELA: {formatDiagnosticDate(item.lastCandle)}</Text><Text style={s.detailLine}>PERÍODO OBSERVADO: {formatDuration(item.observedSpanMs)}</Text><Text style={s.detailLine}>PERÍODO ESPERADO: {formatDuration(item.expectedSpanMs)}</Text><Text style={s.detailLine}>HUECOS DETECTADOS: {item.gapCount??'—'}</Text><Text style={s.detailLine}>HUECOS COMPATIBLES CON FIN DE SEMANA: {item.weekendGapCount??'—'}</Text>{(item.weekendGapHours??0)>0&&<Text style={s.weekendHint}>TIEMPO ESTIMADO SIN VELAS EN ESOS HUECOS: {(item.weekendGapHours??0).toFixed(1)} h</Text>}<Text style={s.detailExplanation}>{item.status==='PARCIAL'?'Una importación parcial no significa que Exness haya borrado velas. El histórico puede contener períodos sin cotización (por ejemplo, el cierre semanal de Forex) y también puede estar limitado por la ventana histórica disponible para la solicitud. Los huecos se calculan comparando los timestamps recibidos.':'La cantidad solicitada fue recibida correctamente.'}</Text></View>}<View style={s.logActions}><Pressable onPress={()=>loadIndicators(item)} style={s.indicatorButton}><Text style={s.indicatorButtonText}>CALCULAR INDICADORES</Text></Pressable><Pressable onPress={()=>deleteImport(item)} style={s.deleteButton}><Text style={s.clearX}>✕</Text></Pressable></View></View>})}
  
  {indicator&&indicatorSource&&<View style={s.panelRow}>
   <Pressable onPress={()=>setExpandedPanels(o=>({...o,indicator:!o.indicator}))} style={s.sideToggleButton}><Text style={s.sideToggleText}>{expandedPanels.indicator?'▲\nOCULTAR\nDETALLES':'▼\nEXPANDIR\nDETALLES'}</Text></Pressable>
   <View style={s.panelCardFlex}><View style={s.panelHeader}><Text style={s.section}>INDICADORES · {indicatorSource.symbol} · {indicatorTf}</Text></View>
   {expandedPanels.indicator&&<View style={s.panelBody}><Text style={s.hint}>Valores de la última vela. Cálculo local en TypeScript.</Text><View style={s.indGrid}><InfoRow label={`ÚLTIMA RSI (${indicatorConfig.rsi.period})`} value={indicator.rsi}/><InfoRow label={`ÚLTIMA ATR (${indicatorConfig.atr.period})`} value={indicator.atr}/><InfoRow label={`ÚLTIMA EMA (${indicatorConfig.ema20.period})`} value={indicator.ema20}/><InfoRow label={`ÚLTIMA EMA (${indicatorConfig.ema50.period})`} value={indicator.ema50}/><InfoRow label={`ÚLTIMA ADX (${indicatorConfig.adx.period})`} value={indicator.adx}/><InfoRow label="ÚLTIMA MACD" value={indicator.macd}/><InfoRow label="ÚLTIMA MACD SIGNAL" value={indicator.macdSignal}/><InfoRow label="ÚLTIMA MACD HISTOGRAM" value={indicator.macdHistogram}/><InfoRow label={`ÚLTIMA BB SUPERIOR (${indicatorConfig.bollinger.period}, ${indicatorConfig.bollinger.deviation})`} value={indicator.bollingerUpper}/><InfoRow label={`ÚLTIMA BB MEDIA (${indicatorConfig.bollinger.period})`} value={indicator.bollingerMiddle}/><InfoRow label={`ÚLTIMA BB INFERIOR (${indicatorConfig.bollinger.period}, ${indicatorConfig.bollinger.deviation})`} value={indicator.bollingerLower}/><InfoRow label="ÚLTIMA BB WIDTH" value={indicator.bollingerWidth}/><InfoRow label={`ÚLTIMA Z-SCORE (${indicatorConfig.zScore.period})`} value={indicator.zScore}/></View><Pressable onPress={()=>exportImportJson(indicatorSource)} style={s.exportButton}><Text style={s.exportButtonText}>⬇ EXPORTAR JSON</Text></Pressable></View>}
   </View></View>
  {indicator&&indicatorSource&&<View style={s.panelRow}>
   <Pressable onPress={()=>setExpandedPanels(o=>({...o,calculate:!o.calculate}))} style={s.sideToggleButton}><Text style={s.sideToggleText}>{expandedPanels.calculate?'▲\nOCULTAR\nDETALLES':'▼\nEXPANDIR\nDETALLES'}</Text></Pressable>
   <View style={s.panelCardFlex}><View style={s.panelHeader}><Text style={s.section}>CALCULAR INDICADORES</Text></View>
   {expandedPanels.calculate&&<View style={s.panelBody}><Text style={s.hint}>Los cambios de configuración se aplican al volver a calcular.</Text><View style={s.actions}><Pressable onPress={()=>loadIndicators(indicatorSource)} style={[s.importButton,s.calculateIndicatorButton]}><Text style={s.calculateIndicatorText}>CALCULAR INDICADORES</Text></Pressable><Pressable onPress={()=>{setIndicator(null);setIndicatorRows([]);setIndicatorSource(null);setIndicatorTf(null);}} style={s.secondary}><Text style={s.secondaryText}>RESTABLECER INDICADORES</Text></Pressable></View></View>}
   </View></View>
  <View style={s.panelRow}>
   <Pressable onPress={()=>setExpandedPanels(o=>({...o,config:!o.config}))} style={s.sideToggleButton}><Text style={s.sideToggleText}>{expandedPanels.config?'▲\nOCULTAR\nDETALLES':'▼\nEXPANDIR\nDETALLES'}</Text></Pressable>
   <View style={s.panelCardFlex}><View style={s.panelHeader}><Text style={s.section}>CONFIGURACIÓN DE INDICADORES</Text></View>
   {expandedPanels.config&&<View style={s.panelBody}><Text style={s.hint}>Recuadro fijo. Modificá períodos y activación antes de calcular.</Text>
    <IndicatorConfigRow label="RSI" enabled={indicatorConfig.rsi.enabled} onToggle={()=>setIndicatorConfig(o=>({...o,rsi:{...o.rsi,enabled:!o.rsi.enabled}}))} value={indicatorConfig.rsi.period} onChange={v=>setIndicatorNumber('rsi','period',v)}/>
    <IndicatorConfigRow label="ATR" enabled={indicatorConfig.atr.enabled} onToggle={()=>setIndicatorConfig(o=>({...o,atr:{...o.atr,enabled:!o.atr.enabled}}))} value={indicatorConfig.atr.period} onChange={v=>setIndicatorNumber('atr','period',v)}/>
    <IndicatorConfigRow label="EMA 20" enabled={indicatorConfig.ema20.enabled} onToggle={()=>setIndicatorConfig(o=>({...o,ema20:{...o.ema20,enabled:!o.ema20.enabled}}))} value={indicatorConfig.ema20.period} onChange={v=>setIndicatorNumber('ema20','period',v)}/>
    <IndicatorConfigRow label="EMA 50" enabled={indicatorConfig.ema50.enabled} onToggle={()=>setIndicatorConfig(o=>({...o,ema50:{...o.ema50,enabled:!o.ema50.enabled}}))} value={indicatorConfig.ema50.period} onChange={v=>setIndicatorNumber('ema50','period',v)}/>
    <IndicatorConfigRow label="ADX" enabled={indicatorConfig.adx.enabled} onToggle={()=>setIndicatorConfig(o=>({...o,adx:{...o.adx,enabled:!o.adx.enabled}}))} value={indicatorConfig.adx.period} onChange={v=>setIndicatorNumber('adx','period',v)}/>
    <IndicatorConfigRow label="Z-SCORE" enabled={indicatorConfig.zScore.enabled} onToggle={()=>setIndicatorConfig(o=>({...o,zScore:{...o.zScore,enabled:!o.zScore.enabled}}))} value={indicatorConfig.zScore.period} onChange={v=>setIndicatorNumber('zScore','period',v)}/>
    <IndicatorConfigRow label="BOLLINGER" enabled={indicatorConfig.bollinger.enabled} onToggle={()=>setIndicatorConfig(o=>({...o,bollinger:{...o.bollinger,enabled:!o.bollinger.enabled}}))} value={indicatorConfig.bollinger.period} onChange={v=>setIndicatorNumber('bollinger','period',v)} extraLabel="DESVIACIÓN" extraValue={indicatorConfig.bollinger.deviation} onExtraChange={v=>setIndicatorNumber('bollinger','deviation',v)}/>
    <View style={s.macdBox}><Text style={s.configLabel}>MACD</Text><Pressable onPress={()=>setIndicatorConfig(o=>({...o,macd:{...o.macd,enabled:!o.macd.enabled}}))} style={[s.toggle,indicatorConfig.macd.enabled&&s.toggleOn]}><Text style={s.toggleText}>{indicatorConfig.macd.enabled?'ACTIVO':'INACTIVO'}</Text></Pressable><ConfigNumber label="RÁPIDO" value={indicatorConfig.macd.fast} onChange={v=>setIndicatorNumber('macd','fast',v)}/><ConfigNumber label="LENTO" value={indicatorConfig.macd.slow} onChange={v=>setIndicatorNumber('macd','slow',v)}/><ConfigNumber label="SEÑAL" value={indicatorConfig.macd.signal} onChange={v=>setIndicatorNumber('macd','signal',v)}/></View>
    <Pressable onPress={saveIndicatorConfig} style={s.importButton}><Text style={s.importText}>GUARDAR CONFIGURACIÓN DE INDICADORES</Text></Pressable>
   </View>}
  </View>

   </View></View>
  {indicator&&indicatorSource&&<View style={s.panelRow}>
   <Pressable onPress={()=>setExpandedPanels(o=>({...o,chart:!o.chart}))} style={s.sideToggleButton}><Text style={s.sideToggleText}>{expandedPanels.chart?'▲\nOCULTAR\nDETALLES':'▼\nEXPANDIR\nDETALLES'}</Text></Pressable>
   <View style={s.panelCardFlex}><View style={s.panelHeader}><Text style={s.section}>OHLC + INDICADORES</Text><Pressable onPress={()=>deleteImport(indicatorSource)} style={s.deleteButton}><Text style={s.clearX}>✕</Text></Pressable></View>
   {expandedPanels.chart&&<View style={s.panelBody}><OhlcChart rows={indicatorRows}/><Text style={s.hint}>OHLC de las últimas 60 velas con indicadores de precio dibujados sobre el gráfico. Los osciladores se muestran debajo.</Text></View>}
   </View></View>
  {indicator&&indicatorSource&&<View style={s.panelRow}>
   <Pressable onPress={()=>setExpandedPanels(o=>({...o,table:!o.table}))} style={s.sideToggleButton}><Text style={s.sideToggleText}>{expandedPanels.table?'▲\nOCULTAR\nDETALLES':'▼\nEXPANDIR\nDETALLES'}</Text></Pressable>
   <View style={s.panelCardFlex}><View style={s.panelHeader}><Text style={s.section}>TABLA OHLC + INDICADORES</Text></View>
   {expandedPanels.table&&<View style={s.panelBody}><ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled contentContainerStyle={s.tableWide}><View><View style={s.tableHeader}><TableCell label="FECHA/HORA" width={155}/><TableCell label="OPEN" width={90}/><TableCell label="HIGH" width={90}/><TableCell label="LOW" width={90}/><TableCell label="CLOSE" width={90}/><TableCell label="VOL" width={85}/><TableCell label="RSI14" width={90}/><TableCell label="ATR14" width={100}/><TableCell label="EMA20" width={105}/><TableCell label="EMA50" width={105}/><TableCell label="ADX14" width={90}/><TableCell label="MACD" width={105}/><TableCell label="MACD SIG" width={105}/><TableCell label="MACD HIST" width={105}/><TableCell label="BB UP" width={105}/><TableCell label="BB MID" width={105}/><TableCell label="BB LOW" width={105}/><TableCell label="BB WIDTH" width={105}/><TableCell label="Z-SCORE" width={100}/></View><FlatList data={indicatorRows.slice().reverse()} keyExtractor={(row,index)=>row.time+'-'+index} nestedScrollEnabled style={s.tableList} renderItem={({item})=><View style={s.tableRow}><TableCell value={new Date(item.time).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'medium'})} width={155}/><TableCell value={String(item.open)} width={90}/><TableCell value={String(item.high)} width={90}/><TableCell value={String(item.low)} width={90}/><TableCell value={String(item.close)} width={90}/><TableCell value={String(item.volume)} width={85}/><TableCell value={indicatorValue(item.rsi14)} width={90}/><TableCell value={indicatorValue(item.atr14)} width={100}/><TableCell value={indicatorValue(item.ema20)} width={105}/><TableCell value={indicatorValue(item.ema50)} width={105}/><TableCell value={indicatorValue(item.adx14)} width={90}/><TableCell value={indicatorValue(item.macd)} width={105}/><TableCell value={indicatorValue(item.macdSignal)} width={105}/><TableCell value={indicatorValue(item.macdHistogram)} width={105}/><TableCell value={indicatorValue(item.bollingerUpper)} width={105}/><TableCell value={indicatorValue(item.bollingerMiddle)} width={105}/><TableCell value={indicatorValue(item.bollingerLower)} width={105}/><TableCell value={indicatorValue(item.bollingerWidth)} width={105}/><TableCell value={indicatorValue(item.zScore)} width={100}/></View>}/></View></ScrollView></View>}
   </View></View>
 </ScrollView>
 <Modal visible={candleEditorOpen} transparent animationType="fade" onRequestClose={()=>setCandleEditorOpen(false)}>
  <View style={s.modalBackdrop}><View style={s.modalCard}><Text style={s.modalTitle}>CANTIDAD DE VELAS</Text><Text style={s.modalHint}>Rango permitido: {MIN}–{max} velas para {tf??'—'}.</Text><TextInput value={candleDraft} onChangeText={v=>setCandleDraft(v.replace(/[^0-9]/g,'').slice(0,6))} keyboardType="number-pad" style={s.numberInput} autoFocus/><View style={s.modalActions}><Pressable onPress={()=>setCandleEditorOpen(false)} style={s.secondary}><Text style={s.secondaryText}>CANCELAR</Text></Pressable><Pressable onPress={editCandleQuantity} style={s.importButton}><Text style={s.importText}>ACEPTAR</Text></Pressable></View></View></View>
 </Modal>
 </>;
}
function OhlcChart({rows}:{rows:IndicatorRow[]}){
 const data=rows.slice(-60);
 if(!data.length)return <Text style={s.muted}>No hay datos para graficar.</Text>;
 const min=Math.min(...data.map(x=>x.low)),max=Math.max(...data.map(x=>x.high)),span=max-min||1,height=240,width=Math.max(300,data.length*12);
 const priceY=(value:number)=>10+(max-value)/span*(height-20);
 const lineValues=(key:keyof IndicatorRow)=>data.map(row=>typeof row[key]==='number'&&Number.isFinite(Number(row[key]))?Number(row[key]):null);
 return <View style={s.chartStack}>
  <ScrollView horizontal showsHorizontalScrollIndicator>
   <View style={[s.chartCanvas,{width,height}]}>
    {data.map((x,i)=>{
      const left=i*12+4;const yH=priceY(x.high);const yL=priceY(x.low);const yO=priceY(x.open);const yC=priceY(x.close);
      const top=Math.min(yO,yC);const body=Math.max(2,Math.abs(yC-yO));
      return <View key={x.time+'-'+i} style={[s.chartCandle,{left}]}><View style={[s.chartWick,{top:yH,height:Math.max(1,yL-yH)}]}/><View style={[s.chartBody,{top,height:body,backgroundColor:x.close>=x.open?'#28d17c':'#e05252'}]}/></View>;
    })}
    <ChartLine values={lineValues('ema20')} min={min} max={max} height={height} step={12} width={width} lineStyle={s.chartEma20}/>
    <ChartLine values={lineValues('ema50')} min={min} max={max} height={height} step={12} width={width} lineStyle={s.chartEma50}/>
    <ChartLine values={lineValues('bollingerUpper')} min={min} max={max} height={height} step={12} width={width} lineStyle={s.chartBb}/>
    <ChartLine values={lineValues('bollingerMiddle')} min={min} max={max} height={height} step={12} width={width} lineStyle={s.chartBbMiddle}/>
    <ChartLine values={lineValues('bollingerLower')} min={min} max={max} height={height} step={12} width={width} lineStyle={s.chartBb}/>
    <View style={s.chartAxis}><Text style={s.chartAxisText}>{max.toFixed(5)}</Text><Text style={s.chartAxisText}>{min.toFixed(5)}</Text></View>
   </View>
  </ScrollView>
  <View style={s.chartLegend}><Text style={s.chartLegendText}>EMA20</Text><Text style={s.chartLegendText}>EMA50</Text><Text style={s.chartLegendText}>BOLLINGER</Text></View>
  <IndicatorMiniChart label="RSI" values={data.map(x=>x.rsi14)} min={0} max={100}/>
  <IndicatorMiniChart label="ADX" values={data.map(x=>x.adx14)} min={0}/>
  <IndicatorMiniChart label="MACD" values={data.map(x=>x.macd)} />
  <IndicatorMiniChart label="Z-SCORE" values={data.map(x=>x.zScore)} />
 </View>;
}
function ChartLine({values,min,max,height,step,width,lineStyle}:{values:(number|null)[];min:number;max:number;height:number;step:number;width:number;lineStyle:any}){
 const span=max-min||1;
 const segments=[];
 for(let i=1;i<values.length;i++){
  const a=values[i-1],b=values[i];if(a===null||b===null)continue;
  const x1=(i-1)*step+8,x2=i*step+8,y1=10+(max-a)/span*(height-20),y2=10+(max-b)/span*(height-20);
  const length=Math.sqrt((x2-x1)**2+(y2-y1)**2),angle=Math.atan2(y2-y1,x2-x1),top=(y1+y2)/2-1;
  segments.push(<View key={i} style={[s.chartLine,{left:x1,top,width:length,transform:[{rotate:`${angle}rad`}]} ,lineStyle]}/>);
 }
 return <>{segments}</>;
}
function IndicatorMiniChart({label,values,min,max}:{label:string;values:(number|null)[];min?:number;max?:number}){
 const clean=values.filter(v=>v!==null&&Number.isFinite(Number(v))) as number[];
 if(!clean.length)return null;
 const lo=min??Math.min(...clean),hi=max??Math.max(...clean),span=hi-lo||1,height=72,width=Math.max(300,values.length*12),step=12;
 const segments=[];
 for(let i=1;i<values.length;i++){
  const a=values[i-1],b=values[i];if(a===null||b===null)continue;
  const x1=(i-1)*step+4,x2=i*step+4,y1=8+(hi-a)/span*(height-16),y2=8+(hi-b)/span*(height-16);
  const length=Math.sqrt((x2-x1)**2+(y2-y1)**2),angle=Math.atan2(y2-y1,x2-x1),top=(y1+y2)/2-1;
  segments.push(<View key={i} style={[s.chartLineMini,{left:x1,top,width:length,transform:[{rotate:`${angle}rad`}]}]}/>);
 }
 return <View style={s.miniChartBlock}><Text style={s.miniChartLabel}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator><View style={[s.miniChart,{width,height}]}>{segments}</View></ScrollView></View>;
}
function ConfigNumber({label,value,onChange}:{label:string;value:number;onChange:(v:string)=>void}){return <View style={s.configNumberRow}><Text style={s.configLabel}>{label}</Text><TextInput value={String(value)} onChangeText={onChange} keyboardType="number-pad" style={s.configInput}/></View>;}
function IndicatorConfigRow({label,enabled,onToggle,value,onChange,extraLabel,extraValue,onExtraChange}:{label:string;enabled:boolean;onToggle:()=>void;value:number;onChange:(v:string)=>void;extraLabel?:string;extraValue?:number;onExtraChange?:(v:string)=>void}){return <View style={s.configRow}><View style={s.configMain}><Text style={s.configLabel}>{label}</Text><Pressable onPress={onToggle} style={[s.toggle,enabled&&s.toggleOn]}><Text style={s.toggleText}>{enabled?'ACTIVO':'INACTIVO'}</Text></Pressable></View><ConfigNumber label="PERÍODO" value={value} onChange={onChange}/>{extraLabel&&onExtraChange&&<ConfigNumber label={extraLabel} value={extraValue??0} onChange={onExtraChange}/>}</View>;}
function TableCell({label,value,width}:{label?:string;value?:string;width:number}){return <View style={[s.tableCell,{width},label&&s.tableHeaderCell]}><Text style={label?s.tableHeaderText:s.tableCellText}>{label??value??'—'}</Text></View>}
function InfoRow({label,value}:{label:string;value:string|number|null}){
 return <View style={s.infoRow}><Text style={s.infoRowLabel}>{label}</Text><Text style={s.infoRowValue}>{value===null||value===undefined?'—':String(value)}</Text></View>;
}
const s=StyleSheet.create({
 content:{padding:18,gap:14},title:{color:'#fff',fontSize:21,fontWeight:'900'},subtitle:{color:'#9da6b5',fontSize:13,lineHeight:20},
 card:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:14,padding:15,gap:13},label:{color:'#8f98a8',fontSize:11,fontWeight:'900'},
 select:{minHeight:46,borderWidth:1,borderColor:'#3b4350',borderRadius:9,paddingHorizontal:12,backgroundColor:'#0f131a',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 selectText:{color:'#fff',fontWeight:'800'},symbolList:{maxHeight:190,borderWidth:1,borderColor:'#303744',borderRadius:9,backgroundColor:'#0f131a'},symbolOption:{padding:11,borderBottomWidth:1,borderBottomColor:'#252b35'},
 timeframes:{flexDirection:'row',flexWrap:'wrap',gap:7},timeframe:{minWidth:47,flexGrow:1,paddingVertical:12,alignItems:'center',borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a'},timeframeSelected:{backgroundColor:'#fff',borderColor:'#fff'},tfText:{color:'#dce1e9',fontWeight:'900',fontSize:12},tfTextSelected:{color:'#0b0e13'},
 hint:{color:'#7f8999',fontSize:11,lineHeight:17},sliderHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},value:{color:'#fff',fontSize:18,fontWeight:'900'},
 track:{height:30,justifyContent:'center'},rail:{position:'absolute',left:0,right:0,height:6,borderRadius:3,backgroundColor:'#303744'},progress:{position:'absolute',left:0,height:6,borderRadius:3,backgroundColor:'#fff'},thumb:{position:'absolute',width:18,height:18,marginLeft:-9,borderRadius:9,backgroundColor:'#fff',borderWidth:2,borderColor:'#151a22'},
 range:{flexDirection:'row',justifyContent:'space-between'},quantityValue:{flexDirection:'row',alignItems:'center',gap:8},pencilButton:{width:34,height:34,borderWidth:1,borderColor:'#28d17c',borderRadius:8,alignItems:'center',justifyContent:'center',backgroundColor:'#0f131a'},pencilText:{color:'#28d17c',fontSize:22,fontWeight:'900'},actions:{flexDirection:'row',gap:8},secondary:{flex:1,minHeight:45,paddingHorizontal:7,borderWidth:1,borderColor:'#3b4350',borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:'#0f131a'},secondaryText:{color:'#fff',fontSize:10,fontWeight:'900',textAlign:'center'},
 importButton:{minHeight:50,borderRadius:10,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},importText:{color:'#0b0e13',fontWeight:'900'},
 selectorTools:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},selectorButtons:{flexDirection:'row',alignItems:'center',gap:7},searchButton:{width:42,height:32,borderWidth:1,borderColor:'#3b4350',borderRadius:8,alignItems:'center',justifyContent:'center',backgroundColor:'#0f131a'},searchIcon:{color:'#fff',fontSize:23,fontWeight:'900',lineHeight:24},searchX:{color:'#e05252',fontSize:19,fontWeight:'900'},searchInput:{minHeight:42,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',color:'#fff',paddingHorizontal:12,fontWeight:'800'},alphaButton:{width:42,height:32,borderWidth:1,borderColor:'#3b4350',borderRadius:8,alignItems:'center',justifyContent:'center',backgroundColor:'#0f131a'},alphaText:{color:'#fff',fontWeight:'900',fontSize:13},alphaPanel:{borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',padding:8,flexDirection:'row',alignItems:'center',gap:8},alphaGrid:{flex:1,flexDirection:'row',flexWrap:'wrap',gap:5},alphaLetter:{width:25,height:25,borderWidth:1,borderColor:'#303744',borderRadius:6,alignItems:'center',justifyContent:'center'},alphaClear:{width:30,height:30,alignItems:'center',justifyContent:'center'},clearX:{color:'#e05252',fontSize:19,fontWeight:'900'},logHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},logActions:{flexDirection:'row',alignItems:'center',gap:8,marginTop:4},indicatorButton:{flex:1,minHeight:42,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',alignItems:'center',justifyContent:'center'},indicatorButtonText:{color:'#fff',fontSize:10,fontWeight:'900'},deleteButton:{width:42,height:42,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',alignItems:'center',justifyContent:'center'},logUtilityRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:3},expandButton:{flex:1,minHeight:38,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',alignItems:'center',justifyContent:'center'},expandButtonText:{color:'#dce1e9',fontSize:10,fontWeight:'900'},copyButton:{minWidth:105,height:38,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',alignItems:'center',justifyContent:'center',paddingHorizontal:10},copyButtonText:{color:'#fff',fontSize:10,fontWeight:'900'},exportLogButton:{minWidth:78,height:38,borderWidth:1,borderColor:'#fff',borderRadius:9,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',paddingHorizontal:10},exportLogButtonText:{color:'#0b0e13',fontSize:10,fontWeight:'900'},indicatorToolbar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},indicatorTools:{flexDirection:'row',alignItems:'center',gap:7},configButton:{minHeight:40,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',paddingHorizontal:10,alignItems:'center',justifyContent:'center'},configButtonText:{color:'#fff',fontSize:10,fontWeight:'900'},tableTitle:{color:'#fff',fontSize:10,fontWeight:'900',flex:1},exportButton:{minHeight:40,borderWidth:1,borderColor:'#fff',borderRadius:9,backgroundColor:'#fff',paddingHorizontal:12,alignItems:'center',justifyContent:'center'},exportButtonText:{color:'#0b0e13',fontSize:10,fontWeight:'900'},panelRow:{flexDirection:'row',alignItems:'stretch',gap:8},panelCardFlex:{flex:1,minWidth:0,backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:12,padding:13,gap:10},panelCard:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:12,padding:13,gap:10},panelHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},panelHeaderActions:{flexDirection:'row',alignItems:'center',gap:7},panelBody:{gap:10},sideToggleButton:{width:86,minHeight:38,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',alignItems:'center',justifyContent:'center',paddingHorizontal:5},sideToggleText:{color:'#dce1e9',fontSize:9,fontWeight:'900',lineHeight:13,textAlign:'center'},expandPanelButton:{flex:1,minHeight:38,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',alignItems:'center',justifyContent:'center',paddingHorizontal:8},calculateIndicatorButton:{minHeight:50,paddingHorizontal:6},calculateIndicatorText:{color:'#0b0e13',fontSize:11,fontWeight:'900',textAlign:'center',includeFontPadding:false},chartCanvas:{position:'relative',backgroundColor:'#0f131a',borderWidth:1,borderColor:'#303744',borderRadius:9,overflow:'hidden'},chartCandle:{position:'absolute',width:8,height:210},chartWick:{position:'absolute',left:3,width:1,backgroundColor:'#9da6b5'},chartBody:{position:'absolute',left:0,width:8,borderRadius:1},chartLine:{position:'absolute',height:2,transformOrigin:'center',borderRadius:1},chartEma20:{backgroundColor:'#28d17c'},chartEma50:{backgroundColor:'#e05252'},chartBb:{backgroundColor:'#7ea7ff'},chartBbMiddle:{backgroundColor:'#b6bdc9'},chartStack:{gap:8},chartLegend:{flexDirection:'row',gap:12,flexWrap:'wrap'},chartLegendText:{color:'#9da6b5',fontSize:9,fontWeight:'900'},miniChartBlock:{gap:4},miniChartLabel:{color:'#8f98a8',fontSize:9,fontWeight:'900'},miniChart:{height:72,position:'relative',backgroundColor:'#0f131a',borderWidth:1,borderColor:'#303744',borderRadius:9},chartLineMini:{position:'absolute',height:2,backgroundColor:'#dce1e9',borderRadius:1},chartAxis:{position:'absolute',right:5,top:5,bottom:5,justifyContent:'space-between'},chartAxisText:{color:'#7f8999',fontSize:9},tableWide:{paddingBottom:4},tableList:{height:430},tableHeader:{flexDirection:'row',backgroundColor:'#252b35',borderWidth:1,borderColor:'#3b4350'},tableRow:{flexDirection:'row',borderLeftWidth:1,borderLeftColor:'#303744',borderBottomWidth:1,borderBottomColor:'#303744'},tableCell:{height:36,borderRightWidth:1,borderRightColor:'#303744',alignItems:'center',justifyContent:'center',paddingHorizontal:6},tableHeaderCell:{height:40,backgroundColor:'#252b35'},tableCellText:{color:'#dce1e9',fontSize:9,fontWeight:'700',textAlign:'center'},tableHeaderText:{color:'#fff',fontSize:9,fontWeight:'900',textAlign:'center'},detailsBox:{borderWidth:1,borderColor:'#303744',borderRadius:9,backgroundColor:'#0f131a',padding:11,gap:6},detailLine:{color:'#bfc7d4',fontSize:11,lineHeight:17},weekendHint:{color:'#f0b429',fontSize:11,fontWeight:'900',lineHeight:17},detailExplanation:{color:'#7f8999',fontSize:10,lineHeight:16,marginTop:4},section:{color:'#fff',fontSize:13,fontWeight:'900'},logCard:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:12,padding:13,gap:7},logTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},logSymbol:{color:'#fff',fontSize:15,fontWeight:'900'},status:{fontSize:11,fontWeight:'900'},ok:{color:'#28d17c'},partial:{color:'#f0b429'},fail:{color:'#e05252'},logLine:{color:'#dce1e9',fontSize:12},error:{color:'#e05252',fontSize:11,lineHeight:16},muted:{color:'#9da6b5',fontSize:12,lineHeight:18},indGrid:{gap:7},infoRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,paddingVertical:5,borderBottomWidth:1,borderBottomColor:'#252b35'},infoRowLabel:{color:'#8f98a8',fontSize:10,fontWeight:'900',flex:1},infoRowValue:{color:'#fff',fontSize:12,fontWeight:'800',textAlign:'right'},disabled:{opacity:0.45},modalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.72)',justifyContent:'center',padding:18},modalCard:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#3b4350',borderRadius:14,padding:16,gap:12},indicatorModalCard:{maxHeight:'88%'},modalTitle:{color:'#fff',fontSize:17,fontWeight:'900'},modalHint:{color:'#9da6b5',fontSize:11,lineHeight:17},numberInput:{height:48,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',color:'#fff',fontSize:18,fontWeight:'900',paddingHorizontal:12},modalActions:{flexDirection:'row',gap:8,marginTop:4},configRow:{borderBottomWidth:1,borderBottomColor:'#252b35',paddingVertical:8,gap:8},configMain:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},configLabel:{color:'#dce1e9',fontSize:10,fontWeight:'900'},toggle:{minWidth:80,minHeight:32,borderWidth:1,borderColor:'#3b4350',borderRadius:8,alignItems:'center',justifyContent:'center',backgroundColor:'#0f131a'},toggleOn:{borderColor:'#28d17c',backgroundColor:'#10251b'},toggleText:{color:'#fff',fontSize:9,fontWeight:'900'},configNumberRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},configInput:{width:110,height:38,borderWidth:1,borderColor:'#3b4350',borderRadius:8,backgroundColor:'#0f131a',color:'#fff',paddingHorizontal:10,textAlign:'right',fontWeight:'800'},macdBox:{borderTopWidth:1,borderTopColor:'#252b35',paddingTop:10,gap:8}
});
