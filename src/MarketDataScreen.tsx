import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Credentials } from './exness';
import { getMarketCandles, type MarketTimeframe } from './exness';

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
function datasetKey(account:string,symbol:string,tf:MarketTimeframe){return 'tinchodoko.market.candles.'+account+'.'+symbol+'.'+tf+'.v1';}

export default function MarketDataScreen({credentials,accessPoint,instruments,selectedInstrument,onSelectInstrument}:Props){
 const [config,setConfig]=useState<Config>(DEFAULTS);
 const [tf,setTf]=useState<MarketTimeframe|null>('M1');
 const [log,setLog]=useState<LogItem[]>([]);
 const [busy,setBusy]=useState(false);
 const [menu,setMenu]=useState(false);
 const [width,setWidth]=useState(1);
 const [saving,setSaving]=useState(false);
 const [loaded,setLoaded]=useState(false);
 useEffect(()=>{let cancelled=false;Promise.all([AsyncStorage.getItem(CONFIG_KEY),AsyncStorage.getItem(LOG_KEY)]).then(([rawConfig,rawLog])=>{if(cancelled)return;if(rawConfig){try{const saved=JSON.parse(rawConfig) as Partial<Config>;const next={...DEFAULTS};for(const item of TFS){const n=Number(saved[item]);if(Number.isInteger(n)&&n>=MIN&&n<=MAX[item])next[item]=n;}setConfig(next);}catch{}}if(rawLog){try{const saved=JSON.parse(rawLog);if(Array.isArray(saved))setLog(saved.filter(x=>x&&typeof x.id==='string').slice(0,200));}catch{}}setLoaded(true);}).catch(()=>setLoaded(true));return()=>{cancelled=true;};},[]);
 const value=tf?config[tf]:0;
 const max=tf?MAX[tf]:MIN;
 const fill=tf?Math.max(0,Math.min(1,(value-MIN)/(max-MIN))):0;
 const symbols=useMemo(()=>instruments.slice().sort((a,b)=>a.localeCompare(b)),[instruments]);
 function choose(next:MarketTimeframe){if(tf===next){setTf(null);return;}if(tf!==null){Alert.alert('IMPORTACIÓN INDIVIDUAL','IMPORTA SOLO UN TIMEFRAME');return;}setTf(next);}
 function slide(x:number){if(!tf)return;const ratio=Math.max(0,Math.min(1,x/Math.max(1,width)));const next=Math.max(MIN,Math.min(MAX[tf],Math.round((MIN+ratio*(MAX[tf]-MIN))/10)*10));setConfig(old=>({...old,[tf]:next}));}
 async function saveConfig(){setSaving(true);try{await AsyncStorage.setItem(CONFIG_KEY,JSON.stringify(config));Alert.alert('CONFIGURACIÓN GUARDADA','Las cantidades quedaron guardadas localmente.');}catch(e){Alert.alert('ERROR AL GUARDAR',e instanceof Error?e.message:String(e));}finally{setSaving(false);}}
 async function resetConfig(){setConfig(DEFAULTS);setTf('M1');try{await AsyncStorage.setItem(CONFIG_KEY,JSON.stringify(DEFAULTS));Alert.alert('CONFIGURACIÓN RESTABLECIDA','Se restauraron todos los valores predeterminados.');}catch(e){Alert.alert('ERROR AL RESTABLECER',e instanceof Error?e.message:String(e));}}
 async function saveLog(next:LogItem[]){const trimmed=next.slice(0,200);setLog(trimmed);await AsyncStorage.setItem(LOG_KEY,JSON.stringify(trimmed));}
 async function importData(){
  if(busy)return;
  if(!accessPoint||!credentials.apiKey||!credentials.secret||!credentials.accountId){Alert.alert('CUENTA NO CONECTADA','Primero conectá tu cuenta demo de Exness.');return;}
  if(!selectedInstrument){Alert.alert('SÍMBOLO NO SELECCIONADO','Seleccioná un instrumento desde el selector de par.');return;}
  if(!tf){Alert.alert('TIMEFRAME NO SELECCIONADO','Seleccioná un único timeframe.');return;}
  const selectedTf=tf;const requested=config[selectedTf];setBusy(true);
  try{
   const candles=await getMarketCandles(credentials,accessPoint,selectedInstrument,selectedTf,requested);
   const now=Date.now();
   await AsyncStorage.setItem(datasetKey(credentials.accountId,selectedInstrument,selectedTf),JSON.stringify({symbol:selectedInstrument,timeframe:selectedTf,requested,received:candles.length,importedAt:now,candles}));
   const item:LogItem={id:String(now)+'-'+selectedInstrument+'-'+selectedTf,symbol:selectedInstrument,timeframe:selectedTf,requested,received:candles.length,at:now,status:candles.length===requested?'OK':'PARCIAL',message:candles.length===requested?undefined:'Exness devolvió '+candles.length+' de '+requested+' velas.'};
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
   <Text style={s.label}>PAR SELECCIONADO</Text>
   <Pressable onPress={()=>setMenu(v=>!v)} style={s.select}><Text style={s.selectText}>{selectedInstrument||'SELECCIONAR INSTRUMENTO'}</Text><Text style={s.muted}>{menu?'▲':'▼'}</Text></Pressable>
   {menu&&<View style={s.symbolList}>{symbols.length===0?<Text style={s.muted}>Conectá Exness y cargá los instrumentos desde POSICIONES.</Text>:symbols.map(symbol=><Pressable key={symbol} onPress={()=>{onSelectInstrument(symbol);setMenu(false);}} style={s.symbolOption}><Text style={s.selectText}>{symbol}</Text></Pressable>)}</View>}
   <Text style={s.label}>TIMEFRAME</Text>
   <View style={s.timeframes}>{TFS.map(item=><Pressable key={item} onPress={()=>choose(item)} style={[s.timeframe,tf===item&&s.timeframeSelected]}><Text style={[s.tfText,tf===item&&s.tfTextSelected]}>{item}</Text></Pressable>)}</View>
   <Text style={s.hint}>Elegí uno. Para cambiar, tocá el timeframe activo para desmarcarlo y luego seleccioná otro.</Text>
   <View style={s.sliderHeader}><Text style={s.label}>CANTIDAD DE VELAS</Text><Text style={s.value}>{tf?value.toLocaleString('es-AR'):'—'}</Text></View>
   <Pressable disabled={!tf} onLayout={e=>setWidth(e.nativeEvent.layout.width)} onPress={e=>slide(e.nativeEvent.locationX)} style={[s.track,!tf&&s.disabled]}><View style={s.rail}/><View style={[s.progress,{width:(fill*100)+'%'}]}/><View style={[s.thumb,{left:(fill*100)+'%'}]}/></Pressable>
   <View style={s.range}><Text style={s.muted}>{MIN.toLocaleString('es-AR')}</Text><Text style={s.muted}>{tf?max.toLocaleString('es-AR'):'MÁXIMO'}</Text></View>
   <Text style={s.hint}>{tf?'Rango permitido: '+MIN+'–'+max+' velas':'Elegí un timeframe para configurar la cantidad.'}</Text>
   <View style={s.actions}><Pressable disabled={saving} onPress={saveConfig} style={s.secondary}><Text style={s.secondaryText}>{saving?'GUARDANDO...':'GUARDAR CONFIGURACIÓN'}</Text></Pressable><Pressable onPress={resetConfig} style={s.secondary}><Text style={s.secondaryText}>RESTABLECER</Text></Pressable></View>
   <Pressable disabled={busy||!tf||!selectedInstrument||!accessPoint} onPress={importData} style={[s.importButton,(busy||!tf||!selectedInstrument||!accessPoint)&&s.disabled]}>{busy?<ActivityIndicator color="#0b0e13"/>:<Text style={s.importText}>IMPORTAR DATOS</Text>}</Pressable>
   {loaded&&<Text style={s.hint}>Configuración e historial guardados en el dispositivo.</Text>}
  </View>
  <View style={s.logHeader}><Text style={s.section}>HISTORIAL DE IMPORTACIONES</Text><Text style={s.muted}>{log.length}</Text></View>
  {log.length===0?<View style={s.card}><Text style={s.muted}>Todavía no hay importaciones registradas.</Text></View>:log.map(item=><View key={item.id} style={s.logCard}><View style={s.logTop}><Text style={s.logSymbol}>{item.symbol}</Text><Text style={[s.status,item.status==='OK'?s.ok:item.status==='PARCIAL'?s.partial:s.fail]}>{item.status}</Text></View><Text style={s.logLine}>{item.timeframe} · {item.received.toLocaleString('es-AR')}/{item.requested.toLocaleString('es-AR')} velas · {formatDate(item.at)}</Text>{item.message&&<Text style={s.error} numberOfLines={3}>{item.message}</Text>}</View>)}
 </ScrollView>;
}
const s=StyleSheet.create({
 content:{padding:18,gap:14},title:{color:'#fff',fontSize:21,fontWeight:'900'},subtitle:{color:'#9da6b5',fontSize:13,lineHeight:20},
 card:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:14,padding:15,gap:13},label:{color:'#8f98a8',fontSize:11,fontWeight:'900'},
 select:{minHeight:46,borderWidth:1,borderColor:'#3b4350',borderRadius:9,paddingHorizontal:12,backgroundColor:'#0f131a',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 selectText:{color:'#fff',fontWeight:'800'},symbolList:{maxHeight:190,borderWidth:1,borderColor:'#303744',borderRadius:9,overflow:'hidden'},symbolOption:{padding:11,borderBottomWidth:1,borderBottomColor:'#252b35'},
 timeframes:{flexDirection:'row',flexWrap:'wrap',gap:7},timeframe:{minWidth:47,flexGrow:1,paddingVertical:12,alignItems:'center',borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a'},timeframeSelected:{backgroundColor:'#fff',borderColor:'#fff'},tfText:{color:'#dce1e9',fontWeight:'900',fontSize:12},tfTextSelected:{color:'#0b0e13'},
 hint:{color:'#7f8999',fontSize:11,lineHeight:17},sliderHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},value:{color:'#fff',fontSize:18,fontWeight:'900'},
 track:{height:30,justifyContent:'center'},rail:{position:'absolute',left:0,right:0,height:6,borderRadius:3,backgroundColor:'#303744'},progress:{position:'absolute',left:0,height:6,borderRadius:3,backgroundColor:'#fff'},thumb:{position:'absolute',width:18,height:18,marginLeft:-9,borderRadius:9,backgroundColor:'#fff',borderWidth:2,borderColor:'#151a22'},
 range:{flexDirection:'row',justifyContent:'space-between'},actions:{flexDirection:'row',gap:8},secondary:{flex:1,minHeight:45,paddingHorizontal:7,borderWidth:1,borderColor:'#3b4350',borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:'#0f131a'},secondaryText:{color:'#fff',fontSize:10,fontWeight:'900',textAlign:'center'},
 importButton:{minHeight:50,borderRadius:10,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},importText:{color:'#0b0e13',fontWeight:'900'},
 logHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},section:{color:'#fff',fontSize:13,fontWeight:'900'},logCard:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:12,padding:13,gap:7},logTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},logSymbol:{color:'#fff',fontSize:15,fontWeight:'900'},status:{fontSize:11,fontWeight:'900'},ok:{color:'#28d17c'},partial:{color:'#f0b429'},fail:{color:'#e05252'},logLine:{color:'#dce1e9',fontSize:12},error:{color:'#e05252',fontSize:11,lineHeight:16},muted:{color:'#9da6b5',fontSize:12,lineHeight:18},disabled:{opacity:0.45}
});
