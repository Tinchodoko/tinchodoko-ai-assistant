import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Credentials } from './exness';
import { getMarketCandles, type MarketTimeframe } from './exness';
import { calculateIndicators, type IndicatorSnapshot } from './marketIndicators';

type Props = { credentials: Credentials; accessPoint: string; instruments: string[]; selectedInstrument: string; onSelectInstrument: (symbol:string)=>void };
type Config = Record<MarketTimeframe,number>;
type LogItem = { id:string; symbol:string; timeframe:MarketTimeframe; requested:number; received:number; at:number; status:'OK'|'PARCIAL'|'FALLO'; message?:string };
const TFS:MarketTimeframe[]=['M1','M5','M15','M30','H1','H4'];
const DEFAULTS:Config={M1:5000,M5:500,M15:500,M30:300,H1:250,H4:250};
const MAX:Record<MarketTimeframe,number>={M1:10000,M5:3000,M15:1800,M30:1200,H1:1000,H4:700};
const MIN=100;
const CONFIG_KEY='tinchodoko.market.import.config.v1';
const LOG_KEY='tinchodoko.market.import.log.v1';
const pad=(n:number)=>String(n).padStart(2,'0');
function formatDate(ms:number){const d=new Date(ms);return pad(d.getDate())+pad(d.getMonth()+1)+d.getFullYear()+'-'+pad(d.getHours())+pad(d.getMinutes());}
function datasetKey(account:string,symbol:string,tf:MarketTimeframe,id?:string){return 'tinchodoko.market.candles.'+account+'.'+symbol+'.'+tf+(id?'.'+id:'')+'.v1';}

export default function MarketDataScreen({credentials,accessPoint,instruments,selectedInstrument,onSelectInstrument}:Props){
 const [config,setConfig]=useState<Config>(DEFAULTS);
 const [tf,setTf]=useState<MarketTimeframe|null>('M1');
 const [log,setLog]=useState<LogItem[]>([]);
 const [busy,setBusy]=useState(false);
 const [menu,setMenu]=useState(false);
 const [alphaOpen,setAlphaOpen]=useState(false);
 const [alpha,setAlpha]=useState<string|null>(null);
 const [indicatorTf,setIndicatorTf]=useState<MarketTimeframe|null>(null);
 const [indicator,setIndicator]=useState<IndicatorSnapshot|null>(null);
 const [indicatorSource,setIndicatorSource]=useState<LogItem|null>(null);
 const [width,setWidth]=useState(1);
 const [saving,setSaving]=useState(false);
 const [loaded,setLoaded]=useState(false);
 useEffect(()=>{let cancelled=false;Promise.all([AsyncStorage.getItem(CONFIG_KEY),AsyncStorage.getItem(LOG_KEY)]).then(([rawConfig,rawLog])=>{if(cancelled)return;if(rawConfig){try{const saved=JSON.parse(rawConfig) as Partial<Config>;const next={...DEFAULTS};for(const item of TFS){const n=Number(saved[item]);if(Number.isInteger(n)&&n>=MIN&&n<=MAX[item])next[item]=n;}setConfig(next);}catch{}}if(rawLog){try{const saved=JSON.parse(rawLog);if(Array.isArray(saved))setLog(saved.filter(x=>x&&typeof x.id==='string').slice(0,200));}catch{}}setLoaded(true);}).catch(()=>setLoaded(true));return()=>{cancelled=true;};},[]);
 const value=tf?config[tf]:0;
 const max=tf?MAX[tf]:MIN;
 const fill=tf?Math.max(0,Math.min(1,(value-MIN)/(max-MIN))):0;
 const symbols=useMemo(()=>instruments.slice().sort((a,b)=>a.localeCompare(b)),[instruments]);
 const filteredSymbols=useMemo(()=>alpha?symbols.filter(symbol=>symbol.toUpperCase().startsWith(alpha)):symbols,[symbols,alpha]);
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
 function choose(next:MarketTimeframe){if(tf===next){setTf(null);return;}if(tf!==null){Alert.alert('IMPORTACIÓN INDIVIDUAL','IMPORTA SOLO UN TIMEFRAME');return;}setTf(next);}
 function slide(x:number){if(!tf)return;const ratio=Math.max(0,Math.min(1,x/Math.max(1,width)));const next=Math.max(MIN,Math.min(MAX[tf],Math.round((MIN+ratio*(MAX[tf]-MIN))/10)*10));setConfig(old=>({...old,[tf]:next}));}
 async function saveConfig(){setSaving(true);try{await AsyncStorage.setItem(CONFIG_KEY,JSON.stringify(config));Alert.alert('CONFIGURACIÓN GUARDADA','Las cantidades quedaron guardadas localmente.');}catch(e){Alert.alert('ERROR AL GUARDAR',e instanceof Error?e.message:String(e));}finally{setSaving(false);}}
 async function resetConfig(){setConfig(DEFAULTS);setTf('M1');try{await AsyncStorage.setItem(CONFIG_KEY,JSON.stringify(DEFAULTS));Alert.alert('CONFIGURACIÓN RESTABLECIDA','Se restauraron todos los valores predeterminados.');}catch(e){Alert.alert('ERROR AL RESTABLECER',e instanceof Error?e.message:String(e));}}
 async function saveLog(next:LogItem[]){const trimmed=next.slice(0,200);setLog(trimmed);await AsyncStorage.setItem(LOG_KEY,JSON.stringify(trimmed));}
 async function deleteImport(item:LogItem){
  Alert.alert('CONFIRMAR ELIMINACIÓN','DESEA ELIMINAR LA IMPORTACIÓN\\n'+item.symbol+'\\n'+item.timeframe+' - '+item.received+'/'+item.requested+' velas\\n'+formatDate(item.at),[
   {text:'CANCELAR',style:'cancel'},
   {text:'CONFIRMAR',style:'destructive',onPress:async()=>{try{await AsyncStorage.removeItem(datasetKey(credentials.accountId,item.symbol,item.timeframe,item.id));await AsyncStorage.removeItem(datasetKey(credentials.accountId,item.symbol,item.timeframe));const next=log.filter(x=>x.id!==item.id);await saveLog(next);if(indicatorSource?.id===item.id){setIndicator(null);setIndicatorSource(null);setIndicatorTf(null);}Alert.alert('IMPORTACIÓN ELIMINADA','Los datos de la importación fueron eliminados del dispositivo.');}catch(e){Alert.alert('ERROR AL ELIMINAR',e instanceof Error?e.message:String(e));}}}
  ]);
 }
 async function loadIndicators(item:LogItem){
  try{const raw=await AsyncStorage.getItem(datasetKey(credentials.accountId,item.symbol,item.timeframe,item.id));const fallback=raw?raw:await AsyncStorage.getItem(datasetKey(credentials.accountId,item.symbol,item.timeframe));if(!fallback){Alert.alert('DATOS NO DISPONIBLES','No se encontraron las velas de esta importación.');return;}const parsed=JSON.parse(fallback);const candles=Array.isArray(parsed.candles)?parsed.candles:[];if(candles.length<20){Alert.alert('DATOS INSUFICIENTES','Se necesitan al menos 20 velas para calcular los indicadores.');return;}setIndicator(calculateIndicators(candles));setIndicatorSource(item);setIndicatorTf(item.timeframe);}catch(e){Alert.alert('ERROR DE INDICADORES',e instanceof Error?e.message:String(e));}
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
   const item:LogItem={id:String(now)+'-'+selectedInstrument+'-'+selectedTf,symbol:selectedInstrument,timeframe:selectedTf,requested,received:candles.length,at:now,status:candles.length===requested?'OK':'PARCIAL',message:candles.length===requested?undefined:'Exness devolvió '+candles.length+' de '+requested+' velas.'};
   await AsyncStorage.setItem(datasetKey(credentials.accountId,selectedInstrument,selectedTf,item.id),JSON.stringify({id:item.id,symbol:selectedInstrument,timeframe:selectedTf,requested,received:candles.length,importedAt:now,candles}));
   await saveLog([item,...log]);
   Alert.alert(item.status==='OK'?'IMPORTACIÓN COMPLETADA':'IMPORTACIÓN PARCIAL',selectedInstrument+' '+selectedTf+': '+candles.length+'/'+requested+' velas guardadas localmente.');
  }catch(e){
   const message=e instanceof Error?e.message:String(e);const now=Date.now();
   const item:LogItem={id:String(now)+'-'+selectedInstrument+'-'+selectedTf,symbol:selectedInstrument,timeframe:selectedTf,requested,received:0,at:now,status:'FALLO',message};
   try{await saveLog([item,...log]);}catch{}
   Alert.alert('ERROR DE IMPORTACIÓN',message);
  }finally{setBusy(false);}
 }
 return <ScrollView contentContainerStyle={s.content}>
  <Text style={s.title}>IMPORTACIÓN DE DATOS DE MERCADO</Text>
  <Text style={s.subtitle}>Importá un timeframe por operación. Las velas OHLC se guardan localmente en este dispositivo.</Text>
  <View style={s.card}>
   <View style={s.selectorTools}><Text style={s.label}>SELECCIONAR INSTRUMENTO</Text><Pressable onPress={()=>setAlphaOpen(v=>!v)} style={s.alphaButton}><Text style={s.alphaText}>{alpha??'aZ'}</Text></Pressable></View>
   {alphaOpen&&<View style={s.alphaPanel}><View style={s.alphaGrid}>{alphabet.map(letter=><Pressable key={letter} onPress={()=>{setAlpha(letter);setAlphaOpen(false);setMenu(true);}} style={s.alphaLetter}><Text style={s.alphaText}>{letter}</Text></Pressable>)}</View><Pressable onPress={()=>{setAlpha(null);setAlphaOpen(false);setMenu(true);}} style={s.alphaClear}><Text style={s.clearX}>✕</Text></Pressable></View>}
   <Pressable onPress={()=>setMenu(v=>!v)} style={s.select}><Text style={s.selectText}>{selectedInstrument||'SELECCIONAR INSTRUMENTO'}</Text><Text style={s.muted}>{menu?'▲':'▼'}</Text></Pressable>
   {menu&&<ScrollView style={s.symbolList} nestedScrollEnabled showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">{filteredSymbols.length===0?<Text style={s.muted}>No hay instrumentos que comiencen con {alpha??'esta letra'}.</Text>:filteredSymbols.map(symbol=><Pressable key={symbol} onPress={()=>{onSelectInstrument(symbol);setMenu(false);}} style={s.symbolOption}><Text style={s.selectText}>{symbol}</Text></Pressable>)}</ScrollView>}
   <Text style={s.label}>TIMEFRAME</Text>
   <View style={s.timeframes}>{TFS.map(item=><Pressable key={item} onPress={()=>choose(item)} style={[s.timeframe,tf===item&&s.timeframeSelected]}><Text style={[s.tfText,tf===item&&s.tfTextSelected]}>{item}</Text></Pressable>)}</View>
   <Text style={s.hint}>Elegí uno. Para cambiar, tocá el timeframe activo para desmarcarlo y luego seleccioná otro.</Text>
   <View style={s.sliderHeader}><Text style={s.label}>CANTIDAD DE VELAS</Text><Text style={s.value}>{tf?value.toLocaleString('es-AR'):'—'}</Text></View>
   <View onLayout={e=>setWidth(e.nativeEvent.layout.width)} onStartShouldSetResponder={()=>!!tf} onStartShouldSetResponderCapture={()=>!!tf} onMoveShouldSetResponder={()=>!!tf} onMoveShouldSetResponderCapture={()=>!!tf} onResponderTerminationRequest={()=>false} onResponderGrant={e=>slide(e.nativeEvent.locationX)} onResponderMove={e=>slide(e.nativeEvent.locationX)} style={[s.track,!tf&&s.disabled]}><View style={s.rail}/><View style={[s.progress,{width:`${fill*100}%` as `${number}%`}]}/><View style={[s.thumb,{left:`${fill*100}%` as `${number}%`}]}/></View>
   <View style={s.range}><Text style={s.muted}>{MIN.toLocaleString('es-AR')}</Text><Text style={s.muted}>{tf?max.toLocaleString('es-AR'):'MÁXIMO'}</Text></View>
   <Text style={s.hint}>{tf?'Rango permitido: '+MIN+'–'+max+' velas':'Elegí un timeframe para configurar la cantidad.'}</Text>
   <View style={s.actions}><Pressable disabled={saving} onPress={saveConfig} style={s.secondary}><Text style={s.secondaryText}>{saving?'GUARDANDO...':'GUARDAR CONFIGURACIÓN'}</Text></Pressable><Pressable onPress={resetConfig} style={s.secondary}><Text style={s.secondaryText}>RESTABLECER</Text></Pressable></View>
   <Pressable disabled={busy||!tf||!selectedInstrument||!accessPoint} onPress={importData} style={[s.importButton,(busy||!tf||!selectedInstrument||!accessPoint)&&s.disabled]}>{busy?<ActivityIndicator color="#0b0e13"/>:<Text style={s.importText}>IMPORTAR DATOS</Text>}</Pressable>
   {loaded&&<Text style={s.hint}>Configuración e historial guardados en el dispositivo.</Text>}
  </View>
  <View style={s.logHeader}><Text style={s.section}>HISTORIAL DE IMPORTACIONES</Text><Text style={s.muted}>{log.length}</Text></View>
  {log.length===0?<View style={s.card}><Text style={s.muted}>Todavía no hay importaciones registradas.</Text></View>:log.map(item=><View key={item.id} style={s.logCard}><View style={s.logTop}><Text style={s.logSymbol}>{item.symbol}</Text><Text style={[s.status,item.status==='OK'?s.ok:item.status==='PARCIAL'?s.partial:s.fail]}>{item.status}</Text></View><Text style={s.logLine}>{item.timeframe} · {item.received.toLocaleString('es-AR')}/{item.requested.toLocaleString('es-AR')} velas · {formatDate(item.at)}</Text>{item.message&&<Text style={s.error} numberOfLines={3}>{item.message}</Text>}<View style={s.logActions}><Pressable onPress={()=>loadIndicators(item)} style={s.indicatorButton}><Text style={s.indicatorButtonText}>CALCULAR INDICADORES</Text></Pressable><Pressable onPress={()=>deleteImport(item)} style={s.deleteButton}><Text style={s.clearX}>✕</Text></Pressable></View></View>)}
 </ScrollView>;
}
const s=StyleSheet.create({
 content:{padding:18,gap:14},title:{color:'#fff',fontSize:21,fontWeight:'900'},subtitle:{color:'#9da6b5',fontSize:13,lineHeight:20},
 card:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:14,padding:15,gap:13},label:{color:'#8f98a8',fontSize:11,fontWeight:'900'},
 select:{minHeight:46,borderWidth:1,borderColor:'#3b4350',borderRadius:9,paddingHorizontal:12,backgroundColor:'#0f131a',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 selectText:{color:'#fff',fontWeight:'800'},symbolList:{maxHeight:190,borderWidth:1,borderColor:'#303744',borderRadius:9,backgroundColor:'#0f131a'},symbolOption:{padding:11,borderBottomWidth:1,borderBottomColor:'#252b35'},
 timeframes:{flexDirection:'row',flexWrap:'wrap',gap:7},timeframe:{minWidth:47,flexGrow:1,paddingVertical:12,alignItems:'center',borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a'},timeframeSelected:{backgroundColor:'#fff',borderColor:'#fff'},tfText:{color:'#dce1e9',fontWeight:'900',fontSize:12},tfTextSelected:{color:'#0b0e13'},
 hint:{color:'#7f8999',fontSize:11,lineHeight:17},sliderHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},value:{color:'#fff',fontSize:18,fontWeight:'900'},
 track:{height:30,justifyContent:'center'},rail:{position:'absolute',left:0,right:0,height:6,borderRadius:3,backgroundColor:'#303744'},progress:{position:'absolute',left:0,height:6,borderRadius:3,backgroundColor:'#fff'},thumb:{position:'absolute',width:18,height:18,marginLeft:-9,borderRadius:9,backgroundColor:'#fff',borderWidth:2,borderColor:'#151a22'},
 range:{flexDirection:'row',justifyContent:'space-between'},actions:{flexDirection:'row',gap:8},secondary:{flex:1,minHeight:45,paddingHorizontal:7,borderWidth:1,borderColor:'#3b4350',borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:'#0f131a'},secondaryText:{color:'#fff',fontSize:10,fontWeight:'900',textAlign:'center'},
 importButton:{minHeight:50,borderRadius:10,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},importText:{color:'#0b0e13',fontWeight:'900'},
 selectorTools:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},alphaButton:{width:42,height:32,borderWidth:1,borderColor:'#3b4350',borderRadius:8,alignItems:'center',justifyContent:'center',backgroundColor:'#0f131a'},alphaText:{color:'#fff',fontWeight:'900',fontSize:13},alphaPanel:{borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',padding:8,flexDirection:'row',alignItems:'center',gap:8},alphaGrid:{flex:1,flexDirection:'row',flexWrap:'wrap',gap:5},alphaLetter:{width:25,height:25,borderWidth:1,borderColor:'#303744',borderRadius:6,alignItems:'center',justifyContent:'center'},alphaClear:{width:30,height:30,alignItems:'center',justifyContent:'center'},clearX:{color:'#e05252',fontSize:19,fontWeight:'900'},logHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},section:{color:'#fff',fontSize:13,fontWeight:'900'},logCard:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:12,padding:13,gap:7},logTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},logSymbol:{color:'#fff',fontSize:15,fontWeight:'900'},status:{fontSize:11,fontWeight:'900'},ok:{color:'#28d17c'},partial:{color:'#f0b429'},fail:{color:'#e05252'},logLine:{color:'#dce1e9',fontSize:12},error:{color:'#e05252',fontSize:11,lineHeight:16},muted:{color:'#9da6b5',fontSize:12,lineHeight:18},disabled:{opacity:0.45}
});
