import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import { connectToExness, getAccountSnapshot, getTradingHistory, openExnessAccountStream, type Credentials, type TradingHistoryData } from './src/exness';
import { loadCredentials, saveCredentials } from './src/storage';
import { BUILD_INFO } from './src/buildInfo';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as SecureStore from 'expo-secure-store';

const RELEASES_URL = 'https://github.com/Tinchodoko/tinchodoko-ai-assistant/releases';
const LATEST_RELEASE_API = 'https://api.github.com/repos/Tinchodoko/tinchodoko-ai-assistant/releases/latest';
const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/Tinchodoko/tinchodoko-ai-assistant/main/update.json';
type Screen = 'connection' | 'profile' | 'history' | 'app';

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
  const [streamStatus,setStreamStatus]=useState<'off'|'connecting'|'connected'|'disconnected'|'error'>('off');
  const [autoRefresh,setAutoRefresh]=useState(true);
  const autoRefreshRef=useRef(true);
  const [intervalUnit,setIntervalUnit]=useState<'seconds'|'minutes'>('seconds');
  const [intervalValue,setIntervalValue]=useState(5);
  const [intervalMenu,setIntervalMenu]=useState(false);
  const [sliderWidth,setSliderWidth]=useState(1);
  const [sliderLeft,setSliderLeft]=useState(0);
  const sliderTrackRef=useRef<View>(null);
  const [savingInterval,setSavingInterval]=useState(false);
  const [latestVersion,setLatestVersion]=useState<string|null>(null);
  const [latestBuild,setLatestBuild]=useState<number|null>(null);
  const [latestApkUrl,setLatestApkUrl]=useState<string|null>(null);
  const [checkingUpdate,setCheckingUpdate]=useState(false);
  const [historyData,setHistoryData]=useState<TradingHistoryData|null>(null);
  const [historyMode,setHistoryMode]=useState<'active'|'past'>('active');
  const [selectedHistoryPair,setSelectedHistoryPair]=useState('ALL');
  const [historyPairMenu,setHistoryPairMenu]=useState(false);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [historyError,setHistoryError]=useState('');
  const [downloadingUpdate,setDownloadingUpdate]=useState(false);
  const [historyData,setHistoryData]=useState<TradingHistoryData|null>(null);
  const [historyMode,setHistoryMode]=useState<'active'|'past'>('active');
  const [historyPair,setHistoryPair]=useState('');
  const [historyMenuOpen,setHistoryMenuOpen]=useState(false);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [historyError,setHistoryError]=useState('');

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
          }
        }
      } catch { /* Ignore invalid saved interval and keep 5 seconds. */ }
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
    const intervalMs = (intervalUnit==='seconds' ? intervalValue : intervalValue*60) * 1000;
    const timer = setInterval(()=>{ void refresh(true); }, intervalMs);
    return ()=>clearInterval(timer);
  },[accessPoint,autoRefresh,intervalUnit,intervalValue]);

  async function connect() {
    setBusy(true); setStatus('connecting');
    try {
      await saveCredentials(c);
      // CONNECT validates the signed Exness request and discovers the
      // account Access Point. Balance is not requested during connection.
      const r=await connectToExness(c);
      setBalance('—'); setEquity('—'); setUsedMargin('—'); setAccessPoint(r.accessPoint); setStatus('online');
      setLast(null); setScreen('profile');
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

  const activeHistoryItems: HistoryRecord[] = historyData ? [
    ...historyData.positions.map(record=>({record,kind:'POSICIÓN ACTIVA'})),
    ...historyData.activeOrders.map(record=>({record,kind:'ORDEN PENDIENTE'})),
  ] : [];
  const pastHistoryItems: HistoryRecord[] = historyData ? [
    ...historyData.pastOrders.map(record=>({record,kind:'ORDEN PASADA'})),
    ...historyData.deals.map(record=>({record,kind:'OPERACIÓN EJECUTADA'})),
  ] : [];
  const historyPairs = Array.from(new Set([
    ...(historyData?.positions ?? []), ...(historyData?.activeOrders ?? []),
    ...(historyData?.pastOrders ?? []), ...(historyData?.deals ?? []),
  ].map(historySymbol).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  const selectedHistoryItems = (historyMode==='active' ? activeHistoryItems : pastHistoryItems)
    .filter(item=>selectedHistoryPair==='ALL' || historySymbol(item.record)===selectedHistoryPair);

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


  async function loadHistory() {
    if (!accessPoint || !c.apiKey || !c.secret || !c.accountId) { setHistoryError('Primero conectá tu cuenta de Exness desde CONEXIÓN.'); return; }
    setHistoryLoading(true); setHistoryError('');
    try {
      const data=await getTradingHistory(c,accessPoint); setHistoryData(data);
      const symbols=Array.from(new Set([...data.positions.map(x=>String(x.instrument??'')),...data.activeOrders.map(x=>String(x.instrument??'')),...data.pastOrders.map(x=>{const o=x.order&&typeof x.order==='object'?x.order as Record<string,unknown>:x;return String(o.instrument??'');}),...data.deals.map(x=>{const d=x.deal&&typeof x.deal==='object'?x.deal as Record<string,unknown>:x;return String(d.instrument??'');})].filter(x=>x&&x!=='undefined')));
      setHistoryPair(current=>current&&symbols.includes(current)?current:symbols[0]||'');
    } catch(e) { setHistoryError(e instanceof Error?e.message:String(e)); } finally { setHistoryLoading(false); }
  }
  function openHistory() { setScreen('history'); if (!historyData&&!historyLoading) void loadHistory(); }
  function historyValue(item:Record<string,unknown>,key:string,fallback='—') { const value=item[key]; return value===undefined||value===null||value===''?fallback:String(value); }
  function historyDate(item:Record<string,unknown>,...keys:string[]) {
    for(const key of keys){const raw=item[key];if(typeof raw==='string'||typeof raw==='number'){const d=new Date(raw);if(!Number.isNaN(d.getTime()))return d.toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'});}}
    return 'Fecha no disponible';
  }
  const historySymbols=historyData?Array.from(new Set([...historyData.positions.map(x=>String(x.instrument??'')),...historyData.activeOrders.map(x=>String(x.instrument??'')),...historyData.pastOrders.map(x=>{const o=x.order&&typeof x.order==='object'?x.order as Record<string,unknown>:x;return String(o.instrument??'');}),...historyData.deals.map(x=>{const d=x.deal&&typeof x.deal==='object'?x.deal as Record<string,unknown>:x;return String(d.instrument??'');})].filter(x=>x&&x!=='undefined'))).sort():[];
  const selectedActivePositions=(historyData?.positions??[]).filter(x=>!historyPair||x.instrument===historyPair);
  const selectedActiveOrders=(historyData?.activeOrders??[]).filter(x=>!historyPair||x.instrument===historyPair);
  const selectedPastOrders=(historyData?.pastOrders??[]).filter(x=>{const o=x.order&&typeof x.order==='object'?x.order as Record<string,unknown>:x;return !historyPair||o.instrument===historyPair;});

  async function loadHistory() {
    if (!accessPoint) {
      setHistoryError('Conectá primero tu cuenta de Exness.');
      return;
    }
    if (historyLoading) return;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const data=await getTradingHistory(c,accessPoint);
      setHistoryData(data);
      if (selectedHistoryPair!=='ALL' && ![
        ...data.positions, ...data.activeOrders, ...data.pastOrders, ...data.deals,
      ].some(record=>historySymbol(record)===selectedHistoryPair)) setSelectedHistoryPair('ALL');
    } catch(e) {
      setHistoryError(e instanceof Error?e.message:String(e));
    } finally { setHistoryLoading(false); }
  }

  function openHistory() {
    setScreen('history');
    if (!historyData) void loadHistory();
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

  return <SafeAreaView style={s.safe}>
    <View style={s.header}><Text style={s.title}>Tinchodoko AI Assistant</Text><View style={[s.dot,status==='online'?s.green:status==='connecting'?s.yellow:s.red]}/></View>
    <View style={s.tabs}>
      <Pressable onPress={()=>setScreen('connection')} style={[s.tab,screen==='connection'&&s.active]}><Text style={s.tabText}>CONEXIÓN</Text></Pressable>
      <Pressable onPress={()=>setScreen('profile')} style={[s.tab,screen==='profile'&&s.active]}><Text style={s.tabText}>PROFILE</Text></Pressable>
      <Pressable onPress={openHistory} style={[s.tab,screen==='history'&&s.active]}><Text style={s.tabText}>HISTORIAL</Text></Pressable>
      <Pressable onPress={()=>setScreen('app')} style={[s.tab,screen==='app'&&s.active]}><Text style={s.tabText}>APP</Text></Pressable>
    </View>

    {screen==='connection' ? <ScrollView contentContainerStyle={s.content}>
      <Text style={s.h1}>Conexión</Text><Text style={s.sub}>Credenciales para conexión con Exness.</Text>
      {field('GATEWAY URL','gatewayUrl')}
      {field('API KEY','apiKey',true,apiVisible,()=>setApiVisible(!apiVisible))}
      {field('SECRET','secret',true,secretVisible,()=>setSecretVisible(!secretVisible))}
      {field('ACCOUNT','accountId')}
      <Pressable disabled={busy} onPress={connect} style={[s.button,busy&&s.disabled]}>{busy?<ActivityIndicator/>:<Text style={s.buttonText}>CONECTAR</Text>}</Pressable>
      <Text style={status==='online'?s.onlineText:s.offlineText}>Estado: {status}</Text>
    </ScrollView> : screen==='profile' ? <ScrollView contentContainerStyle={s.content}>
      <Text style={s.h1}>PROFILE</Text>
      <View style={s.card}>
        <Info label="APIKEY" value={c.apiKey?'••••••••••••':'—'}/>
        <Info label="SECRET" value={c.secret?'••••••••••••':'—'}/>
        <Info label="GATEWAY" value={c.gatewayUrl}/>
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
        <Pressable onPress={()=>setIntervalMenu(x=>!x)} style={s.select}>
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
            style={[s.sliderTrack,!autoRefresh?s.sliderEnabled:s.sliderDisabled]}
            onLayout={e=>{setSliderWidth(e.nativeEvent.layout.width);sliderTrackRef.current?.measureInWindow(x=>setSliderLeft(x));}}
            onStartShouldSetResponder={()=>!autoRefresh}
            onMoveShouldSetResponder={()=>!autoRefresh}
            onResponderGrant={e=>setSliderFromLocation(e.nativeEvent.pageX,sliderWidth)}
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
      <Text style={!autoRefresh?s.offlineText:streamStatus==='connected'?s.onlineText:s.offlineText}>Sincronización automática: {autoRefresh?streamStatus:'detenida'}</Text>
      <Text style={status==='online'?s.onlineText:s.offlineText}>Estado: {status}</Text>
      {!!accessPoint && <Text style={s.ap}>Access Point: {accessPoint}</Text>}
    </ScrollView> : screen==='history' ? <ScrollView contentContainerStyle={s.content}>
      <Text style={s.h1}>HISTORIAL</Text><Text style={s.sub}>Consultá las posiciones activas, órdenes pendientes y operaciones pasadas de tu cuenta.</Text>
      <Text style={s.label}>SELECCIONE SU PAR</Text>
      <Pressable onPress={()=>setHistoryMenuOpen(v=>!v)} style={s.select}><Text style={s.selectText}>{historyPair||'Seleccione un par'}</Text><Text style={s.selectArrow}>{historyMenuOpen?'▲':'▼'}</Text></Pressable>
      {historyMenuOpen&&<View style={s.menu}>{historySymbols.length===0?<Text style={s.menuEmpty}>No hay pares registrados.</Text>:historySymbols.map(symbol=><Pressable key={symbol} onPress={()=>{setHistoryPair(symbol);setHistoryMenuOpen(false);}} style={s.menuItem}><Text style={s.menuText}>{symbol}</Text></Pressable>)}</View>}
      <View style={s.historyModes}>
        <Pressable onPress={()=>setHistoryMode('active')} style={[s.historyMode,historyMode==='active'&&s.historyModeSelected]}><Text style={[s.historyModeText,historyMode==='active'&&s.historyModeTextSelected]}>ACTIVAS</Text></Pressable>
        <Pressable onPress={()=>setHistoryMode('past')} style={[s.historyMode,historyMode==='past'&&s.historyModeSelected]}><Text style={[s.historyModeText,historyMode==='past'&&s.historyModeTextSelected]}>PASADAS</Text></Pressable>
      </View>
      <Pressable disabled={historyLoading} onPress={loadHistory} style={[s.refresh,historyLoading&&s.disabled]}>{historyLoading?<ActivityIndicator/>:<Text style={s.refreshText}>↻  ACTUALIZAR HISTORIAL</Text>}</Pressable>
      {historyLoading&&<ActivityIndicator color="#fff"/>}{!!historyError&&<Text style={s.offlineText}>{historyError}</Text>}
      {!historyLoading&&!historyError&&!historyData&&<Text style={s.emptyHistory}>Conectá tu cuenta para consultar el historial.</Text>}
      {!!historyData&&historyMode==='active'&&<>
        <Text style={s.historySection}>POSICIONES ABIERTAS ({selectedActivePositions.length})</Text>
        {selectedActivePositions.length===0?<Text style={s.emptyHistory}>No hay posiciones abiertas para este par.</Text>:selectedActivePositions.map((item,index)=>{
          const buy=String(item.direction??'').toLowerCase()==='buy'; const sltp=historyData.activeOrders.find(o=>String(o.position_id??'')===String(item.position_id??'')&&String(o.order_type??'').toLowerCase()==='sltp');
          return <View key={String(item.position_id??index)} style={s.historyCard}>
            <View style={s.historyCardHeader}><Text style={s.historyPair}>{historyValue(item,'instrument')}</Text><Text style={buy?s.pnlPositive:s.pnlNegative}>{buy?'BUY':'SELL'}</Text></View>
            <Info label="ID POSICIÓN" value={historyValue(item,'position_id')}/><Info label="VOLUMEN" value={historyValue(item,'volume')}/><Info label="PRECIO DE APERTURA" value={historyValue(item,'open_price')}/><Info label="ESTADO" value={historyValue(item,'state')}/><Info label="STOP LOSS" value={sltp?historyValue(sltp,'stop_loss_price'):'—'}/><Info label="TAKE PROFIT" value={sltp?historyValue(sltp,'take_profit_price'):'—'}/><Info label="APERTURA" value={historyDate(item,'create_time')}/>
          </View>;
        })}
        <Text style={s.historySection}>ÓRDENES PENDIENTES ({selectedActiveOrders.length})</Text>
        {selectedActiveOrders.length===0?<Text style={s.emptyHistory}>No hay órdenes pendientes para este par.</Text>:selectedActiveOrders.map((item,index)=><View key={String(item.order_id??index)} style={s.historyCard}>
          <View style={s.historyCardHeader}><Text style={s.historyPair}>{historyValue(item,'instrument')}</Text><Text style={s.pendingText}>PENDIENTE</Text></View>
          <Info label="ID ORDEN" value={historyValue(item,'order_id')}/><Info label="TIPO" value={historyValue(item,'order_type')}/><Info label="DIRECCIÓN" value={historyValue(item,'direction')}/><Info label="VOLUMEN" value={historyValue(item,'volume')}/><Info label="PRECIO" value={historyValue(item,'price')}/><Info label="CREADA" value={historyDate(item,'create_time')}/>
        </View>)}
      </>}
      {!!historyData&&historyMode==='past'&&<>
        <Text style={s.historySection}>ÓRDENES FINALIZADAS ({selectedPastOrders.length})</Text>
        {selectedPastOrders.length===0?<Text style={s.emptyHistory}>No hay órdenes pasadas para este par en el período permitido por Exness.</Text>:[...selectedPastOrders].reverse().map((item,index)=>{
          const order=item.order&&typeof item.order==='object'?item.order as Record<string,unknown>:item; const state=String(order.state??order.order_state??'').toUpperCase();
          return <View key={String(order.order_id??index)} style={s.historyCard}>
            <View style={s.historyCardHeader}><Text style={s.historyPair}>{historyValue(order,'instrument')}</Text><Text style={state==='FILLED'?s.pnlPositive:s.pendingText}>{state||'FINALIZADA'}</Text></View>
            <Info label="ID ORDEN" value={historyValue(order,'order_id')}/><Info label="DIRECCIÓN" value={historyValue(order,'direction')}/><Info label="VOLUMEN" value={historyValue(order,'volume')}/><Info label="PRECIO" value={historyValue(order,'price')}/><Info label="MOTIVO" value={historyValue(order,'reason')}/><Info label="FECHA" value={historyDate(item,'event_time')}/>
          </View>;
        })}
      </>}
    </ScrollView> : screen==='history' ? <ScrollView contentContainerStyle={s.content}>
      <Text style={s.h1}>HISTORIAL</Text>
      <Text style={s.sub}>Consultá las posiciones activas, órdenes pendientes y operaciones pasadas de tu cuenta.</Text>
      <Text style={s.meta}>SELECCIONE SU PAR</Text>
      <Pressable onPress={()=>setHistoryPairMenu(value=>!value)} style={s.historyPairSelect}>
        <Text style={s.historyPairSelectText}>{selectedHistoryPair==='ALL'?'TODOS LOS PARES':selectedHistoryPair}</Text>
        <Text style={s.selectArrow}>{historyPairMenu?'▲':'▼'}</Text>
      </Pressable>
      {historyPairMenu && <View style={s.historyPairMenu}>
        <Pressable onPress={()=>{setSelectedHistoryPair('ALL');setHistoryPairMenu(false);}} style={s.menuItem}><Text style={s.menuText}>TODOS LOS PARES</Text></Pressable>
        {historyPairs.map(pair=><Pressable key={pair} onPress={()=>{setSelectedHistoryPair(pair);setHistoryPairMenu(false);}} style={s.menuItem}><Text style={s.menuText}>{pair}</Text></Pressable>)}
        {!historyPairs.length && <Text style={s.historyEmptySmall}>Todavía no hay pares disponibles.</Text>}
      </View>}
      <View style={s.historyModes}>
        <Pressable onPress={()=>setHistoryMode('active')} style={[s.historyModeButton,historyMode==='active'&&s.historyModeSelected]}><Text style={[s.historyModeText,historyMode==='active'&&s.historyModeTextSelected]}>ACTIVAS</Text></Pressable>
        <Pressable onPress={()=>setHistoryMode('past')} style={[s.historyModeButton,historyMode==='past'&&s.historyModeSelected]}><Text style={[s.historyModeText,historyMode==='past'&&s.historyModeTextSelected]}>PASADAS</Text></Pressable>
      </View>
      <Pressable disabled={historyLoading} onPress={()=>void loadHistory()} style={[s.refresh,historyLoading&&s.disabled]}>
        {historyLoading?<ActivityIndicator/>:<Text style={s.refreshText}>↻  ACTUALIZAR HISTORIAL</Text>}
      </Pressable>
      {!!historyError && <View style={s.historyErrorBox}><Text style={s.historyError}>{historyError}</Text></View>}
      {historyLoading && !historyData ? <ActivityIndicator color="#fff" size="large"/> :
        selectedHistoryItems.length ? selectedHistoryItems.map((item,index)=><HistoryItem key={historyItemKey(item,index)} item={item}/>) :
        <View style={s.historyEmpty}><Text style={s.historyEmptyTitle}>SIN ÓRDENES</Text><Text style={s.historyEmptyText}>{historyData ? (historyMode==='active'?'No hay posiciones activas ni órdenes pendientes para este par.':'No hay órdenes pasadas para este par.') : 'Actualizá el historial para consultar tus operaciones.'}</Text></View>}
      <Text style={s.historyFootnote}>Los pares disponibles se obtienen de las operaciones de tu cuenta; no se muestra el catálogo completo de Exness.</Text>
    </ScrollView> : <ScrollView contentContainerStyle={s.content}>
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
      <View style={s.card}>
        {(BUILD_INFO.changelog.length ? BUILD_INFO.changelog : ['#V0 — Historial inicial']).map((entry,i)=><Text key={i} style={s.change}>{entry}</Text>)}
      </View>
    </ScrollView>}
  </SafeAreaView>;
}

function Info({label,value,valueStyle}:{label:string,value:string,valueStyle?:TextStyle}) {
  return <View style={s.info}><Text style={s.infoLabel}>{label}</Text><Text style={[s.infoValue,valueStyle]}>{value}</Text></View>;
}

function historyItemKey(item: HistoryRecord, index: number) {
  return `${item.kind}-${historyText(historyField(item.record,'position_id','order_id','deal_id','id'),String(index))}-${index}`;
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:'#0b0e13'},header:{height:68,paddingHorizontal:20,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'#252b35'},
 title:{color:'#fff',fontSize:18,fontWeight:'800'},dot:{width:12,height:12,borderRadius:6},green:{backgroundColor:'#28d17c'},yellow:{backgroundColor:'#f0b429'},red:{backgroundColor:'#e05252'},
 tabs:{flexDirection:'row',borderBottomWidth:1,borderBottomColor:'#252b35'},tab:{flex:1,padding:15,alignItems:'center'},active:{borderBottomWidth:2,borderBottomColor:'#fff'},tabText:{color:'#dce1e9',fontWeight:'800'},
 content:{padding:22,gap:15},h1:{color:'#fff',fontSize:26,fontWeight:'900'},sub:{color:'#9da6b5',lineHeight:21},field:{gap:7},label:{color:'#c8ced8',fontSize:12,fontWeight:'800'},
 row:{flexDirection:'row',backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:10},input:{flex:1,color:'#fff',padding:13,minHeight:48},eye:{width:48,alignItems:'center',justifyContent:'center'},
 button:{minHeight:50,borderRadius:10,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},buttonText:{color:'#0b0e13',fontWeight:'900'},disabled:{opacity:.5},
 onlineText:{color:'#28d17c',textAlign:'center',fontWeight:'800'},offlineText:{color:'#e05252',textAlign:'center',fontWeight:'800'},
 card:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:14,padding:17,gap:17},info:{gap:5},infoLabel:{color:'#8f98a8',fontSize:11,fontWeight:'900'},infoValue:{color:'#fff',fontSize:15,fontWeight:'600'},pnlPositive:{color:'#28d17c',fontWeight:'900'},pnlNegative:{color:'#e05252',fontWeight:'900'},
 refresh:{minHeight:48,borderRadius:10,borderWidth:1,borderColor:'#3b4350',alignItems:'center',justifyContent:'center'},refreshText:{color:'#fff',fontWeight:'900'},
 meta:{color:'#8f98a8',fontSize:11,fontWeight:'900'},time:{color:'#fff',fontWeight:'600',marginTop:-9},ap:{color:'#707988',fontSize:11},
 githubButton:{minHeight:54,borderRadius:12,borderWidth:1,borderColor:'#3b4350',paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:12},githubLogo:{width:24,height:24},githubText:{color:'#fff',fontWeight:'900',flex:1},githubVersion:{color:'#9da6b5',fontWeight:'800'},change:{color:'#dce1e9',fontSize:13,lineHeight:20},
 saveIntervalButton:{minHeight:46,borderRadius:10,borderWidth:1,borderColor:'#3b4350',alignItems:'center',justifyContent:'center',backgroundColor:'#151a22'},saveIntervalText:{color:'#fff',fontWeight:'900',fontSize:12},
 intervalCard:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:14,padding:17,gap:12},intervalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},clockButton:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center'},clockOn:{color:'#28d17c',fontSize:25,fontWeight:'900'},clockOff:{color:'#e05252',fontSize:22,fontWeight:'900'},intervalTitle:{color:'#fff',fontSize:14,fontWeight:'800'},select:{minHeight:44,borderWidth:1,borderColor:'#3b4350',borderRadius:9,paddingHorizontal:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#0f131a'},selectText:{color:'#fff',fontWeight:'700'},selectArrow:{color:'#9da6b5',fontSize:12},menu:{borderWidth:1,borderColor:'#3b4350',borderRadius:9,backgroundColor:'#0f131a',overflow:'hidden'},menuItem:{paddingHorizontal:13,paddingVertical:12},menuText:{color:'#fff',fontWeight:'700'},sliderRow:{flexDirection:'row',alignItems:'center',gap:8},sliderMin:{color:'#9da6b5',fontSize:11,fontWeight:'800'},sliderMax:{color:'#9da6b5',fontSize:11,fontWeight:'800'},sliderTrack:{flex:1,height:32,borderRadius:16,backgroundColor:'transparent',position:'relative',justifyContent:'center'},sliderEnabled:{opacity:1},sliderDisabled:{opacity:0.4},sliderRail:{position:'absolute',left:9,right:9,top:13,height:6,borderRadius:3,backgroundColor:'#303744'},sliderFill:{position:'absolute',left:9,top:13,height:6,borderRadius:3,backgroundColor:'#fff'},sliderThumb:{position:'absolute',top:7,width:18,height:18,borderRadius:9,backgroundColor:'#fff',marginLeft:-9},intervalValue:{color:'#9da6b5',fontSize:11,fontWeight:'700'}
  historyModes:{flexDirection:'row',gap:10},historyMode:{flex:1,minHeight:48,borderWidth:1,borderColor:'#3b4350',borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:'#151a22'},historyModeSelected:{backgroundColor:'#fff',borderColor:'#fff'},historyModeText:{color:'#dce1e9',fontWeight:'900'},historyModeTextSelected:{color:'#0b0e13'},historySection:{color:'#fff',fontSize:13,fontWeight:'900',marginTop:5},historyCard:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:13,padding:15,gap:12},historyCardHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},historyPair:{color:'#fff',fontSize:17,fontWeight:'900'},pendingText:{color:'#f0b429',fontWeight:'900'},emptyHistory:{color:'#9da6b5',textAlign:'center',paddingVertical:18},menuEmpty:{color:'#9da6b5',padding:13}
});