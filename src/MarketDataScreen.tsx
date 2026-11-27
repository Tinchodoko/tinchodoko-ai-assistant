import React, { useEffect, useMemo, useRef, useState } from 'react';
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
const CHART_CONFIG_KEY='tinchodoko.market.chart.config.v1';
const UI_STATE_KEY='tinchodoko.market.ui.v1';
const AUTO_UPDATE_KEY='tinchodoko.market.autoUpdate.v1';
const AUTO_UPDATE_MS:Record<MarketTimeframe,number>={M1:60000,M5:300000,M15:900000,M30:1800000,H1:3600000,H4:14400000};
const CHART_PALETTE=['#28d17c','#e05252','#7ea7ff','#f0b429','#c084fc','#22d3ee','#fb7185','#dce1e9'];
type ChartIndicatorKey='ema20'|'ema50'|'bollinger'|'rsi'|'adx'|'macd'|'zScore';
type ChartIndicatorConfig=Record<ChartIndicatorKey,{enabled:boolean;color:string}>;
const DEFAULT_CHART_CONFIG:ChartIndicatorConfig={ema20:{enabled:true,color:'#28d17c'},ema50:{enabled:true,color:'#e05252'},bollinger:{enabled:true,color:'#7ea7ff'},rsi:{enabled:true,color:'#f0b429'},adx:{enabled:true,color:'#c084fc'},macd:{enabled:true,color:'#22d3ee'},zScore:{enabled:true,color:'#fb7185'}};
function normalizeChartConfig(raw?:Partial<ChartIndicatorConfig>):ChartIndicatorConfig{const d=DEFAULT_CHART_CONFIG;const out={...d};for(const key of Object.keys(d) as ChartIndicatorKey[])out[key]={...d[key],...(raw?.[key]??{})};return out;}
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
 const [expandedPanels,setExpandedPanels]=useState<Record<string,boolean>>({indicator:true,calculate:true,config:true,chart:true,table:true,json:true});
 const [chartConfig,setChartConfig]=useState<ChartIndicatorConfig>(DEFAULT_CHART_CONFIG);
 const [chartOptionsOpen,setChartOptionsOpen]=useState(false);
 const [chartZoom,setChartZoom]=useState(1);
 const [uiLoaded,setUiLoaded]=useState(false);
 const [autoUpdateEnabled,setAutoUpdateEnabled]=useState(false);
 const [autoUpdateTfs,setAutoUpdateTfs]=useState<MarketTimeframe[]>([]);
 const [autoUpdating,setAutoUpdating]=useState(false);
 const [indicatorModalOpen,setIndicatorModalOpen]=useState(false);
 const [indicatorModalMode,setIndicatorModalMode]=useState<'config'|'indicators'>('config');
 const [indicatorModalItem,setIndicatorModalItem]=useState<LogItem|null>(null);
 const [indicatorModalConfig,setIndicatorModalConfig]=useState<IndicatorConfig>(DEFAULT_INDICATOR_CONFIG);
 const [indicatorAvailable,setIndicatorAvailable]=useState<Record<string,boolean>>({});
 const logRef=useRef<LogItem[]>([]);
 const indicatorConfigRef=useRef<IndicatorConfig>(indicatorConfig);
 const indicatorSourceRef=useRef<LogItem|null>(null);
 useEffect(()=>{let cancelled=false;Promise.all([AsyncStorage.getItem(CONFIG_KEY),AsyncStorage.getItem(LOG_KEY),AsyncStorage.getItem(INDICATOR_CONFIG_KEY),AsyncStorage.getItem(CHART_CONFIG_KEY),AsyncStorage.getItem(UI_STATE_KEY),AsyncStorage.getItem(AUTO_UPDATE_KEY)]).then(([rawConfig,rawLog,rawIndicatorConfig,rawChartConfig,rawUi,rawAuto])=>{if(cancelled)return;if(rawConfig){try{const saved=JSON.parse(rawConfig) as Partial<Config>;const next={...DEFAULTS};for(const item of TFS){const n=Number(saved[item]);if(Number.isInteger(n)&&n>=MIN&&n<=MAX[item])next[item]=n;}setConfig(next);}catch{}}if(rawLog){try{const saved=JSON.parse(rawLog);if(Array.isArray(saved))setLog(saved.filter(x=>x&&typeof x.id==='string').slice(0,200));}catch{}}if(rawIndicatorConfig){try{setIndicatorConfig(normalizeIndicatorConfig(JSON.parse(rawIndicatorConfig)));}catch{}}if(rawChartConfig){try{setChartConfig(normalizeChartConfig(JSON.parse(rawChartConfig)));}catch{}}if(rawUi){try{const ui=JSON.parse(rawUi);if(ui&&typeof ui.expandedPanels==='object')setExpandedPanels({...{indicator:true,calculate:true,config:true,chart:true,table:true,json:true},...ui.expandedPanels});if(ui&&typeof ui.expandedImports==='object')setExpandedImports(ui.expandedImports);}catch{}}if(rawAuto){try{const a=JSON.parse(rawAuto);if(Array.isArray(a.timeframes))setAutoUpdateTfs(TFS.filter(x=>a.timeframes.includes(x)));if(a.enabled===true)setAutoUpdateEnabled(true);}catch{}}setLoaded(true);setUiLoaded(true);}).catch(()=>{setLoaded(true);setUiLoaded(true);});return()=>{cancelled=true;};},[]);
 useEffect(()=>{logRef.current=log;},[log]);
 useEffect(()=>{indicatorConfigRef.current=indicatorConfig;},[indicatorConfig]);
 useEffect(()=>{indicatorSourceRef.current=indicatorSource;},[indicatorSource]);
 useEffect(()=>{if(uiLoaded)AsyncStorage.setItem(AUTO_UPDATE_KEY,JSON.stringify({enabled:autoUpdateEnabled,timeframes:autoUpdateTfs})).catch(()=>{});},[autoUpdateEnabled,autoUpdateTfs,uiLoaded]);
 useEffect(()=>{if(!loaded)return;let cancelled=false;(async()=>{const next:Record<string,boolean>={};for(const item of log){try{next[item.id]=!!(await AsyncStorage.getItem(indicatorDatasetKey(credentials.accountId,item.symbol,item.timeframe,item.id)));}catch{next[item.id]=false;}}if(!cancelled)setIndicatorAvailable(next);})();return()=>{cancelled=true;};},[loaded,log,credentials.accountId]);
 const value=tf?config[tf]:0;
 const max=tf?MAX[tf]:MIN;
 const fill=tf?Math.max(0,Math.min(1,(value-MIN)/(max-MIN))):0;
 const symbols=useMemo(()=>instruments.slice().sort((a,b)=>a.localeCompare(b)),[instruments]);
 const filteredSymbols=useMemo(()=>{const q=instrumentSearch.trim().toUpperCase();if(q)return symbols.filter(symbol=>symbol.toUpperCase().startsWith(q));return alpha?symbols.filter(symbol=>symbol.toUpperCase().startsWith(alpha)):symbols;},[symbols,alpha,instrumentSearch]);
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
 function choose(next:MarketTimeframe){if(tf===next){setTf(null);return;}setTf(next);}
 function slide(x:number){if(!tf)return;const ratio=Math.max(0,Math.min(1,x/Math.max(1,width)));const next=Math.max(MIN,Math.min(MAX[tf],Math.round((MIN+ratio*(MAX[tf]-MIN))/10)*10));setConfig(old=>({...old,[tf]:next}));}
 useEffect(()=>{if(uiLoaded)AsyncStorage.setItem(UI_STATE_KEY,JSON.stringify({expandedPanels,expandedImports})).catch(()=>{});},[expandedPanels,expandedImports,uiLoaded]);
 async function saveConfig(){setSaving(true);try{await AsyncStorage.setItem(CONFIG_KEY,JSON.stringify(config));Alert.alert('CONFIGURACIÓN GUARDADA','Las cantidades quedaron guardadas localmente.');}catch(e){Alert.alert('ERROR AL GUARDAR',e instanceof Error?e.message:String(e));}finally{setSaving(false);}}
 async function resetConfig(){setConfig(DEFAULTS);setTf('M1');try{await AsyncStorage.setItem(CONFIG_KEY,JSON.stringify(DEFAULTS));Alert.alert('CONFIGURACIÓN RESTABLECIDA','Se restauraron todos los valores predeterminados.');}catch(e){Alert.alert('ERROR AL RESTABLECER',e instanceof Error?e.message:String(e));}}
async function saveChartConfig(next:ChartIndicatorConfig){setChartConfig(next);await AsyncStorage.setItem(CHART_CONFIG_KEY,JSON.stringify(next));}
 function setChartIndicatorEnabled(key:ChartIndicatorKey,enabled:boolean){const next={...chartConfig,[key]:{...chartConfig[key],enabled}};saveChartConfig(next).catch(()=>{});}
 function setChartIndicatorColor(key:ChartIndicatorKey,color:string){const next={...chartConfig,[key]:{...chartConfig[key],color}};saveChartConfig(next).catch(()=>{});}
 async function saveIndicatorConfig(){try{const normalized=normalizeIndicatorConfig(indicatorConfig);setIndicatorConfig(normalized);await AsyncStorage.setItem(INDICATOR_CONFIG_KEY,JSON.stringify(normalized));setIndicatorConfigOpen(false);Alert.alert('CONFIGURACIÓN DE INDICADORES','Los valores quedaron guardados. Presioná CALCULAR INDICADORES para aplicarlos.');}catch(e){Alert.alert('ERROR AL GUARDAR INDICADORES',e instanceof Error?e.message:String(e));}}
function setIndicatorNumber(section:keyof IndicatorConfig,field:string,text:string){const digits=text.replace(/[^0-9.]/g,'');setIndicatorConfig(old=>{const next:any={...old,[section]:{...old[section],[field]:digits===''?'':Number(digits)}};return next;});}
async function openIndicatorConfig(item:LogItem){
 try{const raw=await AsyncStorage.getItem(indicatorDatasetKey(credentials.accountId,item.symbol,item.timeframe,item.id));let cfg=DEFAULT_INDICATOR_CONFIG;if(raw){try{const parsed=JSON.parse(raw);if(parsed?.configuration)cfg=normalizeIndicatorConfig(parsed.configuration);}catch{}}setIndicatorModalConfig(cfg);setIndicatorModalItem(item);setIndicatorModalMode('config');setIndicatorModalOpen(true);}
 catch(e){Alert.alert('ERROR DE CONFIGURACIÓN',e instanceof Error?e.message:String(e));}
}
async function openIndicatorResults(item:LogItem){
 try{const raw=await AsyncStorage.getItem(indicatorDatasetKey(credentials.accountId,item.symbol,item.timeframe,item.id));if(!raw){await openIndicatorConfig(item);return;}const parsed=JSON.parse(raw);if(!Array.isArray(parsed.rows)||!parsed.rows.length){await openIndicatorConfig(item);return;}const rows=parsed.rows as IndicatorRow[];const last=rows[rows.length-1];const cfg=normalizeIndicatorConfig(parsed.configuration);setIndicatorModalConfig(cfg);setIndicator({rsi:last.rsi14,atr:last.atr14,ema20:last.ema20,ema50:last.ema50,adx:last.adx14,macd:last.macd,macdSignal:last.macdSignal,macdHistogram:last.macdHistogram,bollingerUpper:last.bollingerUpper,bollingerMiddle:last.bollingerMiddle,bollingerLower:last.bollingerLower,bollingerWidth:last.bollingerWidth,zScore:last.zScore});setIndicatorRows(rows);setIndicatorSource(item);setIndicatorTf(item.timeframe);setIndicatorModalItem(item);setIndicatorModalMode('indicators');setIndicatorModalOpen(true);}
 catch(e){Alert.alert('ERROR DE INDICADORES',e instanceof Error?e.message:String(e));}
}
async function calculateIndicatorsForImport(item:LogItem){
 try{const raw=await AsyncStorage.getItem(datasetKey(credentials.accountId,item.symbol,item.timeframe,item.id));const fallback=raw?raw:await AsyncStorage.getItem(datasetKey(credentials.accountId,item.symbol,item.timeframe));if(!fallback){Alert.alert('DATOS NO DISPONIBLES','No se encontraron las velas de esta importación.');return;}const parsed=JSON.parse(fallback);const candles=Array.isArray(parsed.candles)?parsed.candles:[] as MarketCandle[];if(candles.length<20){Alert.alert('DATOS INSUFICIENTES','Se necesitan al menos 20 velas para calcular los indicadores.');return;}const cfg=normalizeIndicatorConfig(indicatorModalConfig);const rows=calculateIndicatorSeries(candles,cfg);const snapshot=calculateIndicators(candles,cfg);await AsyncStorage.setItem(indicatorDatasetKey(credentials.accountId,item.symbol,item.timeframe,item.id),JSON.stringify({version:2,symbol:item.symbol,timeframe:item.timeframe,sourceCandleCount:candles.length,generatedAt:Date.now(),configuration:cfg,rows}));setIndicatorAvailable(old=>({...old,[item.id]:true}));setIndicator(snapshot);setIndicatorRows(rows);setIndicatorSource(item);setIndicatorTf(item.timeframe);setIndicatorModalConfig(cfg);setIndicatorModalMode('indicators');}
 catch(e){Alert.alert('ERROR DE INDICADORES',e instanceof Error?e.message:String(e));}
}
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
   const indicatorByTime=new Map(rows.map(row=>[row.time,row]));
   const unifiedCandles=candles.map((candle:MarketCandle)=>{
    const row=indicatorByTime.get(candle.time);
    return {
     time:candle.time,
     open:candle.open,
     high:candle.high,
     low:candle.low,
     close:candle.close,
     volume:candle.volume,
     rsi14:row?.rsi14??null,
     atr14:row?.atr14??null,
     ema20:row?.ema20??null,
     ema50:row?.ema50??null,
     adx14:row?.adx14??null,
     macd:row?.macd??null,
     macdSignal:row?.macdSignal??null,
     macdHistogram:row?.macdHistogram??null,
     bollingerUpper:row?.bollingerUpper??null,
     bollingerMiddle:row?.bollingerMiddle??null,
     bollingerLower:row?.bollingerLower??null,
     bollingerWidth:row?.bollingerWidth??null,
     zScore:row?.zScore??null
    };
   });
   const payload={
    format:'tinchodoko-market-data',
    version:2,
    exportedAt:new Date().toISOString(),
    source:'Exness',
    symbol:item.symbol,
    timeframe:item.timeframe,
    indicatorCalculation:'local-typescript',
    indicatorConfiguration:indicatorRaw?JSON.parse(indicatorRaw)?.configuration??indicatorConfig:indicatorConfig,
    import:{id:item.id,requested:item.requested,received:item.received,importedAt:new Date(item.at).toISOString(),diagnostics:{
      firstCandle:item.firstCandle,lastCandle:item.lastCandle,observedSpanMs:item.observedSpanMs,expectedSpanMs:item.expectedSpanMs,gapCount:item.gapCount,weekendGapCount:item.weekendGapCount,weekendGapHours:item.weekendGapHours,missingCandles:item.missingCandles
    }},
    candles:unifiedCandles
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
 async function updateImportedTimeframe(timeframe:MarketTimeframe){
  if(!accessPoint||!credentials.apiKey||!credentials.secret||!credentials.accountId)return;
  const targets=logRef.current.filter(item=>item.timeframe===timeframe&&item.status!=='FALLO');
  for(const item of targets){
   try{
    const candles=await getMarketCandles(credentials,accessPoint,item.symbol,timeframe,item.requested);
    const now=Date.now();
    const diagnostics=buildImportDiagnostics(candles,item.requested,timeframe);
    const updated:LogItem={...item,received:candles.length,at:now,status:candles.length===item.requested?'OK':'PARCIAL',message:candles.length===item.requested?undefined:'Exness devolvió '+candles.length+' de '+item.requested+' velas.',...diagnostics};
    await AsyncStorage.setItem(datasetKey(credentials.accountId,item.symbol,timeframe,item.id),JSON.stringify({id:item.id,symbol:item.symbol,timeframe,requested:item.requested,received:candles.length,importedAt:now,candles}));
    const existingIndicatorRaw=await AsyncStorage.getItem(indicatorDatasetKey(credentials.accountId,item.symbol,item.timeframe,item.id));
    if(existingIndicatorRaw){
     try{const saved=JSON.parse(existingIndicatorRaw);const cfg=normalizeIndicatorConfig(saved?.configuration??indicatorConfigRef.current);const rows=calculateIndicatorSeries(candles,cfg);const snapshot=calculateIndicators(candles,cfg);await AsyncStorage.setItem(indicatorDatasetKey(credentials.accountId,item.symbol,timeframe,item.id),JSON.stringify({version:2,symbol:item.symbol,timeframe,sourceCandleCount:candles.length,generatedAt:now,configuration:cfg,rows}));setIndicatorAvailable(old=>({...old,[item.id]:true}));if(indicatorSourceRef.current?.id===item.id){setIndicator(snapshot);setIndicatorRows(rows);setIndicatorSource(updated);setIndicatorTf(timeframe);indicatorSourceRef.current=updated;}}catch{}
    }
    const next=logRef.current.map(x=>x.id===item.id?updated:x);logRef.current=next;setLog(next);
   }catch(e){
    const message=e instanceof Error?e.message:String(e);
    const next=logRef.current.map(x=>x.id===item.id?{...x,at:Date.now(),status:'FALLO' as const,message}:x);
    logRef.current=next;setLog(next);
   }
  }
 }
 function toggleAutoUpdateTimeframe(timeframe:MarketTimeframe){setAutoUpdateTfs(current=>current.includes(timeframe)?current.filter(x=>x!==timeframe):[...current,timeframe]);}
 function toggleAutoUpdate(){
  if(autoUpdateEnabled){setAutoUpdateEnabled(false);return;}
  if(!autoUpdateTfs.length){Alert.alert('ACTUALIZACIÓN AUTOMÁTICA','Seleccioná al menos un timeframe.');return;}
  if(!accessPoint||!credentials.apiKey||!credentials.secret||!credentials.accountId){Alert.alert('CUENTA NO CONECTADA','Primero conectá tu cuenta demo de Exness.');return;}
  setAutoUpdateEnabled(true);
 }
 useEffect(()=>{
  if(!autoUpdateEnabled||!autoUpdateTfs.length||!accessPoint||!credentials.apiKey||!credentials.secret||!credentials.accountId)return;
  let cancelled=false;
  const timers=autoUpdateTfs.map(timeframe=>{
   const run=()=>{if(!cancelled){setAutoUpdating(true);void updateImportedTimeframe(timeframe).finally(()=>{if(!cancelled)setAutoUpdating(false);});}};
   run();
   return setInterval(run,AUTO_UPDATE_MS[timeframe]);
  });
  return()=>{cancelled=true;timers.forEach(clearInterval);};
 },[autoUpdateEnabled,autoUpdateTfs,accessPoint,credentials.apiKey,credentials.secret,credentials.accountId]);
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
  <View style={s.autoCard}>
   <View style={s.autoHeader}><View style={{flex:1,gap:4}}><Text style={s.section}>ACTUALIZACIÓN DE DATOS AUTOMÁTICA</Text><Text style={s.hint}>Cada timeframe seleccionado se actualiza con su propio intervalo: M1 1 min · M5 5 min · M15 15 min · M30 30 min · H1 1 h · H4 4 h.</Text></View><Pressable onPress={toggleAutoUpdate} style={[s.autoToggle,autoUpdateEnabled?s.autoToggleOn:s.autoToggleOff]}><Text style={s.autoToggleText}>{autoUpdateEnabled?'DESACTIVAR':'ACTIVAR'}</Text></Pressable></View>
   <View style={s.timeframes}>{TFS.map(item=><Pressable key={item} onPress={()=>toggleAutoUpdateTimeframe(item)} style={[s.timeframe,s.autoTimeframe,autoUpdateTfs.includes(item)&&s.autoTimeframeSelected]}><Text style={[s.tfText,autoUpdateTfs.includes(item)&&s.tfTextSelected]}>{item}</Text></Pressable>)}</View>
   <Text style={s.hint}>{autoUpdateTfs.length?('Seleccionados: '+autoUpdateTfs.join(' · ')+(autoUpdating?' · ACTUALIZANDO...':'')):'Seleccioná uno o varios timeframes.'}</Text>
  </View>
  <View style={s.logHeader}><Text style={s.section}>HISTORIAL DE IMPORTACIONES</Text><Text style={s.muted}>{log.length}</Text></View>
  {log.length===0?<View style={s.card}><Text style={s.muted}>Todavía no hay importaciones registradas.</Text></View>:log.map(item=>{const expanded=!!expandedImports[item.id];return <View key={item.id} style={s.logCard}><View style={s.logTop}><Pressable onPress={()=>setExpandedImports(old=>({...old,[item.id]:!expanded}))} style={s.logHeaderToggle}><Text style={s.logArrow}>{expanded?'▲':'▼'}</Text><View style={{flex:1,gap:4}}><Text style={s.logSymbol}>{item.symbol}</Text><Text style={s.logLine}>{item.timeframe} · {item.received.toLocaleString('es-AR')}/{item.requested.toLocaleString('es-AR')} velas · {formatDate(item.at)}</Text></View></Pressable><Text style={[s.status,item.status==='OK'?s.ok:item.status==='PARCIAL'?s.partial:s.fail]}>{item.status}</Text></View>{item.message&&<Text style={s.error} numberOfLines={expanded?undefined:3}>{item.message}</Text>}<View style={s.logUtilityRow}><Pressable onPress={async()=>{try{await Clipboard.setStringAsync(importLogText(item));Alert.alert('COPIADO','La información de esta importación fue copiada al portapapeles.');}catch(e){Alert.alert('ERROR AL COPIAR',e instanceof Error?e.message:String(e));}}} style={s.copyButton}><Text style={s.copyButtonText}>📎 COPIAR</Text></Pressable><Pressable onPress={()=>exportImportJson(item)} style={s.exportLogButton}><Text style={s.exportLogButtonText}>⬇ JSON</Text></Pressable>{indicatorAvailable[item.id]&&<Pressable onPress={()=>void openIndicatorResults(item)} style={s.indicatorHistoryButton}><Text style={s.indicatorHistoryButtonText}>INDICADORES</Text></Pressable>}</View>{expanded&&<View style={s.detailsBox}><Text style={s.detailLine}>SOLICITADAS: {item.requested.toLocaleString('es-AR')}</Text><Text style={s.detailLine}>RECIBIDAS: {item.received.toLocaleString('es-AR')}</Text><Text style={s.detailLine}>FALTANTES: {(item.missingCandles??Math.max(0,item.requested-item.received)).toLocaleString('es-AR')}</Text><Text style={s.detailLine}>PRIMERA VELA: {formatDiagnosticDate(item.firstCandle)}</Text><Text style={s.detailLine}>ÚLTIMA VELA: {formatDiagnosticDate(item.lastCandle)}</Text><Text style={s.detailLine}>PERÍODO OBSERVADO: {formatDuration(item.observedSpanMs)}</Text><Text style={s.detailLine}>PERÍODO ESPERADO: {formatDuration(item.expectedSpanMs)}</Text><Text style={s.detailLine}>HUECOS DETECTADOS: {item.gapCount??'—'}</Text><Text style={s.detailLine}>HUECOS COMPATIBLES CON FIN DE SEMANA: {item.weekendGapCount??'—'}</Text>{(item.weekendGapHours??0)>0&&<Text style={s.weekendHint}>TIEMPO ESTIMADO SIN VELAS EN ESOS HUECOS: {(item.weekendGapHours??0).toFixed(1)} h</Text>}<Text style={s.detailExplanation}>{item.status==='PARCIAL'?'Una importación parcial no significa que Exness haya borrado velas. El histórico puede contener períodos sin cotización (por ejemplo, el cierre semanal de Forex) y también puede estar limitado por la ventana histórica disponible para la solicitud. Los huecos se calculan comparando los timestamps recibidos.':'La cantidad solicitada fue recibida correctamente.'}</Text></View>}<View style={s.logActions}><Pressable onPress={()=>void openIndicatorConfig(item)} style={s.indicatorButton}><Text style={s.indicatorButtonText}>CALCULAR INDICADORES</Text></Pressable><Pressable onPress={()=>deleteImport(item)} style={s.deleteButton}><Text style={s.clearX}>✕</Text></Pressable></View></View>})}
  </ScrollView>
  <Modal visible={indicatorModalOpen} transparent animationType="slide" onRequestClose={()=>setIndicatorModalOpen(false)}>
   <View style={s.indicatorModalBackdrop}><View style={s.indicatorModalCard}>
    <View style={s.indicatorModalHeader}><Pressable onPress={()=>setIndicatorModalOpen(false)} style={s.indicatorModalClose}><Text style={s.clearX}>✕</Text></Pressable><Text style={s.modalTitle}>{indicatorModalMode==='config'?'CONFIGURACIÓN DE INDICADORES':'INDICADORES · '+(indicatorModalItem?.symbol??'—')+' · '+(indicatorModalItem?.timeframe??'—')}</Text></View>
    {indicatorModalItem&&indicatorModalMode==='config'&&<ScrollView contentContainerStyle={s.indicatorModalBody}>
     <Text style={s.modalHint}>Configuración independiente de {indicatorModalItem.symbol} {indicatorModalItem.timeframe}. Estos valores se guardan junto con sus indicadores.</Text>
     <IndicatorConfigRow label="RSI" enabled={indicatorModalConfig.rsi.enabled} onToggle={()=>setIndicatorModalConfig(o=>({...o,rsi:{...o.rsi,enabled:!o.rsi.enabled}}))} value={indicatorModalConfig.rsi.period} onChange={v=>setIndicatorModalConfig(o=>({...o,rsi:{...o.rsi,period:Number(v.replace(/[^0-9.]/g,''))||0}}))}/>
     <IndicatorConfigRow label="ATR" enabled={indicatorModalConfig.atr.enabled} onToggle={()=>setIndicatorModalConfig(o=>({...o,atr:{...o.atr,enabled:!o.atr.enabled}}))} value={indicatorModalConfig.atr.period} onChange={v=>setIndicatorModalConfig(o=>({...o,atr:{...o.atr,period:Number(v.replace(/[^0-9.]/g,''))||0}}))}/>
     <IndicatorConfigRow label="EMA 20" enabled={indicatorModalConfig.ema20.enabled} onToggle={()=>setIndicatorModalConfig(o=>({...o,ema20:{...o.ema20,enabled:!o.ema20.enabled}}))} value={indicatorModalConfig.ema20.period} onChange={v=>setIndicatorModalConfig(o=>({...o,ema20:{...o.ema20,period:Number(v.replace(/[^0-9.]/g,''))||0}}))}/>
     <IndicatorConfigRow label="EMA 50" enabled={indicatorModalConfig.ema50.enabled} onToggle={()=>setIndicatorModalConfig(o=>({...o,ema50:{...o.ema50,enabled:!o.ema50.enabled}}))} value={indicatorModalConfig.ema50.period} onChange={v=>setIndicatorModalConfig(o=>({...o,ema50:{...o.ema50,period:Number(v.replace(/[^0-9.]/g,''))||0}}))}/>
     <IndicatorConfigRow label="ADX" enabled={indicatorModalConfig.adx.enabled} onToggle={()=>setIndicatorModalConfig(o=>({...o,adx:{...o.adx,enabled:!o.adx.enabled}}))} value={indicatorModalConfig.adx.period} onChange={v=>setIndicatorModalConfig(o=>({...o,adx:{...o.adx,period:Number(v.replace(/[^0-9.]/g,''))||0}}))}/>
     <IndicatorConfigRow label="Z-SCORE" enabled={indicatorModalConfig.zScore.enabled} onToggle={()=>setIndicatorModalConfig(o=>({...o,zScore:{...o.zScore,enabled:!o.zScore.enabled}}))} value={indicatorModalConfig.zScore.period} onChange={v=>setIndicatorModalConfig(o=>({...o,zScore:{...o.zScore,period:Number(v.replace(/[^0-9.]/g,''))||0}}))}/>
     <IndicatorConfigRow label="BOLLINGER" enabled={indicatorModalConfig.bollinger.enabled} onToggle={()=>setIndicatorModalConfig(o=>({...o,bollinger:{...o.bollinger,enabled:!o.bollinger.enabled}}))} value={indicatorModalConfig.bollinger.period} onChange={v=>setIndicatorModalConfig(o=>({...o,bollinger:{...o.bollinger,period:Number(v.replace(/[^0-9.]/g,''))||0}}))} extraLabel="DESVIACIÓN" extraValue={indicatorModalConfig.bollinger.deviation} onExtraChange={v=>setIndicatorModalConfig(o=>({...o,bollinger:{...o.bollinger,deviation:Number(v.replace(/[^0-9.]/g,''))||0}}))}/>
     <View style={s.macdBox}><Text style={s.configLabel}>MACD</Text><Pressable onPress={()=>setIndicatorModalConfig(o=>({...o,macd:{...o.macd,enabled:!o.macd.enabled}}))} style={[s.toggle,indicatorModalConfig.macd.enabled&&s.toggleOn]}><Text style={s.toggleText}>{indicatorModalConfig.macd.enabled?'ACTIVO':'INACTIVO'}</Text></Pressable><ConfigNumber label="RÁPIDO" value={indicatorModalConfig.macd.fast} onChange={v=>setIndicatorModalConfig(o=>({...o,macd:{...o.macd,fast:Number(v.replace(/[^0-9.]/g,''))||0}}))}/><ConfigNumber label="LENTO" value={indicatorModalConfig.macd.slow} onChange={v=>setIndicatorModalConfig(o=>({...o,macd:{...o.macd,slow:Number(v.replace(/[^0-9.]/g,''))||0}}))}/><ConfigNumber label="SEÑAL" value={indicatorModalConfig.macd.signal} onChange={v=>setIndicatorModalConfig(o=>({...o,macd:{...o.macd,signal:Number(v.replace(/[^0-9.]/g,''))||0}}))}/></View>
     <Pressable onPress={()=>void calculateIndicatorsForImport(indicatorModalItem)} style={s.importButton}><Text style={s.importText}>CALCULAR INDICADORES</Text></Pressable>
    </ScrollView>}
    {indicatorModalItem&&indicatorModalMode==='indicators'&&indicator&&indicatorRows.length>0&&<ScrollView contentContainerStyle={s.indicatorModalBody}>
     <View style={s.panelCard}><View style={s.panelHeader}><Text style={s.section}>INDICADORES · {indicatorModalItem.symbol} · {indicatorModalItem.timeframe}</Text></View><View style={s.panelBody}><Text style={s.hint}>Valores de la última vela. Cálculo local en TypeScript.</Text><View style={s.indGrid}><InfoRow label={`ÚLTIMA RSI (${indicatorModalConfig.rsi.period})`} value={indicator.rsi}/><InfoRow label={`ÚLTIMA ATR (${indicatorModalConfig.atr.period})`} value={indicator.atr}/><InfoRow label={`ÚLTIMA EMA (${indicatorModalConfig.ema20.period})`} value={indicator.ema20}/><InfoRow label={`ÚLTIMA EMA (${indicatorModalConfig.ema50.period})`} value={indicator.ema50}/><InfoRow label={`ÚLTIMA ADX (${indicatorModalConfig.adx.period})`} value={indicator.adx}/><InfoRow label="ÚLTIMA MACD" value={indicator.macd}/><InfoRow label="ÚLTIMA MACD SIGNAL" value={indicator.macdSignal}/><InfoRow label="ÚLTIMA MACD HISTOGRAM" value={indicator.macdHistogram}/><InfoRow label={`ÚLTIMA BB SUPERIOR (${indicatorModalConfig.bollinger.period}, ${indicatorModalConfig.bollinger.deviation})`} value={indicator.bollingerUpper}/><InfoRow label={`ÚLTIMA BB MEDIA (${indicatorModalConfig.bollinger.period})`} value={indicator.bollingerMiddle}/><InfoRow label={`ÚLTIMA BB INFERIOR (${indicatorModalConfig.bollinger.period}, ${indicatorModalConfig.bollinger.deviation})`} value={indicator.bollingerLower}/><InfoRow label="ÚLTIMA BB WIDTH" value={indicator.bollingerWidth}/><InfoRow label={`ÚLTIMA Z-SCORE (${indicatorModalConfig.zScore.period})`} value={indicator.zScore}/></View></View></View>
     <View style={s.panelCard}><View style={s.panelHeader}><Text style={s.section}>OHLC + INDICADORES</Text><Pressable onPress={()=>setChartOptionsOpen(true)} style={s.configButton}><Text style={s.configButtonText}>INDICADORES Y COLORES</Text></Pressable></View><View style={s.panelBody}><OhlcChart rows={indicatorRows} chartConfig={chartConfig} zoom={chartZoom}/><View style={s.chartZoomRow}><Text style={s.chartZoomLabel}>ZOOM {Math.round(chartZoom*100)}%</Text><Pressable onPress={()=>setChartZoom(v=>Math.max(0.7,Number((v-0.1).toFixed(1))))} style={s.chartZoomButton}><Text style={s.chartZoomText}>−</Text></Pressable><Pressable onPress={()=>setChartZoom(v=>Math.min(2.5,Number((v+0.1).toFixed(1))))} style={s.chartZoomButton}><Text style={s.chartZoomText}>+</Text></Pressable></View><Text style={s.hint}>Las velas, indicadores, cuadrícula, precios y horarios comparten el mismo desplazamiento horizontal. El zoom también mantiene sincronizados todos los indicadores.</Text></View></View>
     <View style={s.panelCard}><View style={s.panelHeader}><Text style={s.section}>TABLA OHLC + INDICADORES</Text></View><View style={s.panelBody}><ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled contentContainerStyle={s.tableWide}><View><View style={s.tableHeader}><TableCell label="FECHA/HORA" width={155}/><TableCell label="OPEN" width={90}/><TableCell label="HIGH" width={90}/><TableCell label="LOW" width={90}/><TableCell label="CLOSE" width={90}/><TableCell label="VOL" width={85}/><TableCell label="RSI14" width={90}/><TableCell label="ATR14" width={100}/><TableCell label="EMA20" width={105}/><TableCell label="EMA50" width={105}/><TableCell label="ADX14" width={90}/><TableCell label="MACD" width={105}/><TableCell label="MACD SIG" width={105}/><TableCell label="MACD HIST" width={105}/><TableCell label="BB UP" width={105}/><TableCell label="BB MID" width={105}/><TableCell label="BB LOW" width={105}/><TableCell label="BB WIDTH" width={105}/><TableCell label="Z-SCORE" width={100}/></View><FlatList data={indicatorRows.slice().reverse()} keyExtractor={(row,index)=>row.time+'-'+index} nestedScrollEnabled style={s.tableList} renderItem={({item})=><View style={s.tableRow}><TableCell value={new Date(item.time).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'medium'})} width={155}/><TableCell value={String(item.open)} width={90}/><TableCell value={String(item.high)} width={90}/><TableCell value={String(item.low)} width={90}/><TableCell value={String(item.close)} width={90}/><TableCell value={String(item.volume)} width={85}/><TableCell value={indicatorValue(item.rsi14)} width={90}/><TableCell value={indicatorValue(item.atr14)} width={100}/><TableCell value={indicatorValue(item.ema20)} width={105}/><TableCell value={indicatorValue(item.ema50)} width={105}/><TableCell value={indicatorValue(item.adx14)} width={90}/><TableCell value={indicatorValue(item.macd)} width={105}/><TableCell value={indicatorValue(item.macdSignal)} width={105}/><TableCell value={indicatorValue(item.macdHistogram)} width={105}/><TableCell value={indicatorValue(item.bollingerUpper)} width={105}/><TableCell value={indicatorValue(item.bollingerMiddle)} width={105}/><TableCell value={indicatorValue(item.bollingerLower)} width={105}/><TableCell value={indicatorValue(item.bollingerWidth)} width={105}/><TableCell value={indicatorValue(item.zScore)} width={100}/></View>}/></View></ScrollView></View></View>
     <View style={s.panelCard}><View style={s.panelHeader}><Text style={s.section}>JSON ESTRUCTURADO</Text></View><View style={s.panelBody}><Text style={s.hint}>Vista de la estructura correspondiente a esta importación calculada.</Text><ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled><View style={s.jsonBox}><Text selectable style={s.jsonText}>{buildStructuredJsonPreview(indicatorRows,indicatorModalItem.symbol,indicatorModalItem.timeframe)}</Text></View></ScrollView></View></View>
     <Pressable onPress={()=>void openIndicatorConfig(indicatorModalItem)} style={s.secondary}><Text style={s.secondaryText}>EDITAR CONFIGURACIÓN Y RECALCULAR</Text></Pressable>
    </ScrollView>}
   </View></View>
  </Modal>
  <Modal visible={chartOptionsOpen} transparent animationType="fade" onRequestClose={()=>setChartOptionsOpen(false)}>
  <View style={s.modalBackdrop}><View style={[s.modalCard,s.chartOptionsCard]}><Text style={s.modalTitle}>INDICADORES DEL GRÁFICO</Text><Text style={s.modalHint}>Activá o desactivá cada indicador y elegí su color. Los cambios se guardan automáticamente.</Text>
   {(Object.keys(chartConfig) as ChartIndicatorKey[]).map(key=>{const labels:Record<ChartIndicatorKey,string>={ema20:'EMA 20',ema50:'EMA 50',bollinger:'BOLLINGER',rsi:'RSI',adx:'ADX',macd:'MACD',zScore:'Z-SCORE'};return <View key={key} style={s.chartOptionRow}><View style={s.chartOptionTop}><Text style={s.configLabel}>{labels[key]}</Text><Pressable onPress={()=>setChartIndicatorEnabled(key,!chartConfig[key].enabled)} style={[s.toggle,chartConfig[key].enabled&&s.toggleOn]}><Text style={s.toggleText}>{chartConfig[key].enabled?'MOSTRAR':'OCULTO'}</Text></Pressable></View><View style={s.colorRow}>{CHART_PALETTE.map(color=><Pressable key={color} onPress={()=>setChartIndicatorColor(key,color)} style={[s.colorButton,{backgroundColor:color,borderColor:chartConfig[key].color===color?'#fff':'#3b4350'}]}><Text style={s.colorButtonText}>{chartConfig[key].color===color?'✓':''}</Text></Pressable>)}</View></View>;})}
   <Pressable onPress={()=>setChartOptionsOpen(false)} style={s.importButton}><Text style={s.importText}>CERRAR</Text></Pressable>
  </View></View>
 </Modal>
 <Modal visible={candleEditorOpen} transparent animationType="fade" onRequestClose={()=>setCandleEditorOpen(false)}>
  <View style={s.modalBackdrop}><View style={s.modalCard}><Text style={s.modalTitle}>CANTIDAD DE VELAS</Text><Text style={s.modalHint}>Rango permitido: {MIN}–{max} velas para {tf??'—'}.</Text><TextInput value={candleDraft} onChangeText={v=>setCandleDraft(v.replace(/[^0-9]/g,'').slice(0,6))} keyboardType="number-pad" style={s.numberInput} autoFocus/><View style={s.modalActions}><Pressable onPress={()=>setCandleEditorOpen(false)} style={s.secondary}><Text style={s.secondaryText}>CANCELAR</Text></Pressable><Pressable onPress={editCandleQuantity} style={s.importButton}><Text style={s.importText}>ACEPTAR</Text></Pressable></View></View></View>
 </Modal>
 </>;
}
function buildStructuredJsonPreview(rows:IndicatorRow[],symbol:string,timeframe:MarketTimeframe|null){
 const row=rows.length?rows[rows.length-1]:null;
 const candle=row?{
  time:row.time,
  open:row.open,
  high:row.high,
  low:row.low,
  close:row.close,
  volume:row.volume,
  rsi14:row.rsi14,
  atr14:row.atr14,
  ema20:row.ema20,
  ema50:row.ema50,
  adx14:row.adx14,
  macd:row.macd,
  macdSignal:row.macdSignal,
  macdHistogram:row.macdHistogram,
  bollingerUpper:row.bollingerUpper,
  bollingerMiddle:row.bollingerMiddle,
  bollingerLower:row.bollingerLower,
  bollingerWidth:row.bollingerWidth,
  zScore:row.zScore
 }:null;
 return JSON.stringify({format:'tinchodoko-market-data',version:2,symbol,timeframe,candles:candle?[candle]:[]},null,2);
}
function formatChartTime(value:string){const d=new Date(value);return pad(d.getDate())+pad(d.getMonth()+1)+'-'+pad(d.getHours())+pad(d.getMinutes());}
function OhlcChart({rows,chartConfig,zoom}:{rows:IndicatorRow[];chartConfig:ChartIndicatorConfig;zoom:number}){
 const data=rows.slice(-60);if(!data.length)return <Text style={s.muted}>No hay datos para graficar.</Text>;
 const [selectedIndex,setSelectedIndex]=useState<number|null>(null);
 const step=16*zoom,width=Math.max(420,48+(data.length-1)*step+step+10),height=270,plotTop=12,plotBottom=height-34,plotHeight=plotBottom-plotTop;
 const min=Math.min(...data.map(x=>x.low)),max=Math.max(...data.map(x=>x.high)),span=max-min||1,priceY=(v:number)=>plotTop+(max-v)/span*plotHeight;
 const lineValues=(key:keyof IndicatorRow)=>data.map(row=>typeof row[key]==='number'&&Number.isFinite(Number(row[key]))?Number(row[key]):null);
 const selected=selectedIndex===null?null:data[selectedIndex];
 const selectedX=selectedIndex===null?null:48+selectedIndex*step+step*.29;
 const valueText=(v:number|null|undefined)=>v===null||v===undefined?'—':Number(v).toPrecision(7);
 const selectionInfo=selected?'VELA '+formatChartTime(selected.time)+' · O '+valueText(selected.open)+' H '+valueText(selected.high)+' L '+valueText(selected.low)+' C '+valueText(selected.close)+' · VOL '+valueText(selected.volume):'Mantené presionada una vela para ver sus valores y la línea vertical sincronizada.';
 return <View style={s.chartStack}><Text style={s.chartSelectionInfo}>{selectionInfo}</Text><ScrollView horizontal showsHorizontalScrollIndicator scrollEventThrottle={16}><View style={{width}}>
  <View style={[s.chartCanvas,{width,height}]}>
   {Array.from({length:6},(_,i)=>{const y=plotTop+(plotHeight/5)*i;return <View key={'h'+i} style={[s.chartGridH,{top:y}]}/>;})}
   {data.map((x,i)=>{const left=48+i*step,yH=priceY(x.high),yL=priceY(x.low),yO=priceY(x.open),yC=priceY(x.close),top=Math.min(yO,yC),body=Math.max(2,Math.abs(yC-yO));return <Pressable key={x.time+'-'+i} onLongPress={()=>setSelectedIndex(i)} delayLongPress={350} style={[s.chartCandle,{left,width:Math.max(6,step*.58)}]}><View style={[s.chartWick,{left:Math.max(1,step*.29),top:yH,height:Math.max(1,yL-yH)}]}/><View style={[s.chartBody,{width:Math.max(6,step*.58),top,height:body,backgroundColor:x.close>=x.open?'#28d17c':'#e05252'}]}/>{i%5===0&&<Text style={[s.chartTimeText,{left:Math.max(0,left-10),top:height-30}]}>{formatChartTime(x.time)}</Text>}</Pressable>;})}
   {data.map((_,i)=>i%5===0?<View key={'v'+i} style={[s.chartGridV,{left:48+i*step}]}/>:null)}
   {chartConfig.ema20.enabled&&<ChartLine values={lineValues('ema20')} min={min} max={max} height={height} step={step} lineStyle={{backgroundColor:chartConfig.ema20.color}} top={plotTop} bottom={plotBottom} leftOffset={48}/>}
   {chartConfig.ema50.enabled&&<ChartLine values={lineValues('ema50')} min={min} max={max} height={height} step={step} lineStyle={{backgroundColor:chartConfig.ema50.color}} top={plotTop} bottom={plotBottom} leftOffset={48}/>}
   {chartConfig.bollinger.enabled&&<><ChartLine values={lineValues('bollingerUpper')} min={min} max={max} height={height} step={step} lineStyle={{backgroundColor:chartConfig.bollinger.color}} top={plotTop} bottom={plotBottom} leftOffset={48}/><ChartLine values={lineValues('bollingerMiddle')} min={min} max={max} height={height} step={step} lineStyle={{backgroundColor:chartConfig.bollinger.color,opacity:.65}} top={plotTop} bottom={plotBottom} leftOffset={48}/><ChartLine values={lineValues('bollingerLower')} min={min} max={max} height={height} step={step} lineStyle={{backgroundColor:chartConfig.bollinger.color}} top={plotTop} bottom={plotBottom} leftOffset={48}/></>}
   {selectedX!==null&&<View pointerEvents="none" style={[s.chartSelectionLine,{left:selectedX,top:0,height}]}/>}
  </View>
  <View style={s.chartLegend}><Text style={[s.chartLegendText,{color:chartConfig.ema20.color}]}>EMA20</Text><Text style={[s.chartLegendText,{color:chartConfig.ema50.color}]}>EMA50</Text><Text style={[s.chartLegendText,{color:chartConfig.bollinger.color}]}>BOLLINGER</Text></View>
  <IndicatorMiniChart label="RSI" values={data.map(x=>x.rsi14)} min={0} max={100} width={width} color={chartConfig.rsi.color} enabled={chartConfig.rsi.enabled} selectedIndex={selectedIndex} step={step}/>
  <IndicatorMiniChart label="ADX" values={data.map(x=>x.adx14)} min={0} max={100} width={width} color={chartConfig.adx.color} enabled={chartConfig.adx.enabled} selectedIndex={selectedIndex} step={step}/>
  <IndicatorMiniChart label="MACD" values={data.map(x=>x.macd)} width={width} color={chartConfig.macd.color} enabled={chartConfig.macd.enabled} selectedIndex={selectedIndex} step={step}/>
  <IndicatorMiniChart label="Z-SCORE" values={data.map(x=>x.zScore)} width={width} color={chartConfig.zScore.color} enabled={chartConfig.zScore.enabled} selectedIndex={selectedIndex} step={step}/>
 </View></ScrollView></View>;
}
function ChartLine({values,min,max,height,step,lineStyle,top,bottom,leftOffset}:{values:(number|null)[];min:number;max:number;height:number;step:number;lineStyle:any;top:number;bottom:number;leftOffset:number}){
 const span=max-min||1,segments=[];for(let i=1;i<values.length;i++){const a=values[i-1],b=values[i];if(a===null||b===null)continue;const x1=(i-1)*step+leftOffset+3,x2=i*step+leftOffset+3,y1=top+(max-a)/span*(bottom-top),y2=top+(max-b)/span*(bottom-top),length=Math.sqrt((x2-x1)**2+(y2-y1)**2),angle=Math.atan2(y2-y1,x2-x1),lineTop=(y1+y2)/2-1;segments.push(<View key={i} style={[s.chartLine,{left:x1,top:lineTop,width:length,transform:[{rotate:`${angle}rad`}]},lineStyle]}/>);}return <>{segments}</>;
}
function IndicatorMiniChart({label,values,min,max,width,color,enabled,selectedIndex,step}:{label:string;values:(number|null)[];min?:number;max?:number;width:number;color:string;enabled:boolean;selectedIndex:number|null;step:number}){
 if(!enabled)return <View style={[s.miniChartBlock,{width}]}><Text style={s.miniChartLabel}>{label} · OCULTO</Text></View>;
 const clean=values.filter(v=>v!==null&&Number.isFinite(Number(v))) as number[];if(!clean.length)return <View style={[s.miniChartBlock,{width}]}><Text style={s.miniChartLabel}>{label} · SIN DATOS</Text></View>;
 const lo=min??Math.min(...clean),hi=max??Math.max(...clean),span=hi-lo||1,height=72,segments=[];
 const valueText=(v:number|null|undefined)=>v===null||v===undefined?'—':Number(v).toPrecision(7);
 for(let i=1;i<values.length;i++){const a=values[i-1],b=values[i];if(a===null||b===null)continue;const x1=(i-1)*step+51,x2=i*step+51,y1=8+(hi-a)/span*(height-16),y2=8+(hi-b)/span*(height-16),length=Math.sqrt((x2-x1)**2+(y2-y1)**2),angle=Math.atan2(y2-y1,x2-x1),top=(y1+y2)/2-1;segments.push(<View key={i} style={[s.chartLineMini,{left:x1,top,width:length,transform:[{rotate:`${angle}rad`}]},{backgroundColor:color}]}/>);}
 const selectedValue=selectedIndex===null?null:values[selectedIndex]??null;
 const selectedX=selectedIndex===null?null:48+selectedIndex*step+3;
 return <View style={[s.miniChartBlock,{width}]}><Text style={s.miniChartLabel}>{label}</Text><View style={[s.miniChart,{width}]}>{[0,1,2].map(i=><View key={i} style={[s.miniGrid,{top:8+i*28}]}/>)}{segments}<View pointerEvents="none" style={s.miniAxis}><Text style={s.miniAxisText}>MAX {valueText(hi)}</Text>{selectedIndex!==null&&<Text style={[s.miniAxisText,{color}]}>● {valueText(selectedValue)}</Text>}<Text style={s.miniAxisText}>MIN {valueText(lo)}</Text></View>{selectedX!==null&&<View pointerEvents="none" style={[s.miniSelectionLine,{left:selectedX,top:0,height}]}/>}</View></View>;
}
function ConfigNumber({label,value,onChange}:{label:string;value:number;onChange:(v:string)=>void}){return <View style={s.configNumberRow}><Text style={s.configLabel}>{label}</Text><TextInput value={String(value)} onChangeText={onChange} keyboardType="number-pad" style={s.configInput}/></View>;}
function IndicatorConfigRow({label,enabled,onToggle,value,onChange,extraLabel,extraValue,onExtraChange}:{label:string;enabled:boolean;onToggle:()=>void;value:number;onChange:(v:string)=>void;extraLabel?:string;extraValue?:number;onExtraChange?:(v:string)=>void}){return <View style={s.configRow}><View style={s.configMain}><Text style={s.configLabel}>{label}</Text><Pressable onPress={onToggle} style={[s.toggle,enabled&&s.toggleOn]}><Text style={s.toggleText}>{enabled?'ACTIVO':'INACTIVO'}</Text></Pressable></View><ConfigNumber label="PERÍODO" value={value} onChange={onChange}/>{extraLabel&&onExtraChange&&<ConfigNumber label={extraLabel} value={extraValue??0} onChange={onExtraChange}/>}</View>;}
function TableCell({label,value,width}:{label?:string;value?:string;width:number}){return <View style={[s.tableCell,{width},label&&s.tableHeaderCell]}><Text style={label?s.tableHeaderText:s.tableCellText}>{label??value??'—'}</Text></View>}
function InfoRow({label,value}:{label:string;value:string|number|null}){
 return <View style={s.infoRow}><Text style={s.infoRowLabel}>{label}</Text><Text style={s.infoRowValue}>{value===null||value===undefined?'—':String(value)}</Text></View>;
}
const s=StyleSheet.create({
 content:{padding:18,gap:14},title:{color:'#fff',fontSize:21,fontWeight:'900'},subtitle:{color:'#9da6b5',fontSize:13,lineHeight:20},
 autoCard:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:14,padding:15,gap:12},autoHeader:{flexDirection:'row',alignItems:'center',gap:10},autoToggle:{minWidth:108,height:42,borderRadius:9,alignItems:'center',justifyContent:'center',paddingHorizontal:12},autoToggleOn:{backgroundColor:'#28d17c',borderWidth:1,borderColor:'#28d17c'},autoToggleOff:{backgroundColor:'#e05252',borderWidth:1,borderColor:'#e05252'},autoToggleText:{color:'#fff',fontSize:10,fontWeight:'900'},autoTimeframe:{flexGrow:0,minWidth:47},autoTimeframeSelected:{backgroundColor:'#fff',borderColor:'#fff'},card:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:14,padding:15,gap:13},label:{color:'#8f98a8',fontSize:11,fontWeight:'900'},
 select:{minHeight:46,borderWidth:1,borderColor:'#3b4350',borderRadius:9,paddingHorizontal:12,backgroundColor:'#0f131a',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 selectText:{color:'#fff',fontWeight:'800'},symbolList:{maxHeight:190,borderWidth:1,borderColor:'#303744',borderRadius:9,backgroundColor:'#0f131a'},symbolOption:{padding:11,borderBottomWidth:1,borderBottomColor:'#252b35'},
 timeframes:{flexDirection:'row',flexWrap:'wrap',gap:7},timeframe:{minWidth:47,flexGrow:1,paddingVertical:12,alignItems:'center',borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a'},timeframeSelected:{backgroundColor:'#fff',borderColor:'#fff'},tfText:{color:'#dce1e9',fontWeight:'900',fontSize:12},tfTextSelected:{color:'#0b0e13'},
 hint:{color:'#7f8999',fontSize:11,lineHeight:17},sliderHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},value:{color:'#fff',fontSize:18,fontWeight:'900'},
 track:{height:30,justifyContent:'center'},rail:{position:'absolute',left:0,right:0,height:6,borderRadius:3,backgroundColor:'#303744'},progress:{position:'absolute',left:0,height:6,borderRadius:3,backgroundColor:'#fff'},thumb:{position:'absolute',width:18,height:18,marginLeft:-9,borderRadius:9,backgroundColor:'#fff',borderWidth:2,borderColor:'#151a22'},
 range:{flexDirection:'row',justifyContent:'space-between'},quantityValue:{flexDirection:'row',alignItems:'center',gap:8},pencilButton:{width:34,height:34,borderWidth:1,borderColor:'#28d17c',borderRadius:8,alignItems:'center',justifyContent:'center',backgroundColor:'#0f131a'},pencilText:{color:'#28d17c',fontSize:22,fontWeight:'900'},actions:{flexDirection:'row',gap:8},secondary:{flex:1,minHeight:45,paddingHorizontal:7,borderWidth:1,borderColor:'#3b4350',borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:'#0f131a'},secondaryText:{color:'#fff',fontSize:10,fontWeight:'900',textAlign:'center'},
 importButton:{minHeight:50,borderRadius:10,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},importText:{color:'#0b0e13',fontWeight:'900'},
 selectorTools:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},selectorButtons:{flexDirection:'row',alignItems:'center',gap:7},searchButton:{width:42,height:32,borderWidth:1,borderColor:'#3b4350',borderRadius:8,alignItems:'center',justifyContent:'center',backgroundColor:'#0f131a'},searchIcon:{color:'#fff',fontSize:23,fontWeight:'900',lineHeight:24},searchX:{color:'#e05252',fontSize:19,fontWeight:'900'},searchInput:{minHeight:42,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',color:'#fff',paddingHorizontal:12,fontWeight:'800'},alphaButton:{width:42,height:32,borderWidth:1,borderColor:'#3b4350',borderRadius:8,alignItems:'center',justifyContent:'center',backgroundColor:'#0f131a'},alphaText:{color:'#fff',fontWeight:'900',fontSize:13},alphaPanel:{borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',padding:8,flexDirection:'row',alignItems:'center',gap:8},alphaGrid:{flex:1,flexDirection:'row',flexWrap:'wrap',gap:5},alphaLetter:{width:25,height:25,borderWidth:1,borderColor:'#303744',borderRadius:6,alignItems:'center',justifyContent:'center'},alphaClear:{width:30,height:30,alignItems:'center',justifyContent:'center'},clearX:{color:'#e05252',fontSize:19,fontWeight:'900'},logHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},logHeaderToggle:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:8},logArrow:{color:'#fff',fontSize:15,fontWeight:'900',width:18,textAlign:'center'},logActions:{flexDirection:'row',alignItems:'center',gap:8,marginTop:4},indicatorButton:{flex:1,minHeight:42,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',alignItems:'center',justifyContent:'center'},indicatorButtonText:{color:'#fff',fontSize:10,fontWeight:'900'},deleteButton:{width:42,height:42,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',alignItems:'center',justifyContent:'center'},logUtilityRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:3},copyButton:{minWidth:105,height:38,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',alignItems:'center',justifyContent:'center',paddingHorizontal:10},copyButtonText:{color:'#fff',fontSize:10,fontWeight:'900'},exportLogButton:{minWidth:78,height:38,borderWidth:1,borderColor:'#fff',borderRadius:9,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',paddingHorizontal:10},exportLogButtonText:{color:'#0b0e13',fontSize:10,fontWeight:'900'},indicatorToolbar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},indicatorTools:{flexDirection:'row',alignItems:'center',gap:7},configButton:{minHeight:40,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',paddingHorizontal:10,alignItems:'center',justifyContent:'center'},configButtonText:{color:'#fff',fontSize:10,fontWeight:'900'},tableTitle:{color:'#fff',fontSize:10,fontWeight:'900',flex:1},exportButton:{minHeight:40,borderWidth:1,borderColor:'#fff',borderRadius:9,backgroundColor:'#fff',paddingHorizontal:12,alignItems:'center',justifyContent:'center'},exportButtonText:{color:'#0b0e13',fontSize:10,fontWeight:'900'},panelRow:{flexDirection:'row',alignItems:'flex-start',gap:8},panelCardFlex:{flex:1,minWidth:0,backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:12,padding:13,gap:10},panelCard:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:12,padding:13,gap:10},panelHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},panelHeaderToggle:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:8},panelArrow:{color:'#fff',fontSize:15,fontWeight:'900',width:18,textAlign:'center'},panelHeaderActions:{flexDirection:'row',alignItems:'center',gap:7},panelBody:{gap:10},expandPanelButton:{flex:1,minHeight:38,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',alignItems:'center',justifyContent:'center',paddingHorizontal:8},calculateIndicatorButton:{minHeight:50,paddingHorizontal:6},calculateIndicatorText:{color:'#0b0e13',fontSize:11,fontWeight:'900',textAlign:'center',includeFontPadding:false},chartCanvas:{position:'relative',backgroundColor:'#0f131a',borderWidth:1,borderColor:'#303744',borderRadius:9,overflow:'hidden'},chartGridH:{position:'absolute',left:42,right:5,height:1,borderTopWidth:1,borderTopColor:'#2b323e'},chartGridV:{position:'absolute',top:10,bottom:34,width:1,borderLeftWidth:1,borderLeftColor:'#252b35'},chartPriceText:{position:'absolute',left:-42,top:-7,width:38,color:'#9da6b5',fontSize:9,textAlign:'right'},chartSelectionInfo:{color:'#dce1e9',fontSize:10,fontWeight:'800',lineHeight:17,paddingHorizontal:2},chartSelectionLine:{position:'absolute',width:1,borderLeftWidth:1,borderLeftColor:'#fff',borderStyle:'dashed'},miniAxis:{position:'absolute',right:5,top:4,bottom:4,justifyContent:'space-between',alignItems:'flex-end',zIndex:3},miniAxisText:{color:'#7f8999',fontSize:8,fontWeight:'800',backgroundColor:'#0f131a',paddingHorizontal:2},miniSelectionLine:{position:'absolute',width:1,borderLeftWidth:1,borderLeftColor:'#fff',borderStyle:'dashed'},chartTimeText:{position:'absolute',color:'#7f8999',fontSize:8,fontWeight:'700',transform:[{rotate:'-35deg'}],width:48},chartZoomRow:{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:7,marginTop:4},chartZoomLabel:{color:'#8f98a8',fontSize:9,fontWeight:'900',minWidth:70,textAlign:'right'},chartZoomButton:{width:34,height:30,borderWidth:1,borderColor:'#3b4350',borderRadius:8,backgroundColor:'#0f131a',alignItems:'center',justifyContent:'center'},chartZoomText:{color:'#fff',fontSize:18,fontWeight:'900'},chartOptionsCard:{maxHeight:'90%'},chartOptionRow:{borderBottomWidth:1,borderBottomColor:'#252b35',paddingVertical:9,gap:8},chartOptionTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},colorRow:{flexDirection:'row',gap:7,flexWrap:'wrap'},colorButton:{width:28,height:28,borderWidth:2,borderRadius:7,alignItems:'center',justifyContent:'center'},colorButtonText:{color:'#0b0e13',fontSize:12,fontWeight:'900'},miniGrid:{position:'absolute',left:0,right:0,height:1,borderTopWidth:1,borderTopColor:'#252b35'},chartCandle:{position:'absolute',width:8,height:210},chartWick:{position:'absolute',left:3,width:1,backgroundColor:'#9da6b5'},chartBody:{position:'absolute',left:0,width:8,borderRadius:1},chartLine:{position:'absolute',height:2,transformOrigin:'center',borderRadius:1},chartEma20:{backgroundColor:'#28d17c'},chartEma50:{backgroundColor:'#e05252'},chartBb:{backgroundColor:'#7ea7ff'},chartBbMiddle:{backgroundColor:'#b6bdc9'},chartStack:{gap:8},chartLegend:{flexDirection:'row',gap:12,flexWrap:'wrap'},chartLegendText:{color:'#9da6b5',fontSize:9,fontWeight:'900'},miniChartBlock:{gap:4},miniChartLabel:{color:'#8f98a8',fontSize:9,fontWeight:'900'},miniChart:{height:72,position:'relative',backgroundColor:'#0f131a',borderWidth:1,borderColor:'#303744',borderRadius:9},chartLineMini:{position:'absolute',height:2,borderRadius:1},chartAxis:{position:'absolute',right:5,top:5,bottom:5,justifyContent:'space-between'},chartAxisText:{color:'#7f8999',fontSize:9},tableWide:{paddingBottom:4},jsonBox:{borderWidth:1,borderColor:'#303744',borderRadius:9,backgroundColor:'#0f131a',padding:12,minWidth:720},jsonText:{color:'#dce1e9',fontSize:10,lineHeight:16,fontFamily:'monospace'},tableList:{height:430},tableHeader:{flexDirection:'row',backgroundColor:'#252b35',borderWidth:1,borderColor:'#3b4350'},tableRow:{flexDirection:'row',borderLeftWidth:1,borderLeftColor:'#303744',borderBottomWidth:1,borderBottomColor:'#303744'},tableCell:{height:36,borderRightWidth:1,borderRightColor:'#303744',alignItems:'center',justifyContent:'center',paddingHorizontal:6},tableHeaderCell:{height:40,backgroundColor:'#252b35'},tableCellText:{color:'#dce1e9',fontSize:9,fontWeight:'700',textAlign:'center'},tableHeaderText:{color:'#fff',fontSize:9,fontWeight:'900',textAlign:'center'},detailsBox:{borderWidth:1,borderColor:'#303744',borderRadius:9,backgroundColor:'#0f131a',padding:11,gap:6},detailLine:{color:'#bfc7d4',fontSize:11,lineHeight:17},weekendHint:{color:'#f0b429',fontSize:11,fontWeight:'900',lineHeight:17},detailExplanation:{color:'#7f8999',fontSize:10,lineHeight:16,marginTop:4},section:{color:'#fff',fontSize:13,fontWeight:'900'},logCard:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:12,padding:13,gap:7},logTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},logSymbol:{color:'#fff',fontSize:15,fontWeight:'900'},status:{fontSize:11,fontWeight:'900'},ok:{color:'#28d17c'},partial:{color:'#f0b429'},fail:{color:'#e05252'},logLine:{color:'#dce1e9',fontSize:12},error:{color:'#e05252',fontSize:11,lineHeight:16},muted:{color:'#9da6b5',fontSize:12,lineHeight:18},indGrid:{gap:7},infoRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,paddingVertical:5,borderBottomWidth:1,borderBottomColor:'#252b35'},infoRowLabel:{color:'#8f98a8',fontSize:10,fontWeight:'900',flex:1},infoRowValue:{color:'#fff',fontSize:12,fontWeight:'800',textAlign:'right'},disabled:{opacity:0.45},indicatorHistoryButton:{flex:1,minHeight:38,borderWidth:1,borderColor:'#28d17c',borderRadius:9,backgroundColor:'#10251b',alignItems:'center',justifyContent:'center',paddingHorizontal:8},indicatorHistoryButtonText:{color:'#28d17c',fontSize:10,fontWeight:'900'},indicatorModalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.82)',paddingTop:34,paddingHorizontal:10,paddingBottom:10},indicatorModalCard:{flex:1,backgroundColor:'#0b0e13',borderWidth:1,borderColor:'#3b4350',borderRadius:14,overflow:'hidden'},indicatorModalHeader:{minHeight:58,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:10,borderBottomWidth:1,borderBottomColor:'#252b35'},indicatorModalClose:{width:38,height:38,borderRadius:9,borderWidth:1,borderColor:'#3b4350',alignItems:'center',justifyContent:'center'},indicatorModalBody:{padding:14,gap:12},modalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.72)',justifyContent:'center',padding:18},modalCard:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#3b4350',borderRadius:14,padding:16,gap:12},modalTitle:{color:'#fff',fontSize:17,fontWeight:'900'},modalHint:{color:'#9da6b5',fontSize:11,lineHeight:17},numberInput:{height:48,borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',color:'#fff',fontSize:18,fontWeight:'900',paddingHorizontal:12},modalActions:{flexDirection:'row',gap:8,marginTop:4},configRow:{borderBottomWidth:1,borderBottomColor:'#252b35',paddingVertical:8,gap:8},configMain:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},configLabel:{color:'#dce1e9',fontSize:10,fontWeight:'900'},toggle:{minWidth:80,minHeight:32,borderWidth:1,borderColor:'#3b4350',borderRadius:8,alignItems:'center',justifyContent:'center',backgroundColor:'#0f131a'},toggleOn:{borderColor:'#28d17c',backgroundColor:'#10251b'},toggleText:{color:'#fff',fontSize:9,fontWeight:'900'},configNumberRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},configInput:{width:110,height:38,borderWidth:1,borderColor:'#3b4350',borderRadius:8,backgroundColor:'#0f131a',color:'#fff',paddingHorizontal:10,textAlign:'right',fontWeight:'800'},macdBox:{borderTopWidth:1,borderTopColor:'#252b35',paddingTop:10,gap:8}
});
