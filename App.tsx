import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import { connectToExness, getAccountSnapshot, getTradingHistory, openExnessAccountStream, modifyActiveOrder, createPositionSltp, cancelActiveOrder, closePosition, getAvailableInstruments, getInstrumentConditions, openExnessTickStream, openMarketPosition, placeLimitOrder, type Credentials, type TradingHistoryData, type ExnessInstrumentConditions, type ExnessTick } from './src/exness';
import { loadCredentials, saveCredentials } from './src/storage';
import { BUILD_INFO } from './src/buildInfo';
import { BUILD_HISTORY_FALLBACK } from './src/buildHistory';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as SecureStore from 'expo-secure-store';

const CURRENCY_FLAGS: Record<string,string> = {
USD:'🇺🇸',EUR:'🇪🇺',GBP:'🇬🇧',JPY:'🇯🇵',AUD:'🇦🇺',NZD:'🇳🇿',CAD:'🇨🇦',CHF:'🇨🇭',CNY:'🇨🇳',CNH:'🇨🇳',HKD:'🇭🇰',SGD:'🇸🇬',SEK:'🇸🇪',NOK:'🇳🇴',DKK:'🇩🇰',MXN:'🇲🇽',ZAR:'🇿🇦',TRY:'🇹🇷',PLN:'🇵🇱',RUB:'🇷🇺',INR:'🇮🇳',KRW:'🇰🇷',BRL:'🇧🇷',THB:'🇹🇭',HUF:'🇭🇺',CZK:'🇨🇿',ILS:'🇮🇱',AED:'🇦🇪',SAR:'🇸🇦',TWD:'🇹🇼'
};
const CRYPTO_MARKS: Record<string,string> = {
BTC:'₿',ETH:'Ξ',BNB:'◆',XRP:'XRP',SOL:'◎',ADA:'₳',DOGE:'Ð',LTC:'Ł',DOT:'●',AVAX:'▲',LINK:'⬡',BCH:'₿',TRX:'TRX',TON:'TON',XLM:'✦',UNI:'U',ATOM:'⚛',ETC:'Ξ',NEAR:'N',SUI:'S',USDT:'₮',USDC:'＄',DAI:'◈'
};
function pairAssets(instrument:string): Array<{key:string;mark:string;crypto:boolean}> {
 const symbol=instrument.toUpperCase().replace(/[^A-Z0-9]/g,'');
 const cryptoCodes=Object.keys(CRYPTO_MARKS).sort((a,b)=>b.length-a.length);
 const currencyCodes=Object.keys(CURRENCY_FLAGS).sort((a,b)=>b.length-a.length);
 const base=cryptoCodes.find(code=>symbol.startsWith(code));
 if(base) {
  const remainder=symbol.slice(base.length);
  const cryptoQuote=cryptoCodes.find(code=>remainder.startsWith(code));
  if(cryptoQuote) return [{key:base,mark:CRYPTO_MARKS[base],crypto:true},{key:cryptoQuote,mark:CRYPTO_MARKS[cryptoQuote],crypto:true}];
  const currencyQuote=currencyCodes.find(code=>remainder.startsWith(code));
  return [{key:base,mark:CRYPTO_MARKS[base],crypto:true},...(currencyQuote?[{key:currencyQuote,mark:CURRENCY_FLAGS[currencyQuote],crypto:false}]:[])];
 }
 if(symbol.length>=6) {
  const baseCurrency=symbol.slice(0,3);
  const remainder=symbol.slice(3);
  const quoteCurrency=currencyCodes.find(code=>remainder.startsWith(code));
  if(CURRENCY_FLAGS[baseCurrency]&&quoteCurrency) return [{key:baseCurrency,mark:CURRENCY_FLAGS[baseCurrency],crypto:false},{key:quoteCurrency,mark:CURRENCY_FLAGS[quoteCurrency],crypto:false}];
 }
 return [];
}
function PairIdentity({instrument}:{instrument:string}) {
 const assets=pairAssets(instrument);
 return <View style={s.pairIdentity}>
  <Text style={s.historyPair}>{instrument}</Text>
  {assets.length>0&&<View style={s.pairIcons}>{assets.map(asset=><View key={asset.key} style={[s.pairIcon,asset.crypto&&s.cryptoIcon]}><Text style={asset.crypto?s.cryptoMark:s.flagMark}>{asset.mark}</Text></View>)}</View>}
 </View>;
}

const RELEASES_URL = 'https://github.com/Tinchodoko/tinchodoko-ai-assistant/releases';
const LATEST_RELEASE_API = 'https://api.github.com/repos/Tinchodoko/tinchodoko-ai-assistant/releases/latest';
const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/Tinchodoko/tinchodoko-ai-assistant/main/update.json';
type Screen = 'connection' | 'profile' | 'positions' | 'history' | 'app';
type TradeAction = {
  kind: 'edit' | 'close';
  target: 'position' | 'order';
  targetId: string;
  field?: 'price' | 'stop_loss_price' | 'take_profit_price';
  previous?: string;
  value?: string;
  otherField?: 'stop_loss_price' | 'take_profit_price';
  otherValue?: string;
  instrument?: string;
  positionId?: string;
  createSltp?: boolean;
  pnl?: number | null;
  basePrice?: number;
};

function classifyExnessInstrument(symbol:string):'Crypto'|'Forex'|'Indices'|'ETC' {
  const value=symbol.toUpperCase().replace(/[^A-Z0-9]/g,'');
  const currencies=['USD','EUR','GBP','JPY','AUD','NZD','CAD','CHF','CNH','CNY','HKD','SGD','SEK','NOK','DKK','MXN','ZAR','TRY','PLN','INR','KRW','BRL','THB','HUF','CZK','ILS','AED','SAR'];
  const crypto=['BTC','ETH','BNB','XRP','SOL','ADA','DOGE','LTC','DOT','AVAX','LINK','BCH','TRX','TON','XLM','UNI','ATOM','ETC','NEAR','SUI','USDT','USDC','DAI'];
  if(crypto.some(code=>value.startsWith(code)))return 'Crypto';
  if(value.length===6&&currencies.includes(value.slice(0,3))&&currencies.includes(value.slice(3,6)))return 'Forex';
  if(/^(US30|US500|USTEC|NAS100|SPX500|DE30|GER40|UK100|JP225|HK50|AUS200|EU50|FR40|STOXX50)/.test(value))return 'Indices';
  return 'ETC';
}

function dateText(d: Date | null) {
  if (!d) return '--/--/---- --:--:--';
  const p = (n:number) => String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function releaseBuildNumber(tag:string) {
  const match=tag.trim().match(/^v?(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

async function cleanupInstalledUpdateApks() {
  const directory=FileSystem.cacheDirectory;
  if (!directory) return;
  try {
    const installedBuild=Number(BUILD_INFO.build);
    const entries=await FileSystem.readDirectoryAsync(directory);
    for (const name of entries) {
      const match=name.match(/^tinchodoko-update-v(\d+)\.apk$/i);
      if (match && Number(match[1]) <= installedBuild) {
        await FileSystem.deleteAsync(directory+name,{idempotent:true});
      }
    }
  } catch {
    // Cleanup is best-effort; it must never prevent the app from starting.
  }
}

export default function App() {
  const [screen,setScreen]=useState<Screen>('connection');
  const [c,setC]=useState<Credentials>({gatewayUrl:'https://api.exness.com',apiKey:'',secret:'',accountId:''});
  const [apiVisible,setApiVisible]=useState(false);
  const [secretVisible,setSecretVisible]=useState(false);
  const [status,setStatus]=useState<'offline'|'online'|'connecting'>('offline');
  const [balance,setBalance]=useState<string>('—');
  const [equity,setEquity]=useState<string>('—');
  const [usedMargin,setUsedMargin]=useState<string>('—');
  const [accessPoint,setAccessPoint]=useState('');
  const [last,setLast]=useState<Date|null>(null);
  const [busy,setBusy]=useState(false);
  const [,setStreamStatus]=useState<'off'|'connecting'|'connected'|'disconnected'|'error'>('off');
  const [autoRefresh,setAutoRefresh]=useState(false);
  const autoRefreshRef=useRef(false);
  const [intervalUnit,setIntervalUnit]=useState<'seconds'|'minutes'>('seconds');
  const [intervalValue,setIntervalValue]=useState(5);
  const [appliedIntervalUnit,setAppliedIntervalUnit]=useState<'seconds'|'minutes'>('seconds');
  const [appliedIntervalValue,setAppliedIntervalValue]=useState(5);
  const [intervalMenu,setIntervalMenu]=useState(false);
  const [sliderWidth,setSliderWidth]=useState(1);
  const [sliderLeft,setSliderLeft]=useState(0);
  const sliderTrackRef=useRef<View>(null);
  const [savingInterval,setSavingInterval]=useState(false);
  const [latestVersion,setLatestVersion]=useState<string|null>(null);
  const [latestBuild,setLatestBuild]=useState<number|null>(null);
  const [latestApkUrl,setLatestApkUrl]=useState<string|null>(null);
  const [checkingUpdate,setCheckingUpdate]=useState(false);
  const [downloadingUpdate,setDownloadingUpdate]=useState(false);
  const [historyData,setHistoryData]=useState<TradingHistoryData|null>(null);
  const [historyMode,setHistoryMode]=useState<'active'|'past'>('active');
  const [historyPair,setHistoryPair]=useState('*');
  const [historyMenuOpen,setHistoryMenuOpen]=useState(false);
  const [positionsExpanded,setPositionsExpanded]=useState(true);
  const [pendingExpanded,setPendingExpanded]=useState(true);
  const [buyOrdersExpanded,setBuyOrdersExpanded]=useState(true);
  const [sellOrdersExpanded,setSellOrdersExpanded]=useState(true);
  const [cancelledOrdersExpanded,setCancelledOrdersExpanded]=useState(true);
  const [buildRuns,setBuildRuns]=useState<Array<{run_number:number;conclusion:string|null;status:string;display_title:string}>>([]);
  const [buildRunsLoading,setBuildRunsLoading]=useState(true);
  const swipeStart=useRef<{x:number;y:number}|null>(null);
  const [historyLoading,setHistoryLoading]=useState(false);
  const historyLoadingRef=useRef(false);
  const [historyError,setHistoryError]=useState('');
  const [historyAutoRefresh,setHistoryAutoRefresh]=useState(false);
  const historyAutoRefreshRef=useRef(false);
  const [historyIntervalUnit,setHistoryIntervalUnit]=useState<'seconds'|'minutes'>('seconds');
  const [historyIntervalValue,setHistoryIntervalValue]=useState(5);
  const [appliedHistoryIntervalUnit,setAppliedHistoryIntervalUnit]=useState<'seconds'|'minutes'>('seconds');
  const [appliedHistoryIntervalValue,setAppliedHistoryIntervalValue]=useState(5);
  const [historyIntervalMenu,setHistoryIntervalMenu]=useState(false);
  const [historySliderWidth,setHistorySliderWidth]=useState(1);
  const [historySliderLeft,setHistorySliderLeft]=useState(0);
  const historySliderTrackRef=useRef<View>(null);
  const [historySavingInterval,setHistorySavingInterval]=useState(false);
  const [historyLastSync,setHistoryLastSync]=useState<Date|null>(null);
  const [historyStatus,setHistoryStatus]=useState<'offline'|'online'>('offline');
  const [tradeAction,setTradeAction]=useState<TradeAction|null>(null);
  const [tradeConfirm,setTradeConfirm]=useState<TradeAction|null>(null);
  const [tradeBusy,setTradeBusy]=useState(false);
  const [positionCategory,setPositionCategory]=useState<'Crypto'|'Forex'|'Favorites'>('Forex');
  const [favoriteInstruments,setFavoriteInstruments]=useState<string[]>([]);
  const [appActiveTick,setAppActiveTick]=useState(0);
  const [marketVolumeSliderWidth,setMarketVolumeSliderWidth]=useState(1);
  const [marketVolumeSliderLeft,setMarketVolumeSliderLeft]=useState(0);
  const marketVolumeSliderRef=useRef<View>(null);
  const [limitVolumeSliderWidth,setLimitVolumeSliderWidth]=useState(1);
  const [limitVolumeSliderLeft,setLimitVolumeSliderLeft]=useState(0);
  const limitVolumeSliderRef=useRef<View>(null);
  const [instrumentList,setInstrumentList]=useState<string[]>([]);
  const [selectedInstrument,setSelectedInstrument]=useState('');
  const [instrumentCategoryMenu,setInstrumentCategoryMenu]=useState(false);
  const [instrumentMenuOpen,setInstrumentMenuOpen]=useState(false);
  const [instrumentLoading,setInstrumentLoading]=useState(false);
  const [instrumentError,setInstrumentError]=useState('');
  const [instrumentConditions,setInstrumentConditions]=useState<ExnessInstrumentConditions|null>(null);
  const [tick,setTick]=useState<ExnessTick|null>(null);
  const [tickStatus,setTickStatus]=useState<'offline'|'online'|'connecting'>('offline');
  const [positionsLastSync,setPositionsLastSync]=useState<Date|null>(null);
  const [positionsAutoRefresh,setPositionsAutoRefresh]=useState(false);
  const [positionsInterval,setPositionsInterval]=useState(5);
  const [positionsAppliedInterval,setPositionsAppliedInterval]=useState(5);
  const [positionsIntervalMenu,setPositionsIntervalMenu]=useState(false);
  const [positionsSavingInterval,setPositionsSavingInterval]=useState(false);
  const [marketDirection,setMarketDirection]=useState<'buy'|'sell'>('buy');
  const [marketVolume,setMarketVolume]=useState('0.01');
  const [marketTakeProfit,setMarketTakeProfit]=useState('');
  const [marketStopLoss,setMarketStopLoss]=useState('');
  const [limitDirection,setLimitDirection]=useState<'buy'|'sell'>('buy');
  const [limitVolume,setLimitVolume]=useState('0.01');
  const [limitEntryPrice,setLimitEntryPrice]=useState('');
  const [limitTakeProfit,setLimitTakeProfit]=useState('');
  const [orderPanel,setOrderPanel]=useState<'market'|'limit'>('market');
  const [limitStopLoss,setLimitStopLoss]=useState('');
  const [positionSubmitting,setPositionSubmitting]=useState(false);
  const tickSocketRef=useRef<WebSocket|null>(null);

  useEffect(()=>{
    loadCredentials().then(x=>x&&setC(x));
    SecureStore.getItemAsync('tinchodoko.profile.refreshInterval').then(raw=>{
      if (!raw) return;
      try {
        const saved=JSON.parse(raw) as {unit?:'seconds'|'minutes';value?:number};
        if ((saved.unit==='seconds'||saved.unit==='minutes') && Number.isInteger(saved.value)) {
          const min=saved.unit==='seconds'?5:1;
          const max=saved.unit==='seconds'?60:10;
          if (saved.value!>=min && saved.value!<=max) {
            setIntervalUnit(saved.unit);
            setIntervalValue(saved.value!);
            setAppliedIntervalUnit(saved.unit);
            setAppliedIntervalValue(saved.value!);
          }
        }
      } catch { /* Ignore invalid saved interval and keep 5 seconds. */ }
    }).catch(()=>{});
    SecureStore.getItemAsync('tinchodoko.positions.favorites').then(raw=>{try{const saved=JSON.parse(raw??'[]');if(Array.isArray(saved))setFavoriteInstruments(saved.filter((x):x is string=>typeof x==='string'));}catch{}}).catch(()=>{});
    SecureStore.getItemAsync('tinchodoko.positions.refreshInterval').then(raw=>{
      if (!raw) return;
      try { const saved=JSON.parse(raw) as {value?:number}; if(Number.isInteger(saved.value)&&saved.value!>=5&&saved.value!<=60){setPositionsInterval(saved.value!);setPositionsAppliedInterval(saved.value!);} } catch {}
    }).catch(()=>{});
    SecureStore.getItemAsync('tinchodoko.history.refreshInterval').then(raw=>{
      if (!raw) return;
      try {
        const saved=JSON.parse(raw) as {unit?:'seconds'|'minutes';value?:number};
        if ((saved.unit==='seconds'||saved.unit==='minutes') && Number.isInteger(saved.value)) {
          const min=saved.unit==='seconds'?5:1;
          const max=saved.unit==='seconds'?60:10;
          if (saved.value!>=min && saved.value!<=max) {
            setHistoryIntervalUnit(saved.unit);
            setHistoryIntervalValue(saved.value!);
            setAppliedHistoryIntervalUnit(saved.unit);
            setAppliedHistoryIntervalValue(saved.value!);
          }
        }
      } catch { /* Keep the history default at five seconds. */ }
    }).catch(()=>{});
    void cleanupInstalledUpdateApks();
  },[]);

  // Mantiene un único flujo firmado por cuenta y se resincroniza al reconectar.
  useEffect(()=>{
    if (!accessPoint || !autoRefresh || !c.apiKey || !c.secret || !c.accountId) {
      setStreamStatus('off');
      return;
    }
    let cancelled=false;
    let socket: WebSocket | null=null;
    let retryTimer: ReturnType<typeof setTimeout> | null=null;
    let retryDelay=3000;
    const scheduleReconnect=()=>{
      if (cancelled || retryTimer) return;
      retryTimer=setTimeout(()=>{ retryTimer=null; void startStream(); },retryDelay);
      retryDelay=Math.min(retryDelay*2,30000);
    };
    const startStream=async()=>{
      if (cancelled) return;
      try {
        const next=await openExnessAccountStream(c,accessPoint,state=>{
          if (cancelled || !autoRefreshRef.current) return;
          if (state.balance !== undefined) setBalance(state.balance);
          if (state.equity !== undefined) setEquity(state.equity);
          if (state.usedMargin !== undefined) setUsedMargin(state.usedMargin);
          // La fecha refleja la consulta REST programada, no cada evento WebSocket.
          // El stream sigue actualizando balance/equity en tiempo real sin alterar el intervalo visible.
          setStatus('online');
        },stream=>{
          if (cancelled || !autoRefreshRef.current) return;
          setStreamStatus(stream);
          if (stream==='connected') retryDelay=3000;
          if (stream==='disconnected' || stream==='error') scheduleReconnect();
        });
        if (cancelled) { next.close(); return; }
        socket=next;
      } catch {
        if (!cancelled) { setStreamStatus('error'); scheduleReconnect(); }
      }
    };
    void startStream();
    return ()=>{
      cancelled=true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  },[accessPoint,autoRefresh,c.apiKey,c.secret,c.accountId]);

  useEffect(()=>{
    if (!accessPoint || !autoRefresh) return;
    const intervalMs = (appliedIntervalUnit==='seconds' ? appliedIntervalValue : appliedIntervalValue*60) * 1000;
    const timer = setInterval(()=>{ void refresh(true); }, intervalMs);
    return ()=>clearInterval(timer);
  },[accessPoint,autoRefresh,appliedIntervalUnit,appliedIntervalValue]);

  async function connect() {
    setBusy(true); setStatus('connecting');
    try {
      await saveCredentials(c);
      // CONNECT validates the signed Exness request and discovers the
      // account Access Point. Balance is not requested during connection.
      const r=await connectToExness(c);
      setBalance('—'); setEquity('—'); setUsedMargin('—'); setAccessPoint(r.accessPoint); setStatus('online');
      setHistoryPair('*'); setHistoryData(null); setHistoryLastSync(null); setHistoryStatus('offline');
      setLast(null);
      autoRefreshRef.current=false;
      setAutoRefresh(false);
      historyAutoRefreshRef.current=false;
      setHistoryAutoRefresh(false);
      setScreen('connection');
    } catch(e) {
      setStatus('offline'); Alert.alert('Conexión fallida',e instanceof Error?e.message:String(e));
    } finally { setBusy(false); }
  }

  const minInterval = intervalUnit==='seconds' ? 5 : 1;
  const maxInterval = intervalUnit==='seconds' ? 60 : 10;
  const intervalLabel = intervalUnit==='seconds'
    ? `${String(intervalValue).padStart(2,'0')}S`
    : `${intervalValue}M`;

  const pnlValue = (() => { const b=Number(balance); const e=Number(equity); if (!Number.isFinite(b)||!Number.isFinite(e)) return null; return e-b; })();

  function setSliderFromLocation(pageX:number, width:number) {
    const usableWidth = Math.max(1, width - 18);
    const localX=pageX-sliderLeft;
    const ratio = Math.max(0, Math.min(1, (localX - 9) / usableWidth));
    const next = Math.round(minInterval + ratio * (maxInterval - minInterval));
    setIntervalValue(next);
  }
  const sliderThumbPosition = 9 + ((intervalValue - minInterval) / (maxInterval - minInterval)) * Math.max(1, sliderWidth - 18);

  async function saveSelectedInterval() {
    setSavingInterval(true);
    try {
      await SecureStore.setItemAsync('tinchodoko.profile.refreshInterval',JSON.stringify({unit:intervalUnit,value:intervalValue}));
      setAppliedIntervalUnit(intervalUnit);
      setAppliedIntervalValue(intervalValue);
      Alert.alert('Intervalo guardado',`El intervalo predeterminado ahora es ${intervalLabel}.`);
    } catch(e) {
      Alert.alert('No se pudo guardar el intervalo',e instanceof Error?e.message:String(e));
    } finally { setSavingInterval(false); }
  }

  async function refresh(automatic=false) {
    if (automatic && !autoRefreshRef.current) return;
    if(busy) return;
    setBusy(true);
    try {
      const r=await getAccountSnapshot(c,accessPoint);
      if (automatic && !autoRefreshRef.current) return;
      setBalance(r.balance ?? 'No disponible en la respuesta');
      setEquity(r.equity ?? 'No disponible en la respuesta');
      setUsedMargin(r.usedMargin ?? 'No disponible en la respuesta');
      setStatus('online');
      setLast(new Date());
    } catch(e) {
      if (automatic && !autoRefreshRef.current) return;
      setStatus('offline'); Alert.alert('Actualización fallida',e instanceof Error?e.message:String(e));
    } finally { setBusy(false); }
  }


  async function loadHistory(mode: 'active'|'past' = historyMode, automatic=false, allowWithoutPair=false) {
    if (!historyPair && !allowWithoutPair) {
      setHistoryData(null);
      setHistoryError('Seleccioná un par o MOSTRAR TODO para consultar las órdenes.');
      setHistoryStatus('offline');
      return;
    }
    if (!accessPoint || !c.apiKey || !c.secret || !c.accountId) {
      setHistoryError('Primero conectá tu cuenta de Exness desde CONEXIÓN.');
      setHistoryStatus('offline');
      return;
    }
    if (historyLoadingRef.current && automatic) return;
    historyLoadingRef.current=true;
    setHistoryLoading(true);
    if (!automatic) setHistoryError('');
    try {
      const data=await getTradingHistory(c,accessPoint,'all');
      if (automatic && !historyAutoRefreshRef.current) return;
      setHistoryData(data);
      setHistoryStatus('online');
      setHistoryLastSync(new Date());
      setHistoryError('');
    } catch(e) {
      if (!automatic || historyAutoRefreshRef.current) {
        setHistoryError(e instanceof Error?e.message:String(e));
        setHistoryStatus('offline');
      }
    } finally { historyLoadingRef.current=false; setHistoryLoading(false); }
  }
  const historyMinInterval=historyIntervalUnit==='seconds'?5:1;
  const historyMaxInterval=historyIntervalUnit==='seconds'?60:10;
  const historyIntervalLabel=historyIntervalUnit==='seconds' ? String(historyIntervalValue).padStart(2,'0')+'S' : historyIntervalValue+'M';
  const historySliderThumbPosition=9+((historyIntervalValue-historyMinInterval)/(historyMaxInterval-historyMinInterval))*Math.max(1,historySliderWidth-18);
  function setHistorySliderFromLocation(pageX:number,width:number) {
    const usableWidth=Math.max(1,width-18);
    const localX=pageX-historySliderLeft;
    const ratio=Math.max(0,Math.min(1,(localX-9)/usableWidth));
    setHistoryIntervalValue(Math.round(historyMinInterval+ratio*(historyMaxInterval-historyMinInterval)));
  }
  async function saveHistoryInterval() {
    setHistorySavingInterval(true);
    try {
      await SecureStore.setItemAsync('tinchodoko.history.refreshInterval',JSON.stringify({unit:historyIntervalUnit,value:historyIntervalValue}));
      setAppliedHistoryIntervalUnit(historyIntervalUnit);
      setAppliedHistoryIntervalValue(historyIntervalValue);
      Alert.alert('Intervalo guardado','El intervalo de HISTORIAL ahora es '+historyIntervalLabel+'.');
    } catch(e) { Alert.alert('No se pudo guardar el intervalo',e instanceof Error?e.message:String(e)); }
    finally { setHistorySavingInterval(false); }
  }
  useEffect(()=>{
    if (!historyAutoRefresh || !accessPoint || !historyData) return;
    const intervalMs=(appliedHistoryIntervalUnit==='seconds'?appliedHistoryIntervalValue:appliedHistoryIntervalValue*60)*1000;
    const timer=setInterval(()=>{ if (historyAutoRefreshRef.current) void loadHistory(historyMode,true); },intervalMs);
    return ()=>clearInterval(timer);
  },[historyAutoRefresh,accessPoint,!!historyData,historyMode,appliedHistoryIntervalUnit,appliedHistoryIntervalValue]);

  useEffect(()=>{
    if(screen!=='app') return;
    let cancelled=false;
    // Always have the complete V0-current registry available locally.
    // GitHub Actions is only used to refresh it with newer runs/statuses.
    setBuildRuns(BUILD_HISTORY_FALLBACK);
    setBuildRunsLoading(false);
    const loadAllBuildRuns=async()=>{
      try{
        const allRuns:any[]=[];
        for(let page=1;page<=20&&!cancelled;page++){
          const response=await fetch(\`https://api.github.com/repos/Tinchodoko/tinchodoko-ai-assistant/actions/runs?per_page=100&page=\${page}&_=${Date.now()}\`,{headers:{Accept:'application/vnd.github+json','Cache-Control':'no-cache'}});
          if(!response.ok) throw new Error(\`GitHub HTTP ${response.status}\`);
          const data=await response.json();
          const pageRuns=Array.isArray(data.workflow_runs)?data.workflow_runs:[];
          allRuns.push(...pageRuns);
          if(pageRuns.length<100) break;
        }
        if(!cancelled){
          const byBuild=new Map<number,{run_number:number;conclusion:string|null;status:string;display_title:string}>();
          for(const fallback of BUILD_HISTORY_FALLBACK) byBuild.set(fallback.run_number,fallback);
          for(const run of allRuns){
            const runNumber=Number(run.run_number);
            if(!Number.isFinite(runNumber)) continue;
            byBuild.set(runNumber,{run_number:runNumber,conclusion:run.conclusion??null,status:String(run.status??'unknown'),display_title:String(run.display_title??run.name??'Build')});
          }
          const currentBuild=Number(BUILD_INFO.build);
          if(Number.isFinite(currentBuild)&&!byBuild.has(currentBuild)){
            byBuild.set(currentBuild,{run_number:currentBuild,conclusion:'success',status:'completed',display_title:'Build actual'});
          }
          setBuildRuns([...byBuild.values()].sort((a,b)=>b.run_number-a.run_number));
        }
      }catch{
        // Keep the bundled V0-current registry. Never replace it with an empty list.
      }
    };
    void loadAllBuildRuns();
    return ()=>{cancelled=true;};
  },[screen]);

  function handleSwipeStart(event:any) { swipeStart.current={x:event.nativeEvent.pageX,y:event.nativeEvent.pageY}; }

  useEffect(()=>{
    const sub=AppState.addEventListener('change',state=>{if(state==='active')setAppActiveTick(v=>v+1);});
    return ()=>sub.remove();
  },[]);

  useEffect(()=>{
    if(screen!=='positions'||!accessPoint||!c.apiKey||!c.secret||!c.accountId)return;
    let cancelled=false;setInstrumentLoading(true);setInstrumentError('');
    getAvailableInstruments(c,accessPoint).then(items=>{
      if(cancelled)return;setInstrumentList(items);
      if(selectedInstrument && !items.includes(selectedInstrument))setSelectedInstrument('');
    }).catch(error=>{if(!cancelled)setInstrumentError(error instanceof Error?error.message:String(error));})
      .finally(()=>{if(!cancelled)setInstrumentLoading(false);});
    return ()=>{cancelled=true;};
  },[screen,accessPoint,c.apiKey,c.secret,c.accountId]);

  useEffect(()=>{
    if(screen!=='positions'||!selectedInstrument||!accessPoint){setTick(null);setTickStatus('offline');tickSocketRef.current?.close();tickSocketRef.current=null;return;}
    let cancelled=false;let socket:WebSocket|null=null;setTickStatus('connecting');setInstrumentConditions(null);
    getInstrumentConditions(c,accessPoint,selectedInstrument).then(value=>{if(!cancelled)setInstrumentConditions(value);})
      .catch(error=>{if(!cancelled)setInstrumentError(error instanceof Error?error.message:String(error));});
    openExnessTickStream(c,accessPoint,selectedInstrument,value=>{if(!cancelled){setTick(value);setPositionsLastSync(new Date());}},state=>{
      if(!cancelled)setTickStatus(state==='connected'?'online':state==='connecting'?'connecting':'offline');
    }).then(next=>{if(cancelled){next.close();return;}socket=next;tickSocketRef.current=next;})
      .catch(error=>{if(!cancelled){setTickStatus('offline');setInstrumentError(error instanceof Error?error.message:String(error));}});
    return ()=>{cancelled=true;socket?.close();if(tickSocketRef.current===socket)tickSocketRef.current=null;};
  },[screen,selectedInstrument,accessPoint,c.apiKey,c.secret,c.accountId,appActiveTick]);

  useEffect(()=>{
    if(screen!=='positions'||!positionsAutoRefresh||!selectedInstrument||!accessPoint)return;
    const timer=setInterval(()=>{getInstrumentConditions(c,accessPoint,selectedInstrument).then(value=>{setInstrumentConditions(value);setPositionsLastSync(new Date());}).catch(()=>setTickStatus('offline'));},positionsAppliedInterval*1000);
    return ()=>clearInterval(timer);
  },[screen,positionsAutoRefresh,selectedInstrument,accessPoint,positionsAppliedInterval,c.apiKey,c.secret,c.accountId]);

  async function savePositionsInterval(){
    setPositionsSavingInterval(true);
    try{await SecureStore.setItemAsync('tinchodoko.positions.refreshInterval',JSON.stringify({value:positionsInterval}));setPositionsAppliedInterval(positionsInterval);Alert.alert('Intervalo guardado',`El intervalo de POSICIONES ahora es ${positionsInterval} segundos.`);}
    catch(error){Alert.alert('No se pudo guardar el intervalo',error instanceof Error?error.message:String(error));}
    finally{setPositionsSavingInterval(false);}
  }
  function setVolumeFromLocation(pageX:number,width:number,left:number,setter:(value:string)=>void){
    const usableWidth=Math.max(1,width-18);const localX=pageX-left;const ratio=Math.max(0,Math.min(1,(localX-9)/usableWidth));
    setter((0.01+ratio*0.99).toFixed(2));
  }
  function volumeThumbPosition(value:string,width:number){const amount=Math.max(0.01,Math.min(1,Number(value)||0.01));return 9+((amount-0.01)/0.99)*Math.max(1,width-18);}
  function validateOrderVolume(raw:string):string|null{
    const value=raw.trim().replace(',','.');if(!/^(?:0|[0-9]+)(?:\.[0-9]+)?$/.test(value))return null;
    const amount=Number(value);if(!Number.isFinite(amount)||amount<0.01||amount>1)return null;
    const min=Number(instrumentConditions?.volume_min??0.01),max=Math.min(1,Number(instrumentConditions?.volume_max??1)),step=Number(instrumentConditions?.volume_step??0.01);
    if(amount<min||amount>max)return null;
    if(Number.isFinite(step)&&step>0&&Math.abs(amount/step-Math.round(amount/step))>1e-7)return null;
    return value;
  }
  function validateOrderPrice(raw:string,label:string):string|undefined|null{
    const value=raw.trim().replace(',','.');if(!value)return undefined;
    if(!/^(?:[0-9]+)(?:\.[0-9]+)?$/.test(value)||!Number.isFinite(Number(value))||Number(value)<=0)return null;
    const digits=instrumentConditions?.point_digits;
    if(typeof digits==='number'&&value.includes('.')&&value.split('.')[1].length>digits){Alert.alert('Precisión inválida',`${label}: Exness permite como máximo ${digits} decimales para ${selectedInstrument}.`);return null;}
    return value;
  }
  async function submitMarketOrder(){
    if(positionSubmitting)return;if(status!=='online'||!accessPoint){Alert.alert('Cuenta desconectada','Conectá tu cuenta Exness antes de enviar una orden.');return;}
    if(!selectedInstrument){Alert.alert('Instrumento requerido','Seleccioná un instrumento disponible de Exness.');return;}
    const volume=validateOrderVolume(marketVolume);if(!volume){Alert.alert('Volumen inválido','INGRESA UN VALOR DE LOTE VÁLIDO DE 0.01 A 1 LOTES PORFAVOR');return;}
    const sl=validateOrderPrice(marketStopLoss,'STOP LOSS'),tp=validateOrderPrice(marketTakeProfit,'TAKE PROFIT');if(sl===null||tp===null)return;
    const currentPrice=tick?(tick.bid+tick.ask)/2:NaN;
    if(!Number.isFinite(currentPrice)){Alert.alert('Precio no disponible','Esperá la cotización actual de Exness.');return;}
    if(tp!==undefined&&!(marketDirection==='buy'?Number(tp)>currentPrice:Number(tp)<currentPrice)){Alert.alert('VALOR DE TP/SL INCORRECTO','VALOR DE TP/SL INCORRECTO, DEBE SER '+(marketDirection==='buy'?'MAYOR':'MENOR')+' A ('+currentPrice+')');return;}
    if(sl!==undefined&&!(marketDirection==='buy'?Number(sl)<currentPrice:Number(sl)>currentPrice)){Alert.alert('VALOR DE TP/SL INCORRECTO','VALOR DE TP/SL INCORRECTO, DEBE SER '+(marketDirection==='buy'?'MENOR':'MAYOR')+' A ('+currentPrice+')');return;}
    setPositionSubmitting(true);try{const result=await openMarketPosition(c,accessPoint,{instrument:selectedInstrument,direction:marketDirection,volume,stopLoss:sl,takeProfit:tp});
      Alert.alert('Solicitud de MARKET ORDER enviada',`Exness aceptó la solicitud.\\nOperación: ${String(result.operation_id??'pendiente')}\\nEstado: ${String(result.status??'accepted')}`);setPositionsLastSync(new Date());}
    catch(error){Alert.alert('No se pudo abrir la MARKET ORDER',error instanceof Error?error.message:String(error));}finally{setPositionSubmitting(false);}
  }
  async function submitLimitOrder(){
    if(positionSubmitting)return;if(status!=='online'||!accessPoint){Alert.alert('Cuenta desconectada','Conectá tu cuenta Exness antes de enviar una orden.');return;}
    if(!selectedInstrument){Alert.alert('Instrumento requerido','Seleccioná un instrumento disponible de Exness.');return;}
    const volume=validateOrderVolume(limitVolume);if(!volume){Alert.alert('Volumen inválido','INGRESA UN VALOR DE LOTE VÁLIDO DE 0.01 A 1 LOTES PORFAVOR');return;}
    const entry=validateOrderPrice(limitEntryPrice,'ENTRY PRICE'),sl=validateOrderPrice(limitStopLoss,'STOP LOSS'),tp=validateOrderPrice(limitTakeProfit,'TAKE PROFIT');
    if(entry===null||sl===null||tp===null)return;if(entry===undefined){Alert.alert('Precio requerido','Ingresá el ENTRY PRICE de la orden límite.');return;}
    const currentPrice=tick?(tick.bid+tick.ask)/2:NaN;
    if(!Number.isFinite(currentPrice)){Alert.alert('Precio no disponible','Esperá la cotización actual de Exness.');return;}
    if(!(limitDirection==='buy'?Number(entry)<currentPrice:Number(entry)>currentPrice)){Alert.alert('PRECIO DE ENTRADA INCORRECTO','PRECIO DE ENTRADA INCORRECTO, DEBE SER '+(limitDirection==='buy'?'MENOR':'MAYOR')+' QUE ('+currentPrice+')');return;}
    if(tp!==undefined&&!(limitDirection==='buy'?Number(tp)>Number(entry):Number(tp)<Number(entry))){Alert.alert('VALOR DE TP/SL INCORRECTO','VALOR DE TP/SL INCORRECTO, DEBE SER '+(limitDirection==='buy'?'MAYOR':'MENOR')+' A ('+entry+')');return;}
    if(sl!==undefined&&!(limitDirection==='buy'?Number(sl)<Number(entry):Number(sl)>Number(entry))){Alert.alert('VALOR DE TP/SL INCORRECTO','VALOR DE TP/SL INCORRECTO, DEBE SER '+(limitDirection==='buy'?'MENOR':'MAYOR')+' A ('+entry+')');return;}
    setPositionSubmitting(true);try{const result=await placeLimitOrder(c,accessPoint,{instrument:selectedInstrument,direction:limitDirection,volume,price:entry,stopLoss:sl,takeProfit:tp});
      Alert.alert('Solicitud de LIMIT ORDER enviada',`Exness aceptó la solicitud.\\nOperación: ${String(result.operation_id??'pendiente')}\\nEstado: ${String(result.status??'accepted')}`);setPositionsLastSync(new Date());}
    catch(error){Alert.alert('No se pudo crear la LIMIT ORDER',error instanceof Error?error.message:String(error));}finally{setPositionSubmitting(false);}
  }

  function handleSwipeEnd(event:any) {
    const start=swipeStart.current; swipeStart.current=null; if(!start)return;
    const dx=event.nativeEvent.pageX-start.x,dy=event.nativeEvent.pageY-start.y;
    if(Math.abs(dx)<75||Math.abs(dx)<Math.abs(dy)*1.25)return;
    const steps: Array<{screen:Screen;mode?:'active'|'past'}>=[{screen:'connection'},{screen:'profile'},{screen:'positions'},{screen:'history',mode:'active'},{screen:'history',mode:'past'},{screen:'app'}];
    const current=steps.findIndex(step=>step.screen===screen&&(step.screen!=='history'||step.mode===historyMode));
    const next=steps[Math.max(0,Math.min(steps.length-1,current+(dx<0?1:-1)))];
    if(next){setScreen(next.screen);if(next.mode)setHistoryMode(next.mode);setHistoryMenuOpen(false);setIntervalMenu(false);setHistoryIntervalMenu(false);}
  }
  function openHistory() {
    // Entrar a HISTORIAL nunca dispara consultas: la primera sincronización
    // queda bajo control del usuario mediante ACTUALIZAR HISTORIAL.
    setScreen('history');
  }
  function historyValue(item:Record<string,unknown>,key:string,fallback='—') { const value=item[key]; return value===undefined||value===null||value===''?fallback:String(value); }
  function configuredPrice(item:Record<string,unknown>|undefined,key:'stop_loss_price'|'take_profit_price') {
    if (!item) return 'NO CONFIGURADO';
    const value=item[key];
    return value===undefined||value===null||value===''||Number(value)===0?'NO CONFIGURADO':String(value);
  }
  function historyDate(item:Record<string,unknown>,...keys:string[]) {
    for(const key of keys){const raw=item[key];if(typeof raw==='string'||typeof raw==='number'){const d=new Date(raw);if(!Number.isNaN(d.getTime()))return d.toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'});}}
    return 'Fecha no disponible';
  }
  function historyOrderPnl(order:Record<string,unknown>) {
    const orderId=String(order.order_id??'');
    if(!orderId) return 'NO DISPONIBLE';
    const related=(historyData?.deals??[]).map(item=>item.deal&&typeof item.deal==='object'?item.deal as Record<string,unknown>:item)
      .filter(deal=>String(deal.order_id??'')===orderId);
    if(!related.length) return 'NO DISPONIBLE';
    let total=0,hasValue=false,currency='';
    for(const deal of related) {
      const profit=deal.profit&&typeof deal.profit==='object'?deal.profit as Record<string,unknown>:{};
      const amount=Number(profit.amount);
      if(Number.isFinite(amount)){total+=amount;hasValue=true;}
      const commission=Number(deal.commission);
      if(deal.commission!==undefined&&deal.commission!==null&&deal.commission!==''&&Number.isFinite(commission)){total+=commission;hasValue=true;}
      if(!currency&&typeof profit.currency==='string') currency=profit.currency;
    }
    if(!hasValue) return 'NO DISPONIBLE';
    return `${total>=0?'+':''}${total.toFixed(2)}${currency?' '+currency:''}`;
  }
  const filteredPositionInstruments=positionCategory==='Favorites'
    ? instrumentList.filter(symbol=>favoriteInstruments.includes(symbol))
    : instrumentList.filter(symbol=>classifyExnessInstrument(symbol)===positionCategory);
  function toggleFavorite(symbol:string){
    setFavoriteInstruments(current=>{
      const next=current.includes(symbol)?current.filter(x=>x!==symbol):[...current,symbol];
      void SecureStore.setItemAsync('tinchodoko.positions.favorites',JSON.stringify(next)).catch(()=>{});
      return next;
    });
  }
  function setPositionCategoryAndClear(category:'Crypto'|'Forex'|'Favorites'){
    setPositionCategory(category);setInstrumentCategoryMenu(false);setInstrumentMenuOpen(false);
    if(category==='Favorites' ? !favoriteInstruments.includes(selectedInstrument) : classifyExnessInstrument(selectedInstrument)!==category)setSelectedInstrument('');
  }
  const historySymbols=historyData?Array.from(new Set([...historyData.positions.map(x=>String(x.instrument??'')),...historyData.activeOrders.map(x=>String(x.instrument??'')),...historyData.pastOrders.map(x=>{const o=x.order&&typeof x.order==='object'?x.order as Record<string,unknown>:x;return String(o.instrument??'');}),...historyData.deals.map(x=>{const d=x.deal&&typeof x.deal==='object'?x.deal as Record<string,unknown>:x;return String(d.instrument??'');})].filter(x=>x&&x!=='undefined'))).sort():[];
  const selectedActivePositions=(historyData?.positions??[]).filter(x=>historyPair==='*'||x.instrument===historyPair);
  const selectedActiveOrders=(historyData?.activeOrders??[]).filter(x=>String(x.order_type??'').toLowerCase()!=='sltp'&&(historyPair==='*'||x.instrument===historyPair));
  const selectedPastOrders=(historyData?.pastOrders??[]).filter(item=>{
    const order=item.order&&typeof item.order==='object'?item.order as Record<string,unknown>:item;
    return historyPair==='*'||String(order.instrument??'')===historyPair;
  });
  const pastOrderGroups=selectedPastOrders.reduce<{buy:typeof selectedPastOrders;sell:typeof selectedPastOrders;cancelled:typeof selectedPastOrders}>((groups,item)=>{
    const order=item.order&&typeof item.order==='object'?item.order as Record<string,unknown>:item;
    const state=String(order.state??order.order_state??'').toUpperCase();
    const direction=String(order.direction??'').toLowerCase();
    if(/CANCEL|REJECT|EXPIRE/.test(state)) groups.cancelled.push(item);
    else if(direction==='buy') groups.buy.push(item);
    else if(direction==='sell') groups.sell.push(item);
    else groups.cancelled.push(item);
    return groups;
  },{buy:[] as typeof selectedPastOrders,sell:[] as typeof selectedPastOrders,cancelled:[] as typeof selectedPastOrders});
  function historyPnlStyle(value:string):TextStyle|undefined {
    const amount=Number(value.replace(/[^0-9+-.]/g,''));
    if(!Number.isFinite(amount)) return undefined;
    if(amount===0) return s.pnlZero;
    return amount>0?s.pnlPositive:s.pnlNegative;
  }
  function renderPastOrderCard(item:any,index:number) {
    const order=item.order&&typeof item.order==='object'?item.order as Record<string,unknown>:item;
    const state=String(order.state??order.order_state??'').toUpperCase();
    const direction=String(order.direction??'').toLowerCase();
    const pnl=state==='FILLED'?historyOrderPnl(order):'—';
    const stateStyle=state==='FILLED'?(direction==='buy'?s.pnlPositive:s.pnlNegative):s.pendingText;
    return <View key={String(order.order_id??index)} style={s.historyCard}>
      <View style={s.historyCardHeader}><PairIdentity instrument={historyValue(order,'instrument','')}/><Text style={stateStyle}>{state||'FINALIZADA'}</Text></View>
      <Info label="ID ORDEN" value={historyValue(order,'order_id')}/>
      <View style={s.info}><Text style={s.infoLabel}>DIRECCIÓN</Text><Text style={[s.infoValue,direction==='buy'?s.pnlPositive:direction==='sell'?s.pnlNegative:undefined]}>{historyValue(order,'direction')}</Text></View>
      <Info label="VOLUMEN" value={historyValue(order,'volume')}/><Info label="PRECIO DE ENTRADA" value={historyValue(order,'price')}/>
      <Info label="STOP LOSS" value={configuredPrice(order,'stop_loss_price')}/><Info label="TAKE PROFIT" value={configuredPrice(order,'take_profit_price')}/>
      <Info label="PNL" value={pnl} valueStyle={historyPnlStyle(pnl)}/><Info label="FECHA Y HORA" value={historyDate(item,'event_time')}/>
    </View>;
  }
  function beginEdit(target:'position'|'order', targetId:string, field:'price'|'stop_loss_price'|'take_profit_price', previous:string, instrument:string, otherField?:'stop_loss_price'|'take_profit_price', otherValue?:string, positionId?:string, basePrice?:number) {
    const cleanId=targetId.trim();
    const cleanPositionId=(positionId??'').trim();
    const createSltp=target==='position' && !/^\d{1,20}$/.test(cleanId);
    if (createSltp && !/^\d{1,20}$/.test(cleanPositionId)) {
      Alert.alert('No se puede modificar', 'Exness no devolvió un ID de posición válido.');
      return;
    }
    if (!createSltp && !/^\d{1,20}$/.test(cleanId)) {
      Alert.alert('No se puede modificar', 'Exness no devolvió un ID de orden válido para este precio.');
      return;
    }
    const otherConfigured=otherValue && otherValue!=='NO CONFIGURADO' && otherValue!=='—' && Number(otherValue)>0 ? otherValue : undefined;
    setTradeAction({kind:'edit',target,targetId:cleanId,positionId:cleanPositionId,createSltp,field,previous,instrument,value:previous==='—'||previous==='NO CONFIGURADO'?'':previous,otherField:otherConfigured?otherField:undefined,otherValue:otherConfigured,basePrice});
  }
  function beginClose(target:'position'|'order', targetId:string, instrument:string, pnl:number|null) {
    setTradeConfirm({kind:'close',target,targetId,instrument,pnl});
  }
  function confirmEditInput() {
    if (!tradeAction || tradeAction.kind!=='edit') return;
    const value=(tradeAction.value??'').trim().replace(',', '.');
    if (!value || !/^[+]?(?:0*[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) {
      Alert.alert('Valor inválido','Ingresá un precio válido mayor que 0.');
      return;
    }
    const base=Number(tradeAction.basePrice);
    if(tradeAction.target==='position' && Number.isFinite(base) && (tradeAction.field==='stop_loss_price'||tradeAction.field==='take_profit_price')){
      const pos=historyData?.positions.find((p: Record<string, unknown>)=>String(p.position_id??'')===String(tradeAction.positionId??''));
      const buyDirection=String(pos?.direction??'').toLowerCase()==='buy';
      const price=Number(value);
      const valid=tradeAction.field==='take_profit_price' ? (buyDirection ? price>base : price<base) : (buyDirection ? price<base : price>base);
      if(!valid){
        const relation=tradeAction.field==='take_profit_price' ? (buyDirection?'MAYOR':'MENOR') : (buyDirection?'MENOR':'MAYOR');
        Alert.alert('VALOR DE TP/SL INCORRECTO','VALOR DE TP/SL INCORRECTO, DEBE SER '+relation+' A ('+base+')');
        return;
      }
    }
    setTradeConfirm({...tradeAction,value});
    setTradeAction(null);
  }
  async function executeTradeAction() {
    if (!tradeConfirm) return;
    setTradeBusy(true);
    try {
      if (tradeConfirm.kind==='edit') {
        if (!tradeConfirm.field || !tradeConfirm.value) throw new Error('Falta el valor de modificación.');
        const payload: Record<string, string> = {[tradeConfirm.field!]: tradeConfirm.value!};
        if (tradeConfirm.otherField && tradeConfirm.otherValue) payload[tradeConfirm.otherField] = tradeConfirm.otherValue.replace(',', '.').trim();
        if (tradeConfirm.createSltp && tradeConfirm.positionId) {
          await createPositionSltp(c,accessPoint,tradeConfirm.positionId,payload);
        } else {
          await modifyActiveOrder(c,accessPoint,tradeConfirm.targetId,payload);
        }
        setTradeConfirm(null);
        Alert.alert('Solicitud enviada','Exness aceptó la modificación. El resultado final se actualizará en el próximo snapshot.');
      } else if (tradeConfirm.target==='position') {
        await closePosition(c,accessPoint,tradeConfirm.targetId);
        setTradeConfirm(null);
        Alert.alert('Solicitud enviada','Exness aceptó el cierre de la posición. El resultado final se actualizará en el próximo snapshot.');
      } else {
        await cancelActiveOrder(c,accessPoint,tradeConfirm.targetId);
        setTradeConfirm(null);
        Alert.alert('Solicitud enviada','Exness aceptó la cancelación de la orden pendiente. El resultado final se actualizará en el próximo snapshot.');
      }
      void loadHistory('active');
    } catch(e) {
      Alert.alert('Operación fallida',e instanceof Error?e.message:String(e));
    } finally {
      setTradeBusy(false);
    }
  }

  async function checkUpdate() {
    setCheckingUpdate(true);
    setLatestVersion(null); setLatestBuild(null); setLatestApkUrl(null);
    try {
      type Release = {
        tag_name?:string; name?:string; draft?:boolean; prerelease?:boolean;
        assets?:Array<{name?:string;browser_download_url?:string}>;
      };
      const headers = {
        Accept: 'application/vnd.github+json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      };
      let release:Release|null = null;
      let primaryError = '';
      // Primary source: tiny public manifest on raw.githubusercontent.com.
      // This avoids GitHub API rate limits and the /releases/latest cache path.
      try {
        const manifestRes=await fetch(`${UPDATE_MANIFEST_URL}?_=${Date.now()}`, { headers });
        if (!manifestRes.ok) throw new Error(`Manifest HTTP ${manifestRes.status}`);
        const manifest=await manifestRes.json() as {build?:number;tag?:string;apk_url?:string};
        const manifestBuild=Number(manifest.build);
        if (!Number.isSafeInteger(manifestBuild) || manifestBuild<1 || !manifest.apk_url || !/^https:\/\/github\.com\/Tinchodoko\/tinchodoko-ai-assistant\/releases\/download\//.test(manifest.apk_url)) {
          throw new Error('El manifiesto de actualización no contiene build o APK válido.');
        }
        release={
          tag_name:manifest.tag || `v${manifestBuild}`,
          draft:false,
          prerelease:false,
          assets:[{name:'app-release.apk',browser_download_url:manifest.apk_url}],
        };
      } catch(e) {
        primaryError=e instanceof Error?e.message:String(e);
      }

      // Fallback 1: GitHub's canonical latest-stable endpoint.
      if (!release) {
        try {
          const res=await fetch(`${LATEST_RELEASE_API}?_=${Date.now()}`, { headers });
          if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
          const candidate=await res.json() as Release;
          const tag=candidate.tag_name || candidate.name || '';
          const apk=candidate.assets?.find(asset=>asset.name==='app-release.apk' && !!asset.browser_download_url);
          if (releaseBuildNumber(tag)>0 && !candidate.draft && !candidate.prerelease && apk?.browser_download_url) {
            release=candidate;
          } else {
            primaryError='La respuesta latest no contiene una Release estable con app-release.apk.';
          }
        } catch(e) {
          primaryError=`${primaryError}; latest: ${e instanceof Error?e.message:String(e)}`;
        }
      }

      // Fallback 2: enumerate releases and choose the highest valid stable build.
      if (!release) {
        const listRes=await fetch(`https://api.github.com/repos/Tinchodoko/tinchodoko-ai-assistant/releases?per_page=30&_=${Date.now()}`, { headers });
        if (!listRes.ok) throw new Error(`No se pudo consultar el manifiesto (${primaryError}) ni Releases (HTTP ${listRes.status}).`);
        const releases=await listRes.json() as Release[];
        release=releases
          .filter(item=>!item.draft && !item.prerelease)
          .filter(item=>releaseBuildNumber(item.tag_name || item.name || '')>0)
          .filter(item=>item.assets?.some(asset=>asset.name==='app-release.apk' && !!asset.browser_download_url))
          .sort((a,b)=>releaseBuildNumber(b.tag_name || b.name || '')-releaseBuildNumber(a.tag_name || a.name || ''))[0] || null;
      }

      if (!release) throw new Error('GitHub no devolvió ninguna Release estable válida con app-release.apk.');
      const tag=release.tag_name || release.name || '';
      const remoteBuild=releaseBuildNumber(tag);
      const apk=release.assets?.find(asset=>asset.name==='app-release.apk' && !!asset.browser_download_url);
      if (!apk?.browser_download_url || remoteBuild<1) throw new Error('La Release encontrada no tiene una versión o APK válido.');
      setLatestVersion(tag); setLatestBuild(remoteBuild); setLatestApkUrl(apk.browser_download_url);
      if (remoteBuild > Number(BUILD_INFO.build)) {
        Alert.alert('Actualización disponible', `Versión instalada: V${BUILD_INFO.build}. Nueva versión: ${tag}. Pulsa ACTUALIZAR APP para descargarla e iniciar el instalador de Android.`);
      } else {
        Alert.alert('Actualización', `La aplicación ya está actualizada (V${BUILD_INFO.build}). Última Release: ${tag}.`);
      }
    } catch(e) {
      setLatestVersion(null); setLatestBuild(null); setLatestApkUrl(null);
      Alert.alert('No se pudo comprobar', e instanceof Error?e.message:String(e));
    } finally { setCheckingUpdate(false); }
  }

  async function updateApp() {
    if (!latestApkUrl || !latestBuild || latestBuild <= Number(BUILD_INFO.build)) {
      Alert.alert('Actualización', 'Primero busca una actualización disponible.');
      return;
    }
    const directory=FileSystem.cacheDirectory;
    if (!directory) {
      Alert.alert('Actualización', 'No se encontró el directorio temporal para descargar el APK.');
      return;
    }
    setDownloadingUpdate(true);
    const localUri=`${directory}tinchodoko-update-v${latestBuild}.apk`;
    try {
      await FileSystem.deleteAsync(localUri,{idempotent:true});
      const download=await FileSystem.downloadAsync(latestApkUrl,localUri);
      if (download.status!==200) throw new Error(`No se pudo descargar el APK (HTTP ${download.status}).`);
      const info=await FileSystem.getInfoAsync(download.uri);
      if (!info.exists || (info.size??0)<1024*1024) throw new Error('El APK descargado está incompleto o vacío.');
      const contentUri=await FileSystem.getContentUriAsync(download.uri);
      // Android muestra su propio instalador y solicita confirmación al usuario.
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW',{
        data:contentUri,
        type:'application/vnd.android.package-archive',
        flags:1,
      });
    } catch(e) {
      Alert.alert('No se pudo iniciar la instalación', e instanceof Error?e.message:String(e));
    } finally {
      setDownloadingUpdate(false);
    }
  }

  const set=(key:keyof Credentials)=>(value:string)=>setC(x=>({...x,[key]:value}));
  const field=(label:string,key:keyof Credentials,secure=false,visible=false,toggle?:()=>void)=>(
    <View style={s.field} key={key}>
      <Text style={s.label}>{label}</Text>
      <View style={s.row}>
        <TextInput style={s.input} value={c[key]} onChangeText={set(key)} autoCapitalize="none" autoCorrect={false}
          secureTextEntry={secure&&!visible} placeholder={label} placeholderTextColor="#6f7785"/>
        {secure && <Pressable style={s.eye} onPress={toggle}><Text>{visible?'🙈':'👁️'}</Text></Pressable>}
      </View>
    </View>
  );

  const renderTradeModals = () => <>
    {tradeAction?.kind==='edit' && <View style={s.modalBackdrop}>
      <View style={s.modalCard}>
        <Text style={s.modalTitle}>Modificar {tradeAction.field==='price'?'precio de entrada':tradeAction.field==='take_profit_price'?'TP':'SL'}</Text>
        <Text style={s.modalSub}>{tradeAction.instrument||'Instrumento'} · {tradeAction.targetId}</Text>
        <Text style={s.modalLabel}>NUEVO VALOR</Text>
        <TextInput autoFocus keyboardType="decimal-pad" value={tradeAction.value??''} onChangeText={value=>setTradeAction(x=>x?{...x,value}:x)} style={s.modalInput} placeholder="Ej. 1.08500" placeholderTextColor="#6f7785"/>
        <View style={s.modalButtons}><Pressable onPress={()=>setTradeAction(null)} style={s.modalCancel}><Text style={s.modalCancelText}>CANCELAR</Text></Pressable><Pressable onPress={confirmEditInput} style={s.modalConfirm}><Text style={s.modalConfirmText}>CONFIRMAR</Text></Pressable></View>
      </View>
    </View>}
    {tradeConfirm && <View style={s.modalBackdrop}>
      <View style={s.modalCard}>
        {tradeConfirm.kind==='edit' ? <>
          <Text style={s.modalTitle}>Confirmar modificación</Text>
          <Text style={s.modalSub}>Se modificará {tradeConfirm.field==='price'?'el precio de entrada':tradeConfirm.field==='take_profit_price'?'el TP':'el SL'} de</Text>
          <Text style={s.modalBig}>{tradeConfirm.previous||'No disponible'} → {tradeConfirm.value}</Text>
        </> : <>
          <Text style={s.modalTitle}>Cerrar la orden {tradeConfirm.targetId}</Text>
          <Text style={s.modalSub}>PNL actual: {tradeConfirm.target==='position' && tradeConfirm.pnl!==null && tradeConfirm.pnl!==undefined ? `${tradeConfirm.pnl>=0?'+':''}${tradeConfirm.pnl.toFixed(2)}` : 'No disponible'}</Text>
        </>}
        <View style={s.modalButtons}><Pressable disabled={tradeBusy} onPress={()=>setTradeConfirm(null)} style={s.modalCancel}><Text style={s.modalCancelText}>CANCELAR</Text></Pressable><Pressable disabled={tradeBusy} onPress={()=>void executeTradeAction()} style={[s.modalConfirm,tradeBusy&&s.disabled]}>{tradeBusy?<ActivityIndicator color="#0b0e13"/>:<Text style={s.modalConfirmText}>CONFIRMAR</Text>}</Pressable></View>
      </View>
    </View>}
  </>;
  return <SafeAreaView style={s.safe}>
    <View style={s.header}><Text style={s.title}>Tinchodoko AI Assistant</Text><View style={[s.dot,status==='online'?s.green:status==='connecting'?s.yellow:s.red]}/></View>
    <View style={s.tabs}>
      <Pressable onPress={()=>{setIntervalMenu(false);setHistoryMenuOpen(false);setHistoryIntervalMenu(false);setScreen('connection');}} style={[s.tab,screen==='connection'&&s.active]}><Text style={s.tabText}>CONEXIÓN</Text></Pressable>
      <Pressable onPress={()=>{setHistoryMenuOpen(false);setHistoryIntervalMenu(false);setScreen('profile');}} style={[s.tab,screen==='profile'&&s.active]}><Text style={s.tabText}>BALANCE</Text></Pressable>
      <Pressable onPress={()=>{setInstrumentMenuOpen(false);setInstrumentCategoryMenu(false);setScreen('positions');}} style={[s.tab,screen==='positions'&&s.active]}><Text style={s.tabText}>POSICIONES</Text></Pressable>\n      <Pressable onPress={()=>{setIntervalMenu(false);openHistory();}} style={[s.tab,screen==='history'&&s.active]}><Text style={s.tabText}>HISTORIAL</Text></Pressable>
      <Pressable onPress={()=>{setIntervalMenu(false);setHistoryMenuOpen(false);setHistoryIntervalMenu(false);setScreen('app');}} style={[s.tab,screen==='app'&&s.active]}><Text style={s.tabText}>APP</Text></Pressable>
    </View>

    {screen==='connection' ? <ScrollView contentContainerStyle={s.content} onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
      <Text style={s.h1}>Conexión</Text><Text style={s.sub}>Credenciales para conexión con Exness.</Text>
      {field('GATEWAY URL','gatewayUrl')}
      {field('API KEY','apiKey',true,apiVisible,()=>setApiVisible(!apiVisible))}
      {field('SECRET','secret',true,secretVisible,()=>setSecretVisible(!secretVisible))}
      {field('ACCOUNT','accountId')}
      <Pressable disabled={busy} onPress={connect} style={[s.button,busy&&s.disabled]}>{busy?<ActivityIndicator/>:<Text style={s.buttonText}>CONECTAR</Text>}</Pressable>
      <Text style={status==='online'?s.onlineText:s.offlineText}>Estado: {status}</Text>
      {status==='online'&&!!accessPoint&&<Text style={s.ap}>URL DE ACCESS POINT: {accessPoint}</Text>}
    </ScrollView>  : screen==='profile' ? <ScrollView contentContainerStyle={s.content} onTouchStart={e=>{handleSwipeStart(e);setIntervalMenu(false);}} onTouchEnd={handleSwipeEnd}>
      <Text style={s.h1}>BALANCE</Text>
      <View style={s.card}>
        <Info label="ACCOUNT" value={c.accountId||'—'}/>
        <Info label="BALANCE" value={balance}/>
        <Info label="EQUITY" value={equity}/> 
      <Info label="GANANCIA / PÉRDIDA" value={pnlValue===null?'—':`${pnlValue>=0?'+':''}${pnlValue.toFixed(2)}`} valueStyle={pnlValue===null?undefined:pnlValue>=0?s.pnlPositive:s.pnlNegative}/>
        <Info label="USED MARGIN" value={usedMargin}/>
      </View>
      <Pressable disabled={busy} onPress={()=>refresh(false)} style={[s.refresh,busy&&s.disabled]}>{busy?<ActivityIndicator/>:<Text style={s.refreshText}>↻  CONSULTAR BALANCE</Text>}</Pressable>
      <View style={s.intervalCard}>
        <View style={s.intervalHeader}>
          <Text style={s.meta}>AUTORREFRESCO</Text>
          <Pressable onPress={()=>{const next=!autoRefresh;autoRefreshRef.current=next;setAutoRefresh(next);}} style={s.clockButton}>
            <Text style={autoRefresh?s.clockOn:s.clockOff}>{autoRefresh?'◷':'✕'}</Text>
          </Pressable>
        </View>
        <Text style={s.intervalTitle}>Coloca el intervalo</Text>
        <Pressable onPress={()=>setIntervalMenu(!intervalMenu)} style={s.select}>
          <Text style={s.selectText}>{intervalValue} {intervalUnit}</Text><Text style={s.selectArrow}>{intervalMenu?'▲':'▼'}</Text>
        </Pressable>
        {intervalMenu && <View style={s.menu}>
          <Pressable onPress={()=>{setIntervalUnit('seconds');setIntervalValue(Math.min(intervalValue,60));setIntervalMenu(false);}} style={s.menuItem}><Text style={s.menuText}>seconds</Text></Pressable>
          <Pressable onPress={()=>{setIntervalUnit('minutes');setIntervalValue(Math.min(Math.max(intervalValue,1),10));setIntervalMenu(false);}} style={s.menuItem}><Text style={s.menuText}>minutes</Text></Pressable>
        </View>}
        <View style={s.sliderRow}>
          <Text style={s.sliderMin}>{intervalUnit==='seconds'?'05S':'1M'}</Text>
          <View
            ref={sliderTrackRef}
            style={[s.sliderTrack,s.sliderEnabled]}
            onLayout={e=>{setSliderWidth(e.nativeEvent.layout.width);sliderTrackRef.current?.measureInWindow(x=>setSliderLeft(x));}}
            onStartShouldSetResponder={()=>true}
            onMoveShouldSetResponder={()=>true}
            onResponderGrant={e=>{swipeStart.current=null;setSliderFromLocation(e.nativeEvent.pageX,sliderWidth);}}
            onResponderMove={e=>setSliderFromLocation(e.nativeEvent.pageX,sliderWidth)}
          >
            <View style={s.sliderRail}/>
            <View style={[s.sliderFill,{width:sliderThumbPosition-9}]}/>
            <View style={[s.sliderThumb,{left:sliderThumbPosition}]}/>
          </View>
          <Text style={s.sliderMax}>{intervalUnit==='seconds'?'60S':'10M'}</Text>
        </View>
        <Text style={s.intervalValue}>Seleccionado: {intervalLabel} · {autoRefresh?'activo':'desactivado'}</Text>
      </View>
      <Pressable disabled={savingInterval} onPress={saveSelectedInterval} style={[s.saveIntervalButton,savingInterval&&s.disabled]}>
        {savingInterval?<ActivityIndicator/>:<Text style={s.saveIntervalText}>GUARDAR INTERVALO</Text>}
      </Pressable>

      <Text style={s.meta}>ÚLTIMA ACTUALIZACIÓN</Text><Text style={s.time}>{dateText(last)}</Text>
      <Text style={autoRefresh?s.onlineText:s.offlineText}>{autoRefresh?'SINCRONIZACIÓN AUTOMÁTICA ACTIVADA':'SINCRONIZACIÓN AUTOMÁTICA DETENIDA'}</Text>
      <Text style={status==='online'?s.onlineText:s.offlineText}>Estado: {status}</Text>
    </ScrollView>  : screen==='positions' ? <ScrollView contentContainerStyle={s.content} onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
      <Text style={s.h1}>POSICIONES</Text><Text style={s.sub}>Ejecutá órdenes a mercado o límite con instrumentos habilitados para tu cuenta Exness.</Text>
      <View style={s.card}>
        <Text style={s.label}>CATEGORÍA DE INSTRUMENTOS</Text>
        <Pressable onPress={()=>{setInstrumentCategoryMenu(v=>!v);setInstrumentMenuOpen(false);}} style={s.select}><Text style={s.selectText}>{positionCategory}</Text><Text style={s.selectArrow}>{instrumentCategoryMenu?'▲':'▼'}</Text></Pressable>
        {instrumentCategoryMenu&&<View style={s.menu}>{(['Crypto','Forex','Favorites'] as const).map(category=><Pressable key={category} onPress={()=>setPositionCategoryAndClear(category)} style={s.menuItem}><Text style={s.menuText}>{category}</Text></Pressable>)}</View>}
        <Pressable disabled={instrumentLoading||!instrumentList.length} onPress={()=>{setInstrumentMenuOpen(v=>!v);setInstrumentCategoryMenu(false);}} style={[s.select,(instrumentLoading||!instrumentList.length)&&s.disabled]}><Text style={s.selectText}>{instrumentLoading?'CARGANDO INSTRUMENTOS...':selectedInstrument||'SELECCIONAR PAR'}</Text><Text style={s.selectArrow}>{instrumentMenuOpen?'▲':'▼'}</Text></Pressable>
        {instrumentMenuOpen&&<View style={s.menu}>{filteredPositionInstruments.length?filteredPositionInstruments.map(symbol=><Pressable key={symbol} onPress={()=>{setSelectedInstrument(symbol);setInstrumentMenuOpen(false);setTick(null);}} style={s.menuItem}><View style={s.instrumentOption}><PairIdentity instrument={symbol}/><Text style={s.menuText}>›</Text></View></Pressable>):<Text style={s.menuEmpty}>No hay instrumentos de esta categoría disponibles para esta cuenta Exness.</Text>}</View>}
        {instrumentError!==''&&<Text style={s.offlineText}>{instrumentError}</Text>}
        <View style={s.quoteCard}>
          <View style={s.selectedPairHeader}>
            <PairIdentity instrument={selectedInstrument||'—'}/>
            {selectedInstrument&&<View style={s.selectedPairActions}>
              <Pressable onPress={()=>toggleFavorite(selectedInstrument)} style={s.iconButton}><Text style={s.favoriteIcon}>{favoriteInstruments.includes(selectedInstrument)?'★':'☆'}</Text></Pressable>
              <Pressable onPress={()=>setSelectedInstrument('')} style={s.iconButton}><Text style={s.removePairIcon}>×</Text></Pressable>
            </View>}
          </View>
          <Info label="PRECIO ACTUAL" value={tick?((tick.bid+tick.ask)/2).toFixed(instrumentConditions?.point_digits??5):'Esperando cotización...'}/>
          <View style={s.quoteRow}><View style={s.quoteSide}><Text style={s.infoLabel}>BID</Text><Text style={s.bidText}>{tick?tick.bid.toFixed(instrumentConditions?.point_digits??5):'—'}</Text></View><View style={s.quoteSide}><Text style={s.infoLabel}>ASK</Text><Text style={s.askText}>{tick?tick.ask.toFixed(instrumentConditions?.point_digits??5):'—'}</Text></View></View>
          <Info label="SPREAD" value={tick?(tick.ask-tick.bid).toFixed(instrumentConditions?.point_digits??5):'—'}/>
        </View>
      </View>
      <View style={s.orderTabs}>
        <Pressable onPress={()=>setOrderPanel('market')} style={[s.orderTab,orderPanel==='market'&&s.orderTabSelected]}><Text style={[s.orderTabText,orderPanel==='market'&&s.orderTabTextSelected]}>MARKET ORDER</Text></Pressable>
        <Pressable onPress={()=>setOrderPanel('limit')} style={[s.orderTab,orderPanel==='limit'&&s.orderTabSelected]}><Text style={[s.orderTabText,orderPanel==='limit'&&s.orderTabTextSelected]}>LIMIT ORDER</Text></Pressable>
      </View>
      {orderPanel==='market'?      <View style={s.card}>
        <Text style={s.orderTitle}>MARKET ORDER</Text><Text style={s.label}>VOLUMEN (LOTES) · {marketVolume}</Text>
        <View ref={marketVolumeSliderRef} style={s.volumeSliderTrack} onLayout={e=>{setMarketVolumeSliderWidth(e.nativeEvent.layout.width);marketVolumeSliderRef.current?.measureInWindow(x=>setMarketVolumeSliderLeft(x));}} onStartShouldSetResponder={()=>true} onMoveShouldSetResponder={()=>true} onResponderGrant={e=>setVolumeFromLocation(e.nativeEvent.pageX,marketVolumeSliderWidth,marketVolumeSliderLeft,setMarketVolume)} onResponderMove={e=>setVolumeFromLocation(e.nativeEvent.pageX,marketVolumeSliderWidth,marketVolumeSliderLeft,setMarketVolume)}>
          <View style={s.sliderRail}/><View style={[s.sliderFill,{width:volumeThumbPosition(marketVolume,marketVolumeSliderWidth)-9}]}/><View style={[s.sliderThumb,{left:volumeThumbPosition(marketVolume,marketVolumeSliderWidth)}]}/>
        </View><View style={s.volumeScale}><Text style={s.sliderMin}>0.01</Text><Text style={s.sliderMax}>1.00</Text></View>
        <View style={s.directionRow}><Pressable onPress={()=>setMarketDirection('buy')} style={[s.directionButton,marketDirection==='buy'&&s.buySelected]}><Text style={s.buyText}>BUY / LONG</Text></Pressable><Pressable onPress={()=>setMarketDirection('sell')} style={[s.directionButton,marketDirection==='sell'&&s.sellSelected]}><Text style={s.sellText}>SELL / SHORT</Text></Pressable></View>
        <Text style={s.buyText}>TAKE PROFIT</Text><TextInput value={marketTakeProfit} onChangeText={setMarketTakeProfit} keyboardType="decimal-pad" placeholder="Precio TP (opcional)" placeholderTextColor="#707988" style={s.orderInput}/>
        <Text style={s.sellText}>STOP LOSS</Text><TextInput value={marketStopLoss} onChangeText={setMarketStopLoss} keyboardType="decimal-pad" placeholder="Precio SL (opcional)" placeholderTextColor="#707988" style={s.orderInput}/>
        <Pressable disabled={positionSubmitting||!tick||tickStatus!=='online'} onPress={()=>void submitMarketOrder()} style={[s.marketButton,(positionSubmitting||!tick||tickStatus!=='online')&&s.disabled]}>{positionSubmitting?<ActivityIndicator color="#fff"/>:<Text style={s.marketButtonText}>ABRIR MARKET ORDER</Text>}</Pressable>
      </View>
:      <View style={s.card}>
        <Text style={s.orderTitle}>LIMIT ORDER</Text><Text style={s.label}>ENTRY PRICE</Text><TextInput value={limitEntryPrice} onChangeText={setLimitEntryPrice} keyboardType="decimal-pad" placeholder="Precio de entrada" placeholderTextColor="#707988" style={s.orderInput}/>
        <Text style={s.label}>VOLUMEN (LOTES) · {limitVolume}</Text>
        <View ref={limitVolumeSliderRef} style={s.volumeSliderTrack} onLayout={e=>{setLimitVolumeSliderWidth(e.nativeEvent.layout.width);limitVolumeSliderRef.current?.measureInWindow(x=>setLimitVolumeSliderLeft(x));}} onStartShouldSetResponder={()=>true} onMoveShouldSetResponder={()=>true} onResponderGrant={e=>setVolumeFromLocation(e.nativeEvent.pageX,limitVolumeSliderWidth,limitVolumeSliderLeft,setLimitVolume)} onResponderMove={e=>setVolumeFromLocation(e.nativeEvent.pageX,limitVolumeSliderWidth,limitVolumeSliderLeft,setLimitVolume)}>
          <View style={s.sliderRail}/><View style={[s.sliderFill,{width:volumeThumbPosition(limitVolume,limitVolumeSliderWidth)-9}]}/><View style={[s.sliderThumb,{left:volumeThumbPosition(limitVolume,limitVolumeSliderWidth)}]}/>
        </View><View style={s.volumeScale}><Text style={s.sliderMin}>0.01</Text><Text style={s.sliderMax}>1.00</Text></View>
        <View style={s.directionRow}><Pressable onPress={()=>setLimitDirection('buy')} style={[s.directionButton,limitDirection==='buy'&&s.buySelected]}><Text style={s.buyText}>BUY / LONG</Text></Pressable><Pressable onPress={()=>setLimitDirection('sell')} style={[s.directionButton,limitDirection==='sell'&&s.sellSelected]}><Text style={s.sellText}>SELL / SHORT</Text></Pressable></View>
        <Text style={s.buyText}>TAKE PROFIT</Text><TextInput value={limitTakeProfit} onChangeText={setLimitTakeProfit} keyboardType="decimal-pad" placeholder="Precio TP (opcional)" placeholderTextColor="#707988" style={s.orderInput}/>
        <Text style={s.sellText}>STOP LOSS</Text><TextInput value={limitStopLoss} onChangeText={setLimitStopLoss} keyboardType="decimal-pad" placeholder="Precio SL (opcional)" placeholderTextColor="#707988" style={s.orderInput}/>
        <Pressable disabled={positionSubmitting} onPress={()=>void submitLimitOrder()} style={[s.limitButton,positionSubmitting&&s.disabled]}>{positionSubmitting?<ActivityIndicator color="#0b0e13"/>:<Text style={s.limitButtonText}>ABRIR LIMIT ORDER</Text>}</Pressable>
      </View>
}    </ScrollView> : screen==='history' ? <ScrollView contentContainerStyle={s.content} onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
      <Text style={s.h1}>HISTORIAL</Text><Text style={s.sub}>Consultá las posiciones activas, órdenes pendientes y operaciones pasadas de tu cuenta.</Text>
      <Text style={s.label}>SELECCIONE SU PAR</Text>
      <Pressable disabled={!historyData||historyLoading} onPress={()=>setHistoryMenuOpen(!historyMenuOpen)} style={[s.select,(!historyData||historyLoading)&&s.disabled]}><Text style={s.selectText}>{historyPair==='*'?'MOSTRAR TODO':historyPair||'MOSTRAR TODO'}</Text><Text style={s.selectArrow}>{historyMenuOpen?'▲':'▼'}</Text></Pressable>
      {historyMenuOpen&&<View style={s.menu}>
        <Pressable onPress={()=>{setHistoryPair('*');setHistoryMenuOpen(false);}} style={s.menuItem}><Text style={s.menuText}>MOSTRAR TODO</Text></Pressable>
        {historySymbols.length===0?<Text style={s.menuEmpty}>Buscando pares disponibles...</Text>:historySymbols.map(symbol=><Pressable key={symbol} onPress={()=>{setHistoryPair(symbol);setHistoryMenuOpen(false);}} style={s.menuItem}><Text style={s.menuText}>{symbol}</Text></Pressable>)}
      </View>}
      <View style={s.historyModes}>
        <Pressable onPress={()=>{setHistoryMode('active');setHistoryError('');setHistoryMenuOpen(false);}} style={[s.historyMode,historyMode==='active'&&s.historyModeSelected]}><Text style={[s.historyModeText,historyMode==='active'&&s.historyModeTextSelected]}>ACTIVAS</Text></Pressable>
        <Pressable onPress={()=>{setHistoryMode('past');setHistoryError('');setHistoryMenuOpen(false);}} style={[s.historyMode,historyMode==='past'&&s.historyModeSelected]}><Text style={[s.historyModeText,historyMode==='past'&&s.historyModeTextSelected]}>PASADAS</Text></Pressable>
      </View>
      <Pressable disabled={historyLoading} onPress={()=>void loadHistory(historyMode)} style={[s.refresh,historyLoading&&s.disabled]}>{historyLoading?<ActivityIndicator/>:<Text style={s.refreshText}>↻  ACTUALIZAR HISTORIAL</Text>}</Pressable>
      <View style={s.intervalCard}>
        <View style={s.intervalHeader}><Text style={s.meta}>AUTORREFRESCO</Text><Pressable onPress={()=>{const next=!historyAutoRefresh;historyAutoRefreshRef.current=next;setHistoryAutoRefresh(next);}} style={s.clockButton}><Text style={historyAutoRefresh?s.clockOn:s.clockOff}>{historyAutoRefresh?'◷':'✕'}</Text></Pressable></View>
        <Text style={s.intervalTitle}>Coloca el intervalo</Text>
        <Pressable onPress={()=>setHistoryIntervalMenu(!historyIntervalMenu)} style={s.select}><Text style={s.selectText}>{historyIntervalValue} {historyIntervalUnit}</Text><Text style={s.selectArrow}>{historyIntervalMenu?'▲':'▼'}</Text></Pressable>
        {historyIntervalMenu&&<View style={s.menu}>
          <Pressable onPress={()=>{setHistoryIntervalUnit('seconds');setHistoryIntervalValue(Math.min(historyIntervalValue,60));setHistoryIntervalMenu(false);}} style={s.menuItem}><Text style={s.menuText}>seconds</Text></Pressable>
          <Pressable onPress={()=>{setHistoryIntervalUnit('minutes');setHistoryIntervalValue(Math.min(Math.max(historyIntervalValue,1),10));setHistoryIntervalMenu(false);}} style={s.menuItem}><Text style={s.menuText}>minutes</Text></Pressable>
        </View>}
        <View style={s.sliderRow}><Text style={s.sliderMin}>{historyIntervalUnit==='seconds'?'05S':'1M'}</Text>
          <View ref={historySliderTrackRef} style={[s.sliderTrack,s.sliderEnabled]}
            onLayout={e=>{setHistorySliderWidth(e.nativeEvent.layout.width);historySliderTrackRef.current?.measureInWindow(x=>setHistorySliderLeft(x));}}
            onStartShouldSetResponder={()=>true} onMoveShouldSetResponder={()=>true}
            onResponderGrant={e=>{swipeStart.current=null;setHistorySliderFromLocation(e.nativeEvent.pageX,historySliderWidth);}} onResponderMove={e=>setHistorySliderFromLocation(e.nativeEvent.pageX,historySliderWidth)}>
            <View style={s.sliderRail}/><View style={[s.sliderFill,{width:historySliderThumbPosition-9}]}/><View style={[s.sliderThumb,{left:historySliderThumbPosition}]}/>
          </View><Text style={s.sliderMax}>{historyIntervalUnit==='seconds'?'60S':'10M'}</Text>
        </View>
        <Text style={s.intervalValue}>Seleccionado: {historyIntervalLabel} · {historyAutoRefresh?'activo':'desactivado'}</Text>
      </View>
      <Pressable disabled={historySavingInterval} onPress={saveHistoryInterval} style={[s.saveIntervalButton,historySavingInterval&&s.disabled]}>{historySavingInterval?<ActivityIndicator/>:<Text style={s.saveIntervalText}>GUARDAR INTERVALO</Text>}</Pressable>
      <Text style={historyAutoRefresh?historyStatus==='online'?s.onlineText:s.offlineText:s.offlineText}>{historyAutoRefresh?'SINCRONIZACIÓN AUTOMÁTICA ACTIVADA':'SINCRONIZACIÓN AUTOMÁTICA DETENIDA'}</Text>
      <Text style={s.meta}>ÚLTIMA ACTUALIZACIÓN</Text><Text style={s.time}>{dateText(historyLastSync)}</Text>
      <Text style={historyStatus==='online'?s.onlineText:s.offlineText}>Estado: {historyStatus}</Text>
      {historyLoading&&<ActivityIndicator color="#fff"/>}{!!historyError&&<Text style={s.offlineText}>{historyError}</Text>}
      {!historyLoading&&!historyError&&(!historyData||!historyPair)&&<Text style={s.emptyHistory}>Seleccioná un par o MOSTRAR TODO para visualizar las órdenes.</Text>}
      {!!historyData&&!!historyPair&&historyMode==='active'&&<>
        <Pressable onPress={()=>setPositionsExpanded(v=>!v)} style={s.historySectionToggle}><Text style={s.historySection}>POSICIONES ABIERTAS ({selectedActivePositions.length})</Text><Text style={s.sectionChevron}>{positionsExpanded?'⌄':'›'}</Text></Pressable>
        {positionsExpanded&&(selectedActivePositions.length===0?<Text style={s.emptyHistory}>No hay posiciones abiertas para este par.</Text>:selectedActivePositions.map((item,index)=>{
          const buy=String(item.direction??'').toLowerCase()==='buy'; const sltp=historyData.activeOrders.find(o=>String(o.position_id??'')===String(item.position_id??'')&&String(o.order_type??'').toLowerCase()==='sltp');
          return <View key={String(item.position_id??index)} style={s.historyCard}>
            <View style={s.historyCardHeader}><PairIdentity instrument={historyValue(item,'instrument','')}/><Text style={buy?s.pnlPositive:s.pnlNegative}>{buy?'BUY':'SELL'}</Text></View>
            <Info label="ID POSICIÓN" value={historyValue(item,'position_id')}/><Info label="VOLUMEN" value={historyValue(item,'volume')}/><Info label="PRECIO DE APERTURA" value={historyValue(item,'open_price')}/><Info label="ESTADO" value={historyValue(item,'state')}/>
            <View style={s.editableRow}><Text style={s.infoLabel}>STOP LOSS</Text><View style={s.editableValue}><Text style={s.infoValue}>{configuredPrice(sltp,'stop_loss_price')}</Text><Pressable onPress={()=>beginEdit('position',String(sltp?.order_id??''),'stop_loss_price',configuredPrice(sltp,'stop_loss_price'),String(item.instrument??''),'take_profit_price',configuredPrice(sltp,'take_profit_price'),String(item.position_id??''),Number(item.open_price??0))}><Text style={s.pencil}>✎</Text></Pressable></View></View>
            <View style={s.editableRow}><Text style={s.infoLabel}>TAKE PROFIT</Text><View style={s.editableValue}><Text style={s.infoValue}>{configuredPrice(sltp,'take_profit_price')}</Text><Pressable onPress={()=>beginEdit('position',String(sltp?.order_id??''),'take_profit_price',configuredPrice(sltp,'take_profit_price'),String(item.instrument??''),'stop_loss_price',configuredPrice(sltp,'stop_loss_price'),String(item.position_id??''),Number(item.open_price??0))}><Text style={s.pencil}>✎</Text></Pressable></View></View>
            <Info label="APERTURA" value={historyDate(item,'create_time')}/>
            <View style={s.cardActionRow}><Pressable onPress={()=>beginClose('position',String(item.position_id??''),String(item.instrument??''),null)} style={s.closeButton}><Text style={s.closeButtonText}>✕</Text></Pressable></View>
          </View>;
        }))}
        <Pressable onPress={()=>setPendingExpanded(v=>!v)} style={s.historySectionToggle}><Text style={s.historySection}>ÓRDENES PENDIENTES ({selectedActiveOrders.length})</Text><Text style={s.sectionChevron}>{pendingExpanded?'⌄':'›'}</Text></Pressable>
        {pendingExpanded&&(selectedActiveOrders.length===0?<Text style={s.emptyHistory}>No hay órdenes pendientes para este par.</Text>:selectedActiveOrders.map((item,index)=><View key={String(item.order_id??index)} style={s.historyCard}>
          <View style={s.historyCardHeader}><PairIdentity instrument={historyValue(item,'instrument','')}/><Text style={s.pendingText}>PENDIENTE</Text></View>
          <Info label="ID ORDEN" value={historyValue(item,'order_id')}/><Info label="TIPO" value={historyValue(item,'order_type')}/><Info label="DIRECCIÓN" value={historyValue(item,'direction')}/><Info label="VOLUMEN" value={historyValue(item,'volume')}/><View style={s.editableRow}><Text style={s.infoLabel}>PRECIO DE ENTRADA</Text><View style={s.editableValue}><Text style={s.infoValue}>{historyValue(item,'price')}</Text><Pressable onPress={()=>beginEdit('order',String(item.order_id??''),'price',historyValue(item,'price'),String(item.instrument??''))}><Text style={s.pencil}>✎</Text></Pressable></View></View>
          <View style={s.editableRow}><Text style={s.infoLabel}>STOP LOSS</Text><View style={s.editableValue}><Text style={s.infoValue}>{configuredPrice(item,'stop_loss_price')}</Text><Pressable onPress={()=>beginEdit('order',String(item.order_id??''),'stop_loss_price',historyValue(item,'stop_loss_price'),String(item.instrument??''),'take_profit_price',historyValue(item,'take_profit_price'))}><Text style={s.pencil}>✎</Text></Pressable></View></View>
          <View style={s.editableRow}><Text style={s.infoLabel}>TAKE PROFIT</Text><View style={s.editableValue}><Text style={s.infoValue}>{configuredPrice(item,'take_profit_price')}</Text><Pressable onPress={()=>beginEdit('order',String(item.order_id??''),'take_profit_price',historyValue(item,'take_profit_price'),String(item.instrument??''),'stop_loss_price',historyValue(item,'stop_loss_price'))}><Text style={s.pencil}>✎</Text></Pressable></View></View>
          <Info label="CREADA" value={historyDate(item,'create_time')}/>
          <View style={s.cardActionRow}><Pressable onPress={()=>beginClose('order',String(item.order_id??''),String(item.instrument??''),null)} style={s.closeButton}><Text style={s.closeButtonText}>✕</Text></Pressable></View>
        </View>))}
      </>}
      {!!historyData&&!!historyPair&&historyMode==='past'&&<>
        <Text style={s.historySection}>ÓRDENES FINALIZADAS ({selectedPastOrders.length})</Text>
        {selectedPastOrders.length===0?<Text style={s.emptyHistory}>No hay órdenes pasadas para este par en el período permitido por Exness.</Text>:<>
          <Pressable onPress={()=>setBuyOrdersExpanded(v=>!v)} style={s.historySectionToggle}><Text style={s.historySection}>ÓRDENES BUY ({pastOrderGroups.buy.length})</Text><Text style={s.sectionChevron}>{buyOrdersExpanded?'⌄':'›'}</Text></Pressable>
          {buyOrdersExpanded&&(pastOrderGroups.buy.length?pastOrderGroups.buy.slice().reverse().map(renderPastOrderCard):<Text style={s.emptyHistory}>No hay órdenes BUY finalizadas.</Text>)}
          <Pressable onPress={()=>setSellOrdersExpanded(v=>!v)} style={s.historySectionToggle}><Text style={s.historySection}>ÓRDENES SELL ({pastOrderGroups.sell.length})</Text><Text style={s.sectionChevron}>{sellOrdersExpanded?'⌄':'›'}</Text></Pressable>
          {sellOrdersExpanded&&(pastOrderGroups.sell.length?pastOrderGroups.sell.slice().reverse().map(renderPastOrderCard):<Text style={s.emptyHistory}>No hay órdenes SELL finalizadas.</Text>)}
          <Pressable onPress={()=>setCancelledOrdersExpanded(v=>!v)} style={s.historySectionToggle}><Text style={s.historySection}>ÓRDENES CANCELADAS ({pastOrderGroups.cancelled.length})</Text><Text style={s.sectionChevron}>{cancelledOrdersExpanded?'⌄':'›'}</Text></Pressable>
          {cancelledOrdersExpanded&&(pastOrderGroups.cancelled.length?pastOrderGroups.cancelled.slice().reverse().map(renderPastOrderCard):<Text style={s.emptyHistory}>No hay órdenes canceladas.</Text>)}
        </>}
      </>}
    </ScrollView> : <ScrollView contentContainerStyle={s.content} onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
      <Text style={s.h1}>APP</Text>
      <View style={s.card}>
        <Info label="NOMBRE DE APP" value={BUILD_INFO.appName}/>
        <Info label="NOMBRE DE PAQUETE" value={BUILD_INFO.packageName}/>
        <Info label="FIRMA DE APP" value={BUILD_INFO.signature}/>
        <Info label="VERSION ACTUAL" value={`V${BUILD_INFO.build}`}/>
        <Info label="ULTIMA VERSION" value={latestVersion || 'No comprobada'}/>
      </View>
      <Pressable disabled={checkingUpdate||downloadingUpdate} onPress={latestBuild!==null && latestBuild>Number(BUILD_INFO.build) ? updateApp : checkUpdate} style={[s.button,(checkingUpdate||downloadingUpdate)&&s.disabled]}>
        {checkingUpdate||downloadingUpdate ? <ActivityIndicator/> : <Text style={s.buttonText}>{downloadingUpdate ? 'DESCARGANDO APK...' : latestBuild!==null && latestBuild>Number(BUILD_INFO.build) ? 'ACTUALIZAR APP' : 'BUSCAR ACTUALIZACIÓN'}</Text>}
      </Pressable>
      <Pressable onPress={()=>Linking.openURL(RELEASES_URL)} style={s.githubButton}>
        <Image source={{uri:'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png'}} style={s.githubLogo}/>
        <Text style={s.githubText}>GITHUB</Text>
        <Text style={s.githubVersion}>V{BUILD_INFO.build}</Text>
      </Pressable>
      <Text style={s.meta}>REGISTRO DE CAMBIOS</Text>
      <View style={s.buildHistory}>
        {buildRunsLoading?<View style={{alignItems:'center',paddingVertical:18,gap:8}}><ActivityIndicator color="#fff"/><Text style={s.buildDescription}>CARGANDO HISTORIAL DE BUILDS...</Text></View>:<>
          {buildRuns.map(run=><View key={run.run_number} style={s.buildCard}>
            <Text style={run.conclusion==='success'?s.buildSuccess:run.conclusion==='failure'||run.conclusion==='timed_out'?s.buildFailure:s.buildPending}>#V{run.run_number}</Text>
            <Text style={s.buildDescription}>{run.display_title}</Text>
          </View>)}
          <View style={s.buildCard}>
            <Text style={s.buildPending}>#V0</Text>
            <Text style={s.buildDescription}>Initial Android foundation: Connection and Profile screens.</Text>
          </View>
        </>}
      </View>
    </ScrollView>}
  {renderTradeModals()}
  </SafeAreaView>;
}

function Info({label,value,valueStyle}:{label:string,value:string,valueStyle?:TextStyle}) {
  return <View style={s.info}><Text style={s.infoLabel}>{label}</Text><Text style={[s.infoValue,valueStyle]}>{value}</Text></View>;
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:'#0b0e13'},header:{height:68,paddingHorizontal:20,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'#252b35'},
 title:{color:'#fff',fontSize:18,fontWeight:'800'},dot:{width:12,height:12,borderRadius:6},green:{backgroundColor:'#28d17c'},yellow:{backgroundColor:'#f0b429'},red:{backgroundColor:'#e05252'},
 tabs:{flexDirection:'row',borderBottomWidth:1,borderBottomColor:'#252b35'},tab:{flex:1,paddingHorizontal:3,paddingVertical:12,alignItems:'center',justifyContent:'center',minWidth:0},active:{borderBottomWidth:2,borderBottomColor:'#fff'},tabText:{color:'#dce1e9',fontWeight:'800',fontSize:11,letterSpacing:-0.2,includeFontPadding:false,textAlign:'center'},
 content:{padding:22,gap:15},h1:{color:'#fff',fontSize:26,fontWeight:'900'},sub:{color:'#9da6b5',lineHeight:21},field:{gap:7},label:{color:'#c8ced8',fontSize:12,fontWeight:'800'},
 row:{flexDirection:'row',backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:10},input:{flex:1,color:'#fff',padding:13,minHeight:48},eye:{width:48,alignItems:'center',justifyContent:'center'},
 button:{minHeight:50,borderRadius:10,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},buttonText:{color:'#0b0e13',fontWeight:'900'},disabled:{opacity:.5},
 onlineText:{color:'#28d17c',textAlign:'center',fontWeight:'800'},offlineText:{color:'#e05252',textAlign:'center',fontWeight:'800'},
 card:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:14,padding:17,gap:17},info:{gap:5},infoLabel:{color:'#8f98a8',fontSize:11,fontWeight:'900'},infoValue:{color:'#fff',fontSize:15,fontWeight:'600'},pnlPositive:{color:'#28d17c',fontWeight:'900'},pnlNegative:{color:'#e05252',fontWeight:'900'},pnlZero:{color:'#f0a52b',fontWeight:'900'},
 refresh:{minHeight:48,borderRadius:10,borderWidth:1,borderColor:'#3b4350',alignItems:'center',justifyContent:'center'},refreshText:{color:'#fff',fontWeight:'900'},
 meta:{color:'#8f98a8',fontSize:11,fontWeight:'900'},time:{color:'#fff',fontWeight:'600',marginTop:-9},ap:{color:'#707988',fontSize:11},
 githubButton:{minHeight:54,borderRadius:12,borderWidth:1,borderColor:'#3b4350',paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:12},githubLogo:{width:24,height:24},githubText:{color:'#fff',fontWeight:'900',flex:1},githubVersion:{color:'#9da6b5',fontWeight:'800'},change:{color:'#dce1e9',fontSize:13,lineHeight:20},buildHistory:{width:'100%',gap:9},buildCard:{width:'100%',minWidth:0,flexDirection:'row',alignItems:'flex-start',gap:10,backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:12,padding:13},buildDescription:{flex:1,minWidth:0,flexShrink:1,color:'#dce1e9',fontSize:13,lineHeight:19},buildSuccess:{color:'#28d17c',fontSize:13,fontWeight:'900',minWidth:58},buildFailure:{color:'#e05252',fontSize:13,fontWeight:'900',minWidth:58},buildPending:{color:'#9da6b5',fontSize:13,fontWeight:'900',minWidth:58},
 saveIntervalButton:{minHeight:46,borderRadius:10,borderWidth:1,borderColor:'#3b4350',alignItems:'center',justifyContent:'center',backgroundColor:'#151a22'},saveIntervalText:{color:'#fff',fontWeight:'900',fontSize:12},
 intervalCard:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:14,padding:17,gap:12},intervalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},clockButton:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center'},clockOn:{color:'#28d17c',fontSize:25,fontWeight:'900'},clockOff:{color:'#e05252',fontSize:22,fontWeight:'900'},intervalTitle:{color:'#fff',fontSize:14,fontWeight:'800'},select:{minHeight:44,borderWidth:1,borderColor:'#3b4350',borderRadius:9,paddingHorizontal:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#0f131a'},selectText:{color:'#fff',fontWeight:'700'},selectArrow:{color:'#9da6b5',fontSize:12},menu:{borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',overflow:'hidden'},menuItem:{paddingHorizontal:13,paddingVertical:12},menuText:{color:'#fff',fontWeight:'700'},sliderRow:{flexDirection:'row',alignItems:'center',gap:8},sliderMin:{color:'#9da6b5',fontSize:11,fontWeight:'800'},sliderMax:{color:'#9da6b5',fontSize:11,fontWeight:'800'},sliderTrack:{flex:1,height:32,borderRadius:16,backgroundColor:'transparent',position:'relative',justifyContent:'center'},sliderEnabled:{opacity:1},sliderDisabled:{opacity:0.4},sliderRail:{position:'absolute',left:9,right:9,top:13,height:6,borderRadius:3,backgroundColor:'#303744'},sliderFill:{position:'absolute',left:9,top:13,height:6,borderRadius:3,backgroundColor:'#fff'},sliderThumb:{position:'absolute',top:7,width:18,height:18,borderRadius:9,backgroundColor:'#fff',marginLeft:-9},intervalValue:{color:'#9da6b5',fontSize:11,fontWeight:'700'},
  modalBackdrop:{position:'absolute',top:0,left:0,right:0,bottom:0,zIndex:100,backgroundColor:'rgba(0,0,0,0.72)',alignItems:'center',justifyContent:'center',padding:22},modalCard:{width:'100%',backgroundColor:'#151a22',borderWidth:1,borderColor:'#3b4350',borderRadius:15,padding:18,gap:12},modalTitle:{color:'#fff',fontSize:18,fontWeight:'900'},modalSub:{color:'#9da6b5',lineHeight:20},modalLabel:{color:'#8f98a8',fontSize:11,fontWeight:'900'},modalBig:{color:'#fff',fontSize:16,fontWeight:'900'},modalInput:{color:'#fff',backgroundColor:'#0f131a',borderWidth:1,borderColor:'#3b4350',borderRadius:9,padding:13,fontSize:16},modalButtons:{flexDirection:'row',gap:10,marginTop:5},modalCancel:{flex:1,minHeight:46,borderRadius:9,borderWidth:1,borderColor:'#3b4350',alignItems:'center',justifyContent:'center'},modalCancelText:{color:'#dce1e9',fontWeight:'900'},modalConfirm:{flex:1,minHeight:46,borderRadius:9,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},modalConfirmText:{color:'#0b0e13',fontWeight:'900'},editableRow:{gap:5},editableValue:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},pencil:{color:'#fff',fontSize:19,fontWeight:'900',paddingHorizontal:8},cardActionRow:{alignItems:'flex-end',marginTop:2},closeButton:{width:34,height:34,borderRadius:17,borderWidth:1,borderColor:'#3b4350',alignItems:'center',justifyContent:'center'},closeButtonText:{color:'#e05252',fontSize:16,fontWeight:'900'},
  selectedPairHeader:{flexDirection:'row',alignItems:'center',gap:8},selectedPairActions:{flexDirection:'row',alignItems:'center',gap:6},iconButton:{width:34,height:34,borderRadius:9,borderWidth:1,borderColor:'#303744',backgroundColor:'#151a22',alignItems:'center',justifyContent:'center'},favoriteIcon:{color:'#f0b429',fontSize:22,fontWeight:'900'},removePairIcon:{color:'#e05252',fontSize:25,fontWeight:'700',lineHeight:25},volumeSliderTrack:{height:34,borderRadius:17,backgroundColor:'transparent',position:'relative',justifyContent:'center'},volumeScale:{flexDirection:'row',justifyContent:'space-between'},
  orderTabs:{flexDirection:'row',backgroundColor:'#0f131a',borderRadius:12,borderWidth:1,borderColor:'#29303c',padding:4,marginBottom:10},orderTab:{flex:1,paddingVertical:11,alignItems:'center',borderRadius:9},orderTabSelected:{backgroundColor:'#222a38'},orderTabText:{color:'#8e97a8',fontWeight:'900',fontSize:12},orderTabTextSelected:{color:'#fff'},
quoteCard:{backgroundColor:'#0f131a',borderWidth:1,borderColor:'#303744',borderRadius:11,padding:13,gap:10},quoteRow:{flexDirection:'row',gap:12},quoteSide:{flex:1,gap:4},bidText:{color:'#28d17c',fontSize:19,fontWeight:'900'},askText:{color:'#e05252',fontSize:19,fontWeight:'900'},instrumentOption:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},orderTitle:{color:'#fff',fontSize:17,fontWeight:'900'},orderInput:{color:'#fff',backgroundColor:'#0f131a',borderWidth:1,borderColor:'#3b4350',borderRadius:9,padding:13,minHeight:48,fontSize:16},directionRow:{flexDirection:'row',gap:10},directionButton:{flex:1,minHeight:46,borderWidth:1,borderColor:'#3b4350',borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:'#0f131a'},buySelected:{borderColor:'#28d17c',backgroundColor:'#12271f'},sellSelected:{borderColor:'#e05252',backgroundColor:'#2b171a'},buyText:{color:'#28d17c',fontWeight:'900'},sellText:{color:'#e05252',fontWeight:'900'},marketButton:{minHeight:50,borderRadius:10,backgroundColor:'#16834e',alignItems:'center',justifyContent:'center'},marketButtonText:{color:'#fff',fontWeight:'900'},limitButton:{minHeight:50,borderRadius:10,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},limitButtonText:{color:'#0b0e13',fontWeight:'900'},historyModes:{flexDirection:'row',gap:10},historyMode:{flex:1,minHeight:48,borderWidth:1,borderColor:'#3b4350',borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:'#151a22'},historyModeSelected:{backgroundColor:'#fff',borderColor:'#fff'},historyModeText:{color:'#dce1e9',fontWeight:'900'},historyModeTextSelected:{color:'#0b0e13'},historySection:{color:'#fff',fontSize:13,fontWeight:'900',marginTop:5},historySectionToggle:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:4},sectionChevron:{color:'#fff',fontSize:25,fontWeight:'900',paddingHorizontal:8},historyCard:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:13,padding:15,gap:12},historyCardHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},historyPair:{color:'#fff',fontSize:17,fontWeight:'900'},pairIdentity:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:9},pairIcons:{flexDirection:'row',alignItems:'center',gap:5},pairIcon:{width:27,height:27,borderRadius:8,backgroundColor:'#0f131a',borderWidth:1,borderColor:'#303744',alignItems:'center',justifyContent:'center'},cryptoIcon:{backgroundColor:'#172033'},cryptoMark:{color:'#f4b942',fontSize:16,fontWeight:'900'},flagMark:{fontSize:17},pendingText:{color:'#f0b429',fontWeight:'900'},emptyHistory:{color:'#9da6b5',textAlign:'center',paddingVertical:18},menuEmpty:{color:'#9da6b5',padding:13}
});