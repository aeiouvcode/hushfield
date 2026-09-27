import { createLofi } from './lofi.js';
'use strict';
const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d', { alpha: false });
const app = document.getElementById('app');
const title = document.getElementById('scene-name');
const note = document.getElementById('scene-note');
const soundButton = document.getElementById('sound');
const soundText = document.querySelector('.sound-text');
const placeButtons = [...document.querySelectorAll('[data-place]')];
const names = { field: ['the field at last light', 'stay as long as you like'], shore: ['where the water waits', 'touch the water, watch it settle'], rain: ['a passing rain', 'nothing to catch up on'] };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let w = 390, h = 844, dpr = 1, place = 'field', raf = 0, last = 0, elapsed = 0;
let staticCanvas, stems = [], rain = [];
let wet, old, next, cols = 54, rows = 88, lastRipple = -1;
let sound = null, soundOn = false, lastFieldDraw = -1;
const hash = x => { let n = Math.sin(x * 127.1 + 78.233) * 43758.5453; return n - Math.floor(n); };
const lerp = (a,b,t) => a+(b-a)*t;
const clamp = (x,a,b) => Math.max(a, Math.min(b,x));
function setCanvasSize(c, width, height, ratio=1) { c.width=Math.round(width*ratio); c.height=Math.round(height*ratio); c.style.width=width+'px'; c.style.height=height+'px'; return c.getContext('2d', {alpha:false}); }
function resize() {
  w = Math.max(1, app.clientWidth); h = Math.max(1, app.clientHeight);
  dpr = Math.min(devicePixelRatio || 1, 1.5);
  setCanvasSize(canvas,w,h,dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  buildStatic();
  makeStems();
  makeRain();
  initWater();
  draw(elapsed);
}
function buildStatic() {
  staticCanvas=document.createElement('canvas');
  const g=staticCanvas.getContext('2d',{alpha:false});
  const staticRatio=place==='field'?.65:1;
  staticCanvas.width=Math.round(w*staticRatio);staticCanvas.height=Math.round(h*staticRatio);
  g.scale(staticRatio,staticRatio);
  const horizon=h*.53;
  let sky=g.createLinearGradient(0,0,0,h);
  if(place==='rain') { sky.addColorStop(0,'#767f8d');sky.addColorStop(.58,'#c3a7a0');sky.addColorStop(1,'#d9b9a1'); }
  else if(place==='shore') { sky.addColorStop(0,'#6f798b');sky.addColorStop(.4,'#bc8c89');sky.addColorStop(.68,'#e4b68e');sky.addColorStop(1,'#8c8487'); }
  else { sky.addColorStop(0,'#817c96');sky.addColorStop(.25,'#c69c9d');sky.addColorStop(.48,'#f1bd99');sky.addColorStop(.73,'#f7d0a4');sky.addColorStop(1,'#d69a73'); }
  g.fillStyle=sky;g.fillRect(0,0,w,h);
  const sunX=w*.68,sunY=h*(place==='field'?.39:.47),rad=Math.max(w,h)*.32;
  const halo=g.createRadialGradient(sunX,sunY,8,sunX,sunY,rad);
  halo.addColorStop(0,'#fff3c3b8');halo.addColorStop(.32,'#ffdaa071');halo.addColorStop(1,'#ffdaad00');
  g.fillStyle=halo;g.fillRect(0,0,w,h);
  if(place==='field') {
    g.fillStyle='#ffe6b6';g.beginPath();g.arc(sunX,sunY,Math.min(w,h)*.07,0,Math.PI*2);g.fill();
    // Far landforms are distinct planes, not a single gradient.
    for(let i=0;i<3;i++) {
      let y=h*(.48+i*.07);g.beginPath();g.moveTo(0,h);
      for(let x=0;x<=w+12;x+=12)g.lineTo(x,y+Math.sin(x*.012+i*1.7)*h*.014+Math.sin(x*.038+i*3)*h*.006);
      g.lineTo(w,h);g.closePath();g.fillStyle=['#a97676b2','#9d7069','#8d625e'][i];g.fill();
    }
    const floor=g.createLinearGradient(0,h*.59,0,h);floor.addColorStop(0,'#c88b64');floor.addColorStop(.45,'#ad714e');floor.addColorStop(1,'#643f39');g.fillStyle=floor;g.fillRect(0,h*.61,w,h*.39);
    // Far seed-head texture has an irregular horizon. No source image assets.
    for(let i=0;i<1100;i++) {
      let x=hash(i*3.1)*w, y=lerp(h*.59,h*.85,Math.pow(hash(i*4.7+1),1.7));
      g.strokeStyle=i%3===0?'#f1c18d43':'#593c3954';g.lineWidth=.5+hash(i*7)*1.5;
      g.beginPath();g.moveTo(x,y);g.lineTo(x+2,y-3-hash(i*12)*7);g.stroke();
    }
    // A dense foreground of still grain gives scale. Only fourteen long
    // prominent stems need live swaying, so most of the field is cached.
    for(let i=0;i<580;i++){
      const depth=hash(i*6.31+25),x=hash(i*11.61+49)*w;
      const y=h*(.77+depth*.3),len=h*(.018+depth*.11),tip=x+(hash(i*7.4)-.5)*len*.4;
      g.strokeStyle=i%4===0?'#e5b787ac':'#9e674cba';g.lineWidth=.4+depth*1.4;
      g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+(tip-x)*.4,y-len*.45,tip,y-len);g.stroke();
      if(depth>.23){g.fillStyle=i%3===0?'#f1c18fa3':'#c99169c2';g.beginPath();g.ellipse(tip,y-len,1+depth*1.3,2+depth*3,-.15,0,Math.PI*2);g.fill();}
    }
  } else {
    g.fillStyle=place==='rain'?'#786f71':'#756b7b';g.beginPath();g.moveTo(0,h*.55);
    for(let x=0;x<=w+10;x+=12)g.lineTo(x,h*.55+Math.sin(x*.02)*h*.008);g.lineTo(w,h*.68);g.lineTo(0,h*.68);g.fill();
    const water=g.createLinearGradient(0,h*.55,0,h);water.addColorStop(0,place==='rain'?'#b09890':'#b49087');water.addColorStop(.55,place==='rain'?'#667f87':'#7c858d');water.addColorStop(1,place==='rain'?'#3c5f6b':'#3e626e');g.fillStyle=water;g.fillRect(0,h*.56,w,h*.44);
    for(let i=0;i<220;i++){let y=h*(.56+.43*hash(i*2.3));let x=hash(i*3.4+9)*w;g.strokeStyle=i%4?'#ffe9b335':'#e8b4a62e';g.lineWidth=.4+hash(i*7)*1.2;g.beginPath();g.moveTo(x,y);g.lineTo(x+1+hash(i*11)*w*.12,y);g.stroke();}
  }
  // Fine screen-grain is spatially stable, preventing animated shimmer.
  for(let i=0;i<Math.min(1900,Math.round(w*h/150));i++){
    g.fillStyle=i%2?'#fff0d012':'#49374d12';g.fillRect(hash(i*31.7)*w,hash(i*43.2)*h,1,1);
  }
}
function makeStems() {
  stems=[];if(place!=='field')return;
  const count=14;
  for(let i=0;i<count;i++) {
    let r=hash(i*8.3), depth=Math.pow(r,.75), x=hash(i*6.9+15)*w;
    let baseY=lerp(h*.65,h*1.17,depth), length=lerp(h*.08,h*.24,depth);
    stems.push({x,baseY,length,depth,phase:hash(i*19.7)*6.28,tilt:(hash(i*17.3)-.5)*.24,seed:hash(i*2.7+7)});
  }
  stems.sort((a,b)=>a.baseY-b.baseY);
}
function makeRain() {
  rain=[];for(let i=0;i<85;i++)rain.push({x:hash(i*23.1)*w,y:hash(i*45.2)*h,z:hash(i*17.3),phase:hash(i*13.9)});
}
function initWater(){wet=new Float32Array(cols*rows);old=new Float32Array(cols*rows);next=new Float32Array(cols*rows);lastRipple=-1;}
function disturb(x,y,power=.7){
  const u=clamp(x/w,0,1),v=clamp((y/h-.56)/.44,0,1);
  if(y<h*.55 || place==='field')return false;
  let cx=Math.floor(u*(cols-1)),cy=Math.floor(v*(rows-1));
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
    let xx=cx+dx,yy=cy+dy;if(xx<1||xx>=cols-1||yy<1||yy>=rows-1)continue;
    wet[yy*cols+xx]+=power*Math.exp(-(dx*dx+dy*dy)/3.6);
  }
  lastRipple=elapsed;return true;
}
function waterStep() {
  for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++) {
    const k=y*cols+x;
    next[k]=clamp(((wet[k-1]+wet[k+1]+wet[k-cols]+wet[k+cols])*.5-old[k])*.975,-2,2);
  }
  const back=old;old=wet;wet=next;next=back;next.fill(0);
}
function waterEnergy() {let sum=0;for(let i=0;i<wet.length;i++)sum+=Math.abs(wet[i])+Math.abs(wet[i]-old[i]);return sum;}
function drawField(t) {
  // Depth layers sway independently, with near heads drawing over the figure.
  let split=stems.findIndex(s=>s.baseY>h*.75);if(split<0)split=stems.length;
  drawStems(stems,0,split,t);
  drawFigure(t);
  drawStems(stems,split,stems.length,t);
  let vignette=ctx.createLinearGradient(0,h*.6,0,h);vignette.addColorStop(0,'#55312b00');vignette.addColorStop(1,'#3b292b86');ctx.fillStyle=vignette;ctx.fillRect(0,h*.6,w,h*.4);
}
function drawStems(items,from,to,t) {
  for(let index=from;index<to;index++) {
    const s=items[index];
    const sway=reduced.matches?0:Math.sin(t*.6+s.phase+s.baseY*.006)*s.length*(.028+.045*s.depth);
    const hx=s.x+s.length*s.tilt+sway,hy=s.baseY-s.length;
    ctx.lineWidth=.6+s.depth*1.8;ctx.strokeStyle=s.depth>.65?'#d2a36e':'#e9bf8a';
    ctx.beginPath();ctx.moveTo(s.x,s.baseY);ctx.quadraticCurveTo(s.x+s.length*s.tilt*.34,hy+s.length*.48,hx,hy);ctx.stroke();
    ctx.strokeStyle=s.depth>.55?'#c79765':'#f1cd94';ctx.lineWidth=.5+s.depth*1.3;
    ctx.beginPath();ctx.moveTo(hx,hy+s.length*.12);ctx.lineTo(hx+2+s.depth*4,hy-s.length*.09);ctx.stroke();
    if(s.depth>.28){
      ctx.fillStyle=s.seed>.38?'#edc08b':'#c78e66';ctx.beginPath();ctx.ellipse(hx+1,hy,1.1+s.depth*2.4,2+s.depth*6,-.2,0,6.28);ctx.fill();

    }
  }
}
function drawFigure(t) {
  // Tiny, stationary posture on a low chair. Human silhouette is a focal pause.
  const cx=w*.49,cy=h*.625,scale=Math.min(w/390,h/844)*.95;
  ctx.save();ctx.translate(cx,cy);ctx.scale(scale,scale);
  ctx.fillStyle='#44383e';
  ctx.beginPath();ctx.ellipse(-1,-21,8.5,11,-.17,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(-7,-10);ctx.quadraticCurveTo(-13,4,-11,19);ctx.lineTo(7,21);ctx.quadraticCurveTo(11,2,5,-10);ctx.fill();
  ctx.strokeStyle='#44383e';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(3,2);ctx.lineTo(16,16);ctx.lineTo(29,17);ctx.moveTo(-8,2);ctx.lineTo(-20,17);ctx.lineTo(-8,20);ctx.stroke();
  ctx.strokeStyle='#513c3d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-19,18);ctx.lineTo(-22,37);ctx.moveTo(14,17);ctx.lineTo(17,38);ctx.moveTo(-16,16);ctx.lineTo(13,17);ctx.stroke();
  ctx.restore();
}
function drawWater(t) {
  const start=h*.56,cellW=w/(cols-1),cellH=(h-start)/(rows-1);
  // Each cell's persistent height slope shifts a light reflection, not an alpha ring.
  for(let y=1;y<rows-2;y+=2)for(let x=1;x<cols-2;x+=2){
    const k=y*cols+x;
    let slopeX=wet[k+1]-wet[k-1],slopeY=wet[k+cols]-wet[k-cols];
    let m=Math.abs(slopeX)+Math.abs(slopeY);
    if(m<.014)continue;
    const px=x*cellW,py=start+y*cellH;
    ctx.fillStyle=slopeX+slopeY>0?`rgba(255,226,187,${Math.min(.30,m*.22)})`:`rgba(35,61,77,${Math.min(.21,m*.17)})`;
    ctx.fillRect(px+slopeX*2,py+slopeY,cellW*(1.4+Math.min(m,1)*1.3),Math.max(.75,cellH*.32));
  }
  ctx.globalAlpha=place==='rain'?.38:.5;
  for(let i=0;i<85;i++) {
    let y=start+hash(i*4.2)*(h-start), x=hash(i*8.3+3)*w;
    let drift=Math.sin(t*.65+i*.36)*7;
    ctx.strokeStyle=i%5?'#f6d4ab':'#ffe5b7';ctx.lineWidth=.7;
    ctx.beginPath();ctx.moveTo(x+drift,y);ctx.lineTo(x+drift+2+hash(i*11.4)*25,y);ctx.stroke();
  }
  ctx.globalAlpha=1;
}
function drawRain(t) {
  if(reduced.matches)return;
  ctx.strokeStyle='#f5dfd077';ctx.lineWidth=.65;
  for(const d of rain){let yy=(d.y+t*(38+70*d.z))%(h*1.2),xx=d.x+yy*.11;
    ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(xx-2,yy+9+7*d.z);ctx.stroke();}
}
function draw(t) {
  if(!staticCanvas)return;
  ctx.drawImage(staticCanvas,0,0,w,h);
  // Slowly changing light is a moving wash, not a full procedural redraw.
  if(!reduced.matches && place==='field'){const breath=(Math.sin(t*.055)+1)*.5;ctx.fillStyle=`rgba(255,210,156,${(.016+breath*.027).toFixed(4)})`;ctx.fillRect(0,0,w,h);}
  if(place==='field')drawField(t);
  else{drawWater(t);if(place==='rain')drawRain(t);}
}
function frame(ms) {
  const dt=last?Math.min((ms-last)/1000,.05):0;last=ms;elapsed+=dt;
  if(place!=='field' && !reduced.matches) {
    // Two fixed, bounded propagation steps approximate a small pond. A periodic
    // faint forcing is spatially coherent; touch impulses build on it and settle.
    if(place==='rain'&&Math.floor(elapsed*1.2)!==Math.floor((elapsed-dt)*1.2)){
      const rx=hash(Math.floor(elapsed*1.2)*11)*w,ry=h*(.62+hash(Math.floor(elapsed*1.2)*19)*.32);disturb(rx,ry,.12);
    }
    if(place==='shore'&&Math.floor(elapsed/5)!==Math.floor((elapsed-dt)/5))disturb(w*.36,h*.74,.05);
    waterStep();waterStep();
  }
  if(place!=='field' || lastFieldDraw<0 || elapsed-lastFieldDraw>=.08){draw(elapsed);lastFieldDraw=elapsed;}
  raf=requestAnimationFrame(frame);
}
function select(p) {
  if(!names[p]||p===place)return;
  place=p;title.textContent=names[p][0];note.textContent=names[p][1];
  for(const b of placeButtons){if(b.dataset.place===p)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');}
  buildStatic();makeStems();makeRain();initWater();lastFieldDraw=-1;if(soundOn)sound.music.scene(place);draw(elapsed);
}
placeButtons.forEach(b=>b.addEventListener('click',()=>select(b.dataset.place)));
canvas.addEventListener('pointerdown',e=>{if(place!=='field')disturb(e.clientX,e.clientY,.6);});
// Sound never starts until the listener taps the button. A resumed context is
// muted whenever the tab becomes hidden; the next tap is required to restart.
async function toggleSound(){
  if(!sound){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC){soundText.textContent='unavailable';return;}
    const ac=new AC();sound={ac,music:createLofi(ac)};
    sound.music.scene(place);
  }
  await sound.ac.resume();soundOn=!soundOn;
  if(soundOn){sound.music.scene(place);sound.music.start();}
  sound.music.volume(soundOn);
  if(!soundOn)sound.music.stop();
  soundButton.setAttribute('aria-pressed',String(soundOn));
  soundButton.setAttribute('aria-label',soundOn?'Turn off gentle sound':'Turn on gentle sound');
  soundText.textContent=soundOn?'lofi on':'sound off';
}
soundButton.addEventListener('click',toggleSound);
document.addEventListener('visibilitychange',()=>{
  if(sound&&document.hidden){sound.music.stop();soundOn=false;
    soundButton.setAttribute('aria-pressed','false');soundButton.setAttribute('aria-label','Turn on gentle sound');soundText.textContent='sound off';
    sound.ac.suspend();
  }
});
window.addEventListener('resize',resize);
if(new URLSearchParams(location.search).has('test'))window.__hushfield={select,disturb,waterEnergy,step:waterStep,get place(){return place},get size(){return [w,h,dpr]},get soundOn(){return soundOn},get audioState(){return sound ? {active:sound.music.active,state:sound.ac.state} : null}};
resize();raf=requestAnimationFrame(frame);
