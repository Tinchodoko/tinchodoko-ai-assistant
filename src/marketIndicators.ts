export type IndicatorCandle = { time:string; open:number; high:number; low:number; close:number; volume:number };

export type IndicatorSnapshot = {
  rsi:number|null; atr:number|null; ema20:number|null; ema50:number|null; adx:number|null;
  macd:number|null; macdSignal:number|null; macdHistogram:number|null;
  bollingerUpper:number|null; bollingerMiddle:number|null; bollingerLower:number|null; bollingerWidth:number|null;
  zScore:number|null;
};

export type IndicatorRow = IndicatorCandle & {
  rsi14:number|null; atr14:number|null; ema20:number|null; ema50:number|null; adx14:number|null;
  macd:number|null; macdSignal:number|null; macdHistogram:number|null;
  bollingerUpper:number|null; bollingerMiddle:number|null; bollingerLower:number|null; bollingerWidth:number|null;
  zScore:number|null;
};

const round=(v:number,d=6)=>Number(v.toFixed(d));
function closes(c:IndicatorCandle[]){return c.map(x=>x.close);}
function sma(v:number[],n:number,i:number){if(i<n-1)return null;let s=0;for(let j=i-n+1;j<=i;j++)s+=v[j];return s/n;}

function emaSeries(v:number[],n:number){
  const out:Array<number|null>=Array(v.length).fill(null);
  if(v.length<n)return out;
  let seed=0;for(let i=0;i<n;i++)seed+=v[i];
  let prev=seed/n;out[n-1]=prev;const k=2/(n+1);
  for(let i=n;i<v.length;i++){prev=v[i]*k+prev*(1-k);out[i]=prev;}
  return out;
}

function rsiSeries(v:number[],n:number){
  const out:Array<number|null>=Array(v.length).fill(null);
  if(v.length<=n)return out;
  let gain=0,loss=0;
  for(let i=1;i<=n;i++){const d=v[i]-v[i-1];if(d>=0)gain+=d;else loss-=d;}
  let ag=gain/n,al=loss/n;
  out[n]=al===0?100:100-100/(1+ag/al);
  for(let i=n+1;i<v.length;i++){
    const d=v[i]-v[i-1];ag=((ag*(n-1))+Math.max(d,0))/n;al=((al*(n-1))+Math.max(-d,0))/n;
    out[i]=al===0?100:100-100/(1+ag/al);
  }
  return out;
}

function atrSeries(c:IndicatorCandle[],n:number){
  const tr=c.map((x,i)=>i===0?x.high-x.low:Math.max(x.high-x.low,Math.abs(x.high-c[i-1].close),Math.abs(x.low-c[i-1].close)));
  return emaSeries(tr,n);
}

function macdSeries(v:number[]){
  const e12=emaSeries(v,12),e26=emaSeries(v,26);
  const macd:Array<number|null>=v.map((_,i)=>e12[i]!==null&&e26[i]!==null?(e12[i]! - e26[i]!):null);
  const compact:number[]=[];const index:number[]=[];
  macd.forEach((x,i)=>{if(x!==null){compact.push(x);index.push(i);}});
  const sigCompact=emaSeries(compact,9);
  const signal:Array<number|null>=v.map(()=>null),hist:Array<number|null>=v.map(()=>null);
  for(let j=0;j<index.length;j++){const i=index[j],s=sigCompact[j];if(s!==null){signal[i]=s;hist[i]=macd[i]!-s;}}
  return {macd,signal,hist};
}

function adxSeries(c:IndicatorCandle[],n:number){
  const len=c.length,out:Array<number|null>=Array(len).fill(null);
  if(len<2*n+1)return out;
  const tr:number[]=Array(len).fill(0),plus:number[]=Array(len).fill(0),minus:number[]=Array(len).fill(0);
  for(let i=1;i<len;i++){
    tr[i]=Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close));
    const up=c[i].high-c[i-1].high,down=c[i-1].low-c[i].low;
    plus[i]=up>down&&up>0?up:0;minus[i]=down>up&&down>0?down:0;
  }
  let atr=0,p=0,m=0;
  for(let i=1;i<=n;i++){atr+=tr[i];p+=plus[i];m+=minus[i];}
  atr/=n;p/=n;m/=n;
  const dx:number[]=[];const dxIndex:number[]=[];
  for(let i=n;i<len;i++){
    if(i>n){atr=(atr*(n-1)+tr[i])/n;p=(p*(n-1)+plus[i])/n;m=(m*(n-1)+minus[i])/n;}
    const pdi=atr?p/atr*100:0,mdi=atr?m/atr*100:0,den=pdi+mdi;
    const dxv=den?Math.abs(pdi-mdi)/den*100:0;
    dx.push(dxv);dxIndex.push(i);
    if(dx.length===n)out[i]=dx.reduce((a,b)=>a+b,0)/n;
    else if(dx.length>n)out[i]=(out[dxIndex[i-n-1]]!*(n-1)+dxv)/n;
  }
  return out;
}

function bollingerSeries(v:number[],n=20){
  const upper:Array<number|null>=Array(v.length).fill(null),middle:Array<number|null>=Array(v.length).fill(null),lower:Array<number|null>=Array(v.length).fill(null),width:Array<number|null>=Array(v.length).fill(null);
  for(let i=n-1;i<v.length;i++){
    const mid=sma(v,n,i)!;let ss=0;for(let j=i-n+1;j<=i;j++)ss+=(v[j]-mid)**2;
    const sd=Math.sqrt(ss/n),up=mid+2*sd,lo=mid-2*sd;
    middle[i]=mid;upper[i]=up;lower[i]=lo;width[i]=mid!==0?(up-lo)/mid:null;
  }
  return {upper,middle,lower,width};
}

function zScoreSeries(v:number[],n=20){
  const out:Array<number|null>=Array(v.length).fill(null);
  for(let i=n-1;i<v.length;i++){
    const slice=v.slice(i-n+1,i+1),mean=slice.reduce((a,b)=>a+b,0)/n;
    const sd=Math.sqrt(slice.reduce((a,b)=>a+(b-mean)**2,0)/n);
    out[i]=sd===0?0:(v[i]-mean)/sd;
  }
  return out;
}

export function calculateIndicatorSeries(candles:IndicatorCandle[]):IndicatorRow[]{
  const c=candles.slice().sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
  if(!c.length)return [];
  const v=closes(c),rsi=rsiSeries(v,14),atr=atrSeries(c,14),e20=emaSeries(v,20),e50=emaSeries(v,50),mac=macdSeries(v),adx=adxSeries(c,14),bb=bollingerSeries(v,20),z=zScoreSeries(v,20);
  return c.map((candle,i)=>({
    ...candle,
    rsi14:rsi[i]===null?null:round(rsi[i]!,4),
    atr14:atr[i]===null?null:round(atr[i]!,8),
    ema20:e20[i]===null?null:round(e20[i]!,8),
    ema50:e50[i]===null?null:round(e50[i]!,8),
    adx14:adx[i]===null?null:round(adx[i]!,4),
    macd:mac.macd[i]===null?null:round(mac.macd[i]!,8),
    macdSignal:mac.signal[i]===null?null:round(mac.signal[i]!,8),
    macdHistogram:mac.hist[i]===null?null:round(mac.hist[i]!,8),
    bollingerUpper:bb.upper[i]===null?null:round(bb.upper[i]!,8),
    bollingerMiddle:bb.middle[i]===null?null:round(bb.middle[i]!,8),
    bollingerLower:bb.lower[i]===null?null:round(bb.lower[i]!,8),
    bollingerWidth:bb.width[i]===null?null:round(bb.width[i]!,8),
    zScore:z[i]===null?null:round(z[i]!,4),
  }));
}

export function calculateIndicators(candles:IndicatorCandle[]):IndicatorSnapshot{
  const rows=calculateIndicatorSeries(candles);
  if(!rows.length)return {rsi:null,atr:null,ema20:null,ema50:null,adx:null,macd:null,macdSignal:null,macdHistogram:null,bollingerUpper:null,bollingerMiddle:null,bollingerLower:null,bollingerWidth:null,zScore:null};
  const last=rows[rows.length-1];
  return {rsi:last.rsi14,atr:last.atr14,ema20:last.ema20,ema50:last.ema50,adx:last.adx14,macd:last.macd,macdSignal:last.macdSignal,macdHistogram:last.macdHistogram,bollingerUpper:last.bollingerUpper,bollingerMiddle:last.bollingerMiddle,bollingerLower:last.bollingerLower,bollingerWidth:last.bollingerWidth,zScore:last.zScore};
}
