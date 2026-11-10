import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { connectAndGetAccount, type Credentials } from './src/exness';
import { loadCredentials, saveCredentials } from './src/storage';
import { BUILD_INFO } from './src/buildInfo';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

const PERIOD = 5 * 60 * 1000;
const RELEASES_URL = 'https://github.com/Tinchodoko/tinchodoko-ai-assistant/releases';
const LATEST_RELEASE_API = 'https://api.github.com/repos/Tinchodoko/tinchodoko-ai-assistant/releases/latest';
type Screen = 'connection' | 'profile' | 'app';

function dateText(d: Date | null) {
  if (!d) return '--/--/---- --:--:--';
  const p = (n:number) => String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function releaseBuildNumber(tag:string) {
  const match=tag.trim().match(/^v?(\\d+)$/i);
  return match ? Number(match[1]) : 0;
}

async function cleanupInstalledUpdateApks() {
  const directory=FileSystem.cacheDirectory;
  if (!directory) return;
  try {
    const installedBuild=Number(BUILD_INFO.build);
    const entries=await FileSystem.readDirectoryAsync(directory);
    for (const name of entries) {
      const match=name.match(/^tinchodoko-update-v(\\d+)\\.apk$/i);
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
  const [accessPoint,setAccessPoint]=useState('');
  const [last,setLast]=useState<Date|null>(null);
  const [next,setNext]=useState<Date|null>(null);
  const [busy,setBusy]=useState(false);
  const [latestVersion,setLatestVersion]=useState<string|null>(null);
  const [latestBuild,setLatestBuild]=useState<number|null>(null);
  const [latestApkUrl,setLatestApkUrl]=useState<string|null>(null);
  const [checkingUpdate,setCheckingUpdate]=useState(false);
  const [downloadingUpdate,setDownloadingUpdate]=useState(false);

  useEffect(()=>{
    loadCredentials().then(x=>x&&setC(x));
    void cleanupInstalledUpdateApks();
  },[]);

  async function connect() {
    setBusy(true); setStatus('connecting');
    try {
      await saveCredentials(c);
      const r=await connectAndGetAccount(c);
      setBalance(r.balance); setAccessPoint(r.accessPoint); setStatus('online');
      const now=new Date(); setLast(now); setNext(new Date(now.getTime()+PERIOD)); setScreen('profile');
    } catch(e) {
      setStatus('offline'); Alert.alert('Conexión fallida',e instanceof Error?e.message:String(e));
    } finally { setBusy(false); }
  }

  async function refresh() {
    if(busy) return;
    setBusy(true);
    try {
      const r=await connectAndGetAccount(c);
      setBalance(r.balance); setAccessPoint(r.accessPoint); setStatus('online');
      const now=new Date(); setLast(now); setNext(new Date(now.getTime()+PERIOD));
    } catch(e) {
      setStatus('offline'); Alert.alert('Actualización fallida',e instanceof Error?e.message:String(e));
    } finally { setBusy(false); }
  }

  async function checkUpdate() {
    setCheckingUpdate(true);
    try {
      const res=await fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
      if (res.status === 404) {
        setLatestVersion(null); setLatestBuild(null); setLatestApkUrl(null);
        Alert.alert('Actualización', 'No hay releases publicadas todavía.'); return;
      }
      if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
      const release=await res.json() as {
        tag_name?:string; name?:string; draft?:boolean; prerelease?:boolean;
        assets?:Array<{name?:string;browser_download_url?:string}>;
      };
      const tag=release.tag_name || release.name || '';
      const remoteBuild=releaseBuildNumber(tag);
      if (!tag || remoteBuild<1 || release.draft || release.prerelease) {
        throw new Error('GitHub no devolvió una Release estable válida.');
      }
      const apk=release.assets?.find(asset=>asset.name==='app-release.apk' && !!asset.browser_download_url);
      if (!apk?.browser_download_url) throw new Error('La última Release no contiene app-release.apk.');
      setLatestVersion(tag); setLatestBuild(remoteBuild); setLatestApkUrl(apk.browser_download_url);
      if (remoteBuild > Number(BUILD_INFO.build)) {
        Alert.alert('Actualización disponible', `Nueva versión: ${tag}. Pulsa ACTUALIZAR APP para descargarla e iniciar el instalador de Android.`);
      } else {
        Alert.alert('Actualización', 'La aplicación ya está actualizada.');
      }
    } catch(e) {
      Alert.alert('Actualización', e instanceof Error?e.message:String(e));
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
      Alert.alert('Actualización lista', 'Android abrirá el instalador. Confirma “Actualizar” para instalar la nueva versión.');
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

  useEffect(()=>{
    if(screen!=='profile') return;
    const id=setInterval(refresh,PERIOD);
    return ()=>clearInterval(id);
  },[screen,c.apiKey,c.secret,c.accountId,c.gatewayUrl]);

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
      </View>
      <Pressable disabled={busy} onPress={refresh} style={[s.refresh,busy&&s.disabled]}>{busy?<ActivityIndicator/>:<Text style={s.refreshText}>↻  ACTUALIZAR BALANCE</Text>}</Pressable>
      <Text style={s.meta}>ÚLTIMA ACTUALIZACIÓN</Text><Text style={s.time}>{dateText(last)}</Text>
      <Text style={s.meta}>PRÓXIMA ACTUALIZACIÓN</Text><Text style={s.time}>{dateText(next)}</Text>
      <Text style={status==='online'?s.onlineText:s.offlineText}>Estado: {status}</Text>
      {!!accessPoint && <Text style={s.ap}>Access Point: {accessPoint}</Text>}
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

function Info({label,value}:{label:string,value:string}) {
  return <View style={s.info}><Text style={s.infoLabel}>{label}</Text><Text style={s.infoValue}>{value}</Text></View>;
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:'#0b0e13'},header:{height:68,paddingHorizontal:20,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'#252b35'},
 title:{color:'#fff',fontSize:18,fontWeight:'800'},dot:{width:12,height:12,borderRadius:6},green:{backgroundColor:'#28d17c'},yellow:{backgroundColor:'#f0b429'},red:{backgroundColor:'#e05252'},
 tabs:{flexDirection:'row',borderBottomWidth:1,borderBottomColor:'#252b35'},tab:{flex:1,padding:15,alignItems:'center'},active:{borderBottomWidth:2,borderBottomColor:'#fff'},tabText:{color:'#dce1e9',fontWeight:'800'},
 content:{padding:22,gap:15},h1:{color:'#fff',fontSize:26,fontWeight:'900'},sub:{color:'#9da6b5',lineHeight:21},field:{gap:7},label:{color:'#c8ced8',fontSize:12,fontWeight:'800'},
 row:{flexDirection:'row',backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:10},input:{flex:1,color:'#fff',padding:13,minHeight:48},eye:{width:48,alignItems:'center',justifyContent:'center'},
 button:{minHeight:50,borderRadius:10,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},buttonText:{color:'#0b0e13',fontWeight:'900'},disabled:{opacity:.5},
 onlineText:{color:'#28d17c',textAlign:'center',fontWeight:'800'},offlineText:{color:'#e05252',textAlign:'center',fontWeight:'800'},
 card:{backgroundColor:'#151a22',borderWidth:1,borderColor:'#2b323e',borderRadius:14,padding:17,gap:17},info:{gap:5},infoLabel:{color:'#8f98a8',fontSize:11,fontWeight:'900'},infoValue:{color:'#fff',fontSize:15,fontWeight:'600'},
 refresh:{minHeight:48,borderRadius:10,borderWidth:1,borderColor:'#3b4350',alignItems:'center',justifyContent:'center'},refreshText:{color:'#fff',fontWeight:'900'},
 meta:{color:'#8f98a8',fontSize:11,fontWeight:'900'},time:{color:'#fff',fontWeight:'600',marginTop:-9},ap:{color:'#707988',fontSize:11},
 githubButton:{minHeight:54,borderRadius:12,borderWidth:1,borderColor:'#3b4350',paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:12},githubLogo:{width:24,height:24},githubText:{color:'#fff',fontWeight:'900',flex:1},githubVersion:{color:'#9da6b5',fontWeight:'800'},change:{color:'#dce1e9',fontSize:13,lineHeight:20}
});