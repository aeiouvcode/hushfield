'use strict';
// Everything is synthesized in the listener's browser. No audio file or network source.
const TAU = Math.PI * 2;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
function keyBuffer(ac) {
  const sr=ac.sampleRate, length=Math.floor(sr*3.4), b=ac.createBuffer(1,length,sr), out=b.getChannelData(0);
  // A soft struck tine: overtones fall faster than the body, with a tiny
  // inharmonic shimmer and a felt-like transient. The fade is baked in.
  let seed=6347;
  for(let i=0;i<length;i++) {
    const t=i/sr, attack=1-Math.exp(-t*105), body=Math.exp(-t*1.28);
    seed=(seed*1664525+1013904223)>>>0;
    const felt=((seed/4294967296)*2-1)*Math.exp(-t*125)*.016;
    out[i]=attack*(
      .49*Math.sin(TAU*261.6256*t)*body+
      .24*Math.sin(TAU*523.77*t+.12)*Math.exp(-t*2.1)+
      .105*Math.sin(TAU*789.2*t+.35)*Math.exp(-t*4.6)+
      .038*Math.sin(TAU*1064.5*t+.4)*Math.exp(-t*8.5)+felt);
  }
  return b;
}
function textureBuffer(ac) {
  const b=ac.createBuffer(1,ac.sampleRate*3,ac.sampleRate),d=b.getChannelData(0);
  let seed=909, brown=0;
  for(let i=0;i<d.length;i++){
    seed=(seed*1664525+1013904223)>>>0;
    brown=clamp(brown*.985+((seed/4294967296)*2-1)*.015,-.4,.4);
    d[i]=brown*.28;
  }
  return b;
}
const midi = n => 440*Math.pow(2,(n-69)/12);
const chords = [
  {bass:38,notes:[62,65,69,72,76],lead:[81,79,76,72,74]}, // Dm9
  {bass:43,notes:[59,62,65,69,72],lead:[77,76,74,72,69]}, // G13
  {bass:36,notes:[60,64,67,71,74],lead:[76,74,71,67,69]}, // Cmaj9
  {bass:45,notes:[60,64,67,71,76],lead:[76,74,72,71,69]}  // Am9
];
export function createLofi(ac, output=ac.destination) {
  const master=ac.createGain();master.gain.value=0;
  const lowpass=ac.createBiquadFilter();lowpass.type='lowpass';lowpass.frequency.value=2600;lowpass.Q.value=.45;
  const comp=ac.createDynamicsCompressor();comp.threshold.value=-22;comp.knee.value=14;comp.ratio.value=2;comp.attack.value=.015;comp.release.value=.28;
  lowpass.connect(comp).connect(master).connect(ac.destination);
  const keys=keyBuffer(ac),grain=textureBuffer(ac);
  const hiss=ac.createBufferSource();hiss.buffer=grain;hiss.loop=true;
  const hissFilter=ac.createBiquadFilter();hissFilter.type='lowpass';hissFilter.frequency.value=950;
  const hissGain=ac.createGain();hissGain.gain.value=.045;
  hiss.connect(hissFilter).connect(hissGain).connect(lowpass);hiss.start();
  let timer=null,beat=0,next=ac.currentTime+.08,scene='field';
  const beatSec=60/72;
  const sceneGain={field:.43,shore:.38,rain:.32};
  function play(note,at,volume,duration=2.9){
    const src=ac.createBufferSource(),g=ac.createGain();src.buffer=keys;
    src.playbackRate.value=midi(note)/261.6256;
    g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(volume,at+.018);
    g.gain.setTargetAtTime(0,at+Math.min(duration*.55,1.1),Math.max(.14,duration*.28));
    src.connect(g).connect(lowpass);src.start(at);src.stop(at+Math.min(3.35, duration+1));
  }
  function brush(at,amount){
    // A soft filtered brush/shaker, no sharp click or electronic hi-hat.
    const src=ac.createBufferSource(),bp=ac.createBiquadFilter(),g=ac.createGain();
    src.buffer=grain;bp.type='bandpass';bp.frequency.value=scene==='rain'?650:1050;bp.Q.value=.48;
    g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(amount,at+.012);
    g.gain.exponentialRampToValueAtTime(.0001,at+.095);
    src.connect(bp).connect(g).connect(lowpass);src.start(at);src.stop(at+.11);
  }
  function schedule(n,at){
    const bar=Math.floor(n/8),pos=n%8,c=chords[bar%chords.length];
    if(pos===0){play(c.bass,at,.19,2.5);for(const [i,note] of c.notes.entries())play(note,at+i*.018,.06,3);}
    if(pos===4){play(c.bass+12,at,.085,1.8);for(const [i,note] of c.notes.slice(1,4).entries())play(note,at+i*.022,.039,2.4);}
    // Sparse phrases leave room for the ambience. Deterministic variation loops every 8 bars.
    if([2,5,7].includes(pos)){
      const ix=(bar*3+pos)%c.lead.length;
      if((bar+pos)%5!==0)play(c.lead[ix],at+(pos===5?.065:.018),.048,1.7);
    }
    if(scene!=='field'){
      if(pos===0||pos===4)play(c.bass-12,at,.072,1.1);
      if(pos===2||pos===6)brush(at,scene==='rain'?.026:.015);
    }
    if(pos%2===1)brush(at+.045,scene==='field'?.008:scene==='rain'?.017:.011);
  }
  function tick(){
    if(ac.state!=='running')return;
    while(next<ac.currentTime+.24){schedule(beat,next);beat++;next+=beatSec;}
  }
  return {
    start(){if(timer)return;next=ac.currentTime+.08;tick();timer=setInterval(tick,100);},
    stop(){if(timer){clearInterval(timer);timer=null;}master.gain.setTargetAtTime(0,ac.currentTime,.15);},
    scene(name){scene=name in sceneGain?name:'field';lowpass.frequency.setTargetAtTime(scene==='rain'?1800:scene==='shore'?2300:2600,ac.currentTime,.7);if(timer)master.gain.setTargetAtTime(sceneGain[scene],ac.currentTime,.55);},
    volume(on){master.gain.setTargetAtTime(on?sceneGain[scene]:0,ac.currentTime,on?.65:.18);},
    renderPreview(seconds=8){next=.08;beat=0;while(next<seconds){schedule(beat,next);beat++;next+=beatSec;}master.gain.value=sceneGain[scene];},
    get active(){return !!timer;}
  };
}
