'use strict';
// SnapCollage — everything runs locally in your browser. No network calls.
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const LW=1080;
const ASPECTS=[{id:'4:5',name:'Post 4:5',r:5/4},{id:'1:1',name:'Square',r:1},{id:'9:16',name:'Story',r:16/9},{id:'wall',name:'Wallpaper',r:19.5/9},{id:'16:9',name:'Wide',r:9/16},{id:'2:3',name:'Print 4×6',r:3/2},{id:'strip',name:'Strip',r:3}];
const FILTERS=[['none','Original'],['vivid','Vivid'],['warm','Golden'],['cool','Cool'],['mono','Mono'],['noir','Noir'],['sepia','Sepia'],['fade','Faded'],['retro','Retro'],['dream','Dreamy']];
const PALETTE=['#ffffff','#111111','#fdf0e6','#ffd1dc','#d7f0ff','#e9ffd7','#2b2340','#ffe08a','#ff5e7e','#8b7bff'];
const GRADS=[['#ff9a9e','#fad0c4'],['#a18cd1','#fbc2eb'],['#84fab0','#8fd3f4'],['#f6d365','#fda085'],['#30cfd0','#330867'],['#0f0c29','#302b63']];
const STICKERS=['❤️','✨','🌸','🔥','😍','🌈','⭐','🎉','☀️','🌙','🦋','🍀','📸','💫','🥳','👑','🌊','🍕','🐶','🐍'];
const FONTS=[['system-ui,sans-serif','Clean',800],['Georgia,serif','Serif',700],['"Brush Script MT","Segoe Script",cursive','Script',400],['"Courier New",monospace','Type',700],['Impact,"Arial Black",sans-serif','Bold',400]];

let photos=[]; let pid=0;
let S=freshState();
let hist=[]; let sel=null; // {type:'cell',i} | {type:'ov',i}
const cv=$('#cv'), ctx=cv.getContext('2d');
const fcache=new Map();

function freshState(){return{layout:'mosaic',aspect:'4:5',seed:1,gap:14,radius:14,bgType:'color',bg:'#ffffff',g:0,order:[],cells:[],filter:'none',fstr:100,overlays:[],split:.5}}
function snap(){hist.push(JSON.stringify(S));if(hist.length>60)hist.shift()}
function undo(){if(!hist.length)return toast('Nothing to undo');S=JSON.parse(hist.pop());sel=null;ctxbar();draw();panel()}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('on'),2200)}
function busy(on,t){$('#busy').classList.toggle('hidden',!on);if(t)$('#busyText').textContent=t}
function show(id){$$('.view').forEach(v=>v.classList.toggle('active',v.id===id));scrollTo(0,0);if(id!=='booth')stopBooth();if(id==='home')loadProjects()}
const L=()=>LAYOUTS.find(l=>l.id===S.layout);
const AR=()=>ASPECTS.find(a=>a.id===S.aspect).r;
const LH=()=>Math.round(LW*AR());

// ---------- photo loading ----------
async function loadFile(file){
  let bmp;
  try{bmp=await createImageBitmap(file,{imageOrientation:'from-image'})}catch(e){
    bmp=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=URL.createObjectURL(file)})}
  const iw=bmp.width,ih=bmp.height,k=Math.min(1,2400/Math.max(iw,ih));
  const c=document.createElement('canvas');c.width=Math.round(iw*k);c.height=Math.round(ih*k);
  c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);bmp.close&&bmp.close();
  // thumb + saliency focus (edge energy + saturation), all local
  const t=document.createElement('canvas'),ts=48;t.width=ts;t.height=Math.max(1,Math.round(ts*c.height/c.width));
  const tc=t.getContext('2d');tc.drawImage(c,0,0,t.width,t.height);
  const d=tc.getImageData(0,0,t.width,t.height).data;let sx=0,sy=0,sw=0;
  for(let y=1;y<t.height-1;y++)for(let x=1;x<t.width-1;x++){const i=(y*t.width+x)*4,j=i+4,k2=i+t.width*4;
    const l=d[i]+d[i+1]+d[i+2];const e=Math.abs(l-(d[j]+d[j+1]+d[j+2]))+Math.abs(l-(d[k2]+d[k2+1]+d[k2+2]));
    const mx=Math.max(d[i],d[i+1],d[i+2]),mn=Math.min(d[i],d[i+1],d[i+2]);const cx=1-Math.abs(x/t.width-.5)*1.2,cy=1-Math.abs(y/t.height-.45)*1.2;
    const w=(e+(mx-mn)*.6)*cx*cy;sx+=x*w;sy+=y*w;sw+=w}
  const fx=sw?.5+(sx/sw/t.width-.5)*.8:.5,fy=sw?.5+(sy/sw/t.height-.5)*.8:.5;
  const th=document.createElement('canvas');th.width=160;th.height=Math.round(160*c.height/c.width);th.getContext('2d').drawImage(c,0,0,th.width,th.height);
  const thumb=await new Promise(r=>th.toBlob(b=>r(URL.createObjectURL(b)),'image/jpeg',.7));
  const date=(await readExifDate(file))||new Date(file.lastModified||Date.now());
  return{id:++pid,file,img:c,fx,fy,date,thumb};
}
async function addFiles(files,{auto=true,replace=false}={}){
  files=[...files].filter(f=>/^image\//.test(f.type)||/\.(jpe?g|png|webp|gif|heic|avif)$/i.test(f.name));
  if(!files.length)return;busy(true,'Loading photos on your device…');
  const out=[];for(const f of files.slice(0,40)){try{out.push(await loadFile(f))}catch(e){console.warn('skip',f.name)}}
  busy(false);if(!out.length)return toast("Couldn't read those photos");
  if(replace){photos=[];S=freshState();hist=[]}
  photos.push(...out);show('editor');
  if(auto||replace)autoCollage(false);else{syncCells();draw();panel()}
  if(files.length>40)toast('Using the first 40 photos');
}
function syncCells(){
  const lay=L();let n=Math.max(lay.min,Math.min(lay.max,photos.length||1));if(lay.mask){const c=Math.max(3,Math.ceil(Math.sqrt(n)));n=c*c}
  const ord=S.order.filter(i=>i<photos.length);
  for(let i=0;ord.length<n;i++)ord.push(ord.length<photos.length?firstUnused(ord):i%Math.max(1,photos.length));
  S.order=ord.slice(0,n);
  while(S.cells.length<n)S.cells.push({z:1,ox:0,oy:0,f:null});S.cells.length=n;
}
function firstUnused(o){for(let i=0;i<photos.length;i++)if(!o.includes(i))return i;return 0}

// ---------- filters (pixel based so they work in every browser) ----------
function filtered(p,f){
  f=f||'none';if(f==='none'&&S.fstr>=0)if(f==='none')return p.img;
  const key=p.id+f+S.fstr;if(fcache.has(key))return fcache.get(key);
  const c=document.createElement('canvas');c.width=p.img.width;c.height=p.img.height;const x=c.getContext('2d');x.drawImage(p.img,0,0);
  const im=x.getImageData(0,0,c.width,c.height),d=im.data,a=S.fstr/100;
  const fn={vivid:(r,g,b)=>{const l=(r+g+b)/3;return[l+(r-l)*1.45+6,l+(g-l)*1.45+4,l+(b-l)*1.45]},
    warm:(r,g,b)=>[r*1.1+12,g*1.03+6,b*.86],cool:(r,g,b)=>[r*.9,g*1.02,b*1.12+10],
    mono:(r,g,b)=>{const l=.3*r+.59*g+.11*b;return[l,l,l]},noir:(r,g,b)=>{let l=.3*r+.59*g+.11*b;l=(l-128)*1.5+118;return[l,l,l]},
    sepia:(r,g,b)=>[.393*r+.769*g+.189*b,.349*r+.686*g+.168*b,.272*r+.534*g+.131*b],
    fade:(r,g,b)=>[r*.82+40,g*.82+38,b*.82+44],retro:(r,g,b)=>[r*1.05+20,g*.95+12,b*.75+30],
    dream:(r,g,b)=>[r*.9+40,g*.85+30,b*.95+45]}[f];
  if(fn)for(let i=0;i<d.length;i+=4){const o=fn(d[i],d[i+1],d[i+2]);d[i]+= (o[0]-d[i])*a;d[i+1]+=(o[1]-d[i+1])*a;d[i+2]+=(o[2]-d[i+2])*a}
  x.putImageData(im,0,0);if(fcache.size>60)fcache.delete(fcache.keys().next().value);fcache.set(key,c);return c;
}

// ---------- geometry ----------
function cellRects(){
  const lay=L(),W=LW,H=LH(),n=S.order.length,g=S.gap;
  const raw=lay.fn(n,S.seed,W/H);
  if(lay.kind==='split')return raw.map(()=>({x:0,y:0,w:W,h:H,rot:0}));
  if(lay.kind==='polaroid'||lay.kind==='free')return raw.map(c=>({x:c.x*W,y:c.y*H,w:c.w*W,h:c.h*H,rot:c.rot||0}));
  return raw.map(c=>{const x0=c.x*W+(c.x<.001?g:g/2),y0=c.y*H+(c.y<.001?g:g/2);const x1=(c.x+c.w)*W-((c.x+c.w)>.999?g:g/2),y1=(c.y+c.h)*H-((c.y+c.h)>.999?g:g/2);
    return{x:x0,y:y0,w:Math.max(4,x1-x0),h:Math.max(4,y1-y0),rot:0}});
}
function rr(c,x,y,w,h,r){r=Math.max(0,Math.min(r,w/2,h/2));c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function maskPath(c,m,W,H){c.beginPath();const cx=W/2,cy=H/2,s=Math.min(W,H)*.46;
  if(m==='circle'){c.arc(cx,cy,s,0,Math.PI*2)}
  else if(m==='heart'){const y0=cy-s*.55;c.moveTo(cx,cy+s*.95);c.bezierCurveTo(cx-s*1.5,cy+s*.05,cx-s*1.0,y0-s*.75,cx,y0);c.bezierCurveTo(cx+s*1.0,y0-s*.75,cx+s*1.5,cy+s*.05,cx,cy+s*.95)}
  else{for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?s*.45:s*1.05;c.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r+s*.06)}}
  c.closePath()}
function drawCover(c,src,p,cell,r,st){
  const s=Math.max(r.w/src.width,r.h/src.height)*st.z,dw=src.width*s,dh=src.height*s;
  let dx=r.x+r.w/2-p.fx*dw+st.ox*r.w,dy=r.y+r.h/2-p.fy*dh+st.oy*r.h;
  dx=Math.min(r.x,Math.max(r.x+r.w-dw,dx));dy=Math.min(r.y,Math.max(r.y+r.h-dh,dy));
  c.drawImage(src,dx,dy,dw,dh)}

// ---------- render ----------
function render(c,scale,preview){
  const W=LW,H=LH(),lay=L();c.save();c.setTransform(scale,0,0,scale,0,0);
  // background
  if(S.bgType==='grad'){const gr=GRADS[S.g%GRADS.length];const lg=c.createLinearGradient(0,0,W,H);lg.addColorStop(0,gr[0]);lg.addColorStop(1,gr[1]);c.fillStyle=lg;c.fillRect(0,0,W,H)}
  else if(S.bgType==='blur'&&photos.length){const t=document.createElement('canvas'),p=photos[S.order[0]||0];t.width=24;t.height=Math.round(24*H/W);const tx=t.getContext('2d');
    drawCover(tx,p.img,p,0,{x:0,y:0,w:t.width,h:t.height},{z:1,ox:0,oy:0});c.imageSmoothingQuality='high';c.drawImage(t,0,0,W,H);c.fillStyle='#0002';c.fillRect(0,0,W,H)}
  else{c.fillStyle=S.bg;c.fillRect(0,0,W,H)}
  if(!photos.length){c.restore();return}
  const rects=cellRects();
  if(lay.kind==='film'){c.fillStyle='#111';c.fillRect(0,H*.06,W,H*.88);c.fillStyle=S.bgType==='color'?S.bg:'#f4f4f4';
    const hs=W/34;for(let x=hs*.5;x<W;x+=hs*1.6){rr(c,x,H*.075,hs,H*.03,4);c.fill();rr(c,x,H*.895,hs,H*.03,4);c.fill()}}
  if(lay.kind==='strip'){c.save();c.shadowColor='#0004';c.shadowBlur=30;c.fillStyle='#fff';rr(c,W*.04,H*.012,W*.92,H*.976,10);c.fill();c.restore()}
  if(lay.mask){c.save();maskPath(c,lay.mask,W,H);c.clip()}
  const order=S.order.map((pi,i)=>i);
  if(drag&&drag.mode==='swap'){order.splice(order.indexOf(drag.i),1);order.push(drag.i)}
  for(const i of order){
    const r=rects[i],p=photos[S.order[i]];if(!p||!r)continue;const st=S.cells[i];const src=filtered(p,st.f||S.filter);
    c.save();
    if(lay.kind==='split'){if(i===1){c.beginPath();c.rect(W*S.split,0,W,H);c.clip()}drawCover(c,src,p,i,r,st);c.restore();continue}
    let lift=drag&&drag.mode==='swap'&&drag.i===i;
    if(r.rot||lift){c.translate(r.x+r.w/2,r.y+r.h/2);c.rotate(r.rot);if(lift)c.scale(1.05,1.05);c.translate(-(r.x+r.w/2),-(r.y+r.h/2))}
    if(lay.kind==='polaroid'){const pad=r.w*.05;c.shadowColor='#0005';c.shadowBlur=24;c.shadowOffsetY=8;c.fillStyle='#fff';c.fillRect(r.x-pad,r.y-pad,r.w+pad*2,r.h+pad*2+r.w*.14);c.shadowColor='transparent';
      const ir={x:r.x,y:r.y,w:r.w,h:r.h};c.beginPath();c.rect(ir.x,ir.y,ir.w,ir.h);c.clip();drawCover(c,src,p,i,ir,st)}
    else{if(lay.kind==='free'){c.shadowColor='#0006';c.shadowBlur=26;c.shadowOffsetY=8;rr(c,r.x,r.y,r.w,r.h,S.radius);c.fillStyle='#000';c.fill();c.shadowColor='transparent'}
      rr(c,r.x,r.y,r.w,r.h,lay.kind==='film'?2:S.radius);c.clip();drawCover(c,src,p,i,r,st)}
    c.restore();
    if(preview&&((sel&&sel.type==='cell'&&sel.i===i)||(drag&&drag.mode==='swap'&&drag.over===i&&drag.i!==i))){c.save();
      if(r.rot){c.translate(r.x+r.w/2,r.y+r.h/2);c.rotate(r.rot);c.translate(-(r.x+r.w/2),-(r.y+r.h/2))}
      c.lineWidth=8;c.strokeStyle=drag&&drag.over===i?'#8b7bff':'#ff5e7e';rr(c,r.x+4,r.y+4,r.w-8,r.h-8,S.radius);c.stroke();c.restore()}
  }
  if(lay.mask)c.restore();
  if(lay.kind==='split'){const x=W*S.split;c.fillStyle='#fff';c.fillRect(x-3,0,6,H);c.beginPath();c.arc(x,H/2,34,0,7);c.fill();
    c.fillStyle='#222';c.font='700 30px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText('◀ ▶',x,H/2+1);
    c.font='800 34px system-ui';c.fillStyle='#fff';c.shadowColor='#000a';c.shadowBlur=10;c.textAlign='left';c.fillText('BEFORE',30,50);c.textAlign='right';c.fillText('AFTER',W-30,50);c.shadowColor='transparent'}
  // overlays
  S.overlays.forEach((o,i)=>{c.save();c.translate(o.x,o.y);c.rotate(o.rot||0);c.textAlign='center';c.textBaseline='middle';
    if(o.t==='emoji'){c.font=`${o.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;c.fillText(o.s,0,0)}
    else{const F=FONTS[o.font||0];c.font=`${F[2]} ${o.size}px ${F[0]}`;const lines=o.s.split('\n');const lh=o.size*1.15;
      lines.forEach((ln,k)=>{const y=(k-(lines.length-1)/2)*lh;
        if(o.box){const w=c.measureText(ln).width+o.size*.6;c.fillStyle=o.color==='#ffffff'?'#000a':'#fffd';rr(c,-w/2,y-lh/2,w,lh,o.size*.25);c.fill()}
        c.shadowColor=o.box?'transparent':'#0007';c.shadowBlur=o.size*.18;c.fillStyle=o.color;c.fillText(ln,0,y)})}
    if(preview&&sel&&sel.type==='ov'&&sel.i===i){const b=ovBox(o);c.setLineDash([12,10]);c.lineWidth=4;c.strokeStyle='#ff5e7e';c.strokeRect(-b.w/2,-b.h/2,b.w,b.h)}
    c.restore()});
  c.restore();
}
function ovBox(o){if(o.t==='emoji')return{w:o.size*1.25,h:o.size*1.25};ctx.save();const F=FONTS[o.font||0];ctx.font=`${F[2]} ${o.size}px ${F[0]}`;
  const lines=o.s.split('\n');const w=Math.max(...lines.map(l=>ctx.measureText(l).width))+o.size*.7;ctx.restore();return{w,h:lines.length*o.size*1.15+o.size*.3}}
let raf=0;function draw(){cancelAnimationFrame(raf);raf=requestAnimationFrame(drawNow)}
function drawNow(){const st=$('#stage');if(!st)return;const H=LH();const bw=st.clientWidth-24,bh=st.clientHeight-12;
  const s=Math.max(.05,Math.min(bw/LW,bh/H));const dpr=Math.min(2.5,devicePixelRatio||1);
  const w=Math.round(LW*s),h=Math.round(H*s);if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(h*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr)}
  cv.style.width=w+'px';cv.style.height=h+'px';ctx.clearRect(0,0,cv.width,cv.height);render(ctx,cv.width/LW,true)}
addEventListener('resize',draw);

// ---------- auto collage ----------
function autoCollage(record=true){
  if(!photos.length)return;if(record)snap();
  const n=photos.length;const opts=n===1?['grid','polaroid']:n===2?['cols','rows','split','polaroid']:n<=4?['mosaic','feature','grid','polaroid','free','film']:n<=6?['mosaic','feature','magazine','grid','polaroid','heart']:n<=9?['mosaic','feature','grid','heart','polaroid']:['mosaic','grid','heart','circle'];
  let pick=opts[Math.floor(Math.random()*opts.length)];if(pick===S.layout&&opts.length>1)pick=opts[(opts.indexOf(pick)+1)%opts.length];
  S.layout=pick;S.seed=1+Math.floor(Math.random()*9999);S.order=[];S.cells=[];
  const sorted=photos.map((p,i)=>i);for(let i=sorted.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[sorted[i],sorted[j]]=[sorted[j],sorted[i]]}S.order=sorted;
  const r=Math.random();if(['polaroid','free'].includes(pick)){S.bgType=r<.5?'blur':'grad';S.g=Math.floor(Math.random()*GRADS.length)}else if(r<.3){S.bgType='grad';S.g=Math.floor(Math.random()*GRADS.length)}else{S.bgType='color';S.bg=PALETTE[Math.floor(Math.random()*6)]}
  S.gap=[0,8,14,22][Math.floor(Math.random()*4)];S.radius=S.gap?[0,14,28][Math.floor(Math.random()*3)]:0;sel=null;ctxbar();
  syncCells();shuffleAnim();panel();
}
function shuffleAnim(){if(RM){draw();return}cv.animate([{transform:'scale(.94) rotate(-1deg)',opacity:.3},{transform:'none',opacity:1}],{duration:420,easing:'cubic-bezier(.2,.8,.2,1)'});draw()}

// ---------- gestures ----------
let drag=null;const ptrs=new Map();
function toL(e){const b=cv.getBoundingClientRect();return{x:(e.clientX-b.left)/b.width*LW,y:(e.clientY-b.top)/b.height*LH()}}
function hitCell(p){const rs=cellRects();for(let i=rs.length-1;i>=0;i--){const r=rs[i];let x=p.x,y=p.y;if(r.rot){const cx=r.x+r.w/2,cy=r.y+r.h/2,a=-r.rot;const dx=x-cx,dy=y-cy;x=cx+dx*Math.cos(a)-dy*Math.sin(a);y=cy+dx*Math.sin(a)+dy*Math.cos(a)}
  if(L().kind==='split')return p.x<LW*S.split?0:1;if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h*(L().kind==='polaroid'?1.15:1))return i}return -1}
function hitOv(p){for(let i=S.overlays.length-1;i>=0;i--){const o=S.overlays[i],b=ovBox(o);if(Math.abs(p.x-o.x)<b.w/2+10&&Math.abs(p.y-o.y)<b.h/2+10)return i}return -1}
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);const p=toL(e);ptrs.set(e.pointerId,p);
  if(ptrs.size===2&&drag){const [a,b]=[...ptrs.values()];drag.pinch={d:Math.hypot(a.x-b.x,a.y-b.y),z:drag.mode==='ov'?S.overlays[drag.i].size:S.cells[drag.i]?.z};clearTimeout(drag.lp);if(drag.mode==='swap')drag.mode='pan';return}
  if(ptrs.size>1)return;
  if(L().kind==='split'&&Math.abs(p.x-LW*S.split)<60){snap();drag={mode:'split',start:p,moved:true};return}
  const oi=hitOv(p);if(oi>=0){snap();drag={mode:'ov',i:oi,start:p,o:{x:S.overlays[oi].x,y:S.overlays[oi].y},moved:false};sel={type:'ov',i:oi};ctxbar();draw();return}
  const ci=hitCell(p);if(ci<0){sel=null;ctxbar();draw();return}
  snap();const st=S.cells[ci];drag={mode:'pan',i:ci,start:p,o:{x:st.ox,y:st.oy},moved:false};
  if(L().kind!=='split')drag.lp=setTimeout(()=>{if(drag&&!drag.moved){drag.mode='swap';drag.over=ci;navigator.vibrate&&navigator.vibrate(15);draw()}},380);
});
cv.addEventListener('pointermove',e=>{if(!drag||!ptrs.has(e.pointerId))return;const p=toL(e);ptrs.set(e.pointerId,p);
  if(drag.pinch&&ptrs.size>=2){const [a,b]=[...ptrs.values()];const r=Math.hypot(a.x-b.x,a.y-b.y)/drag.pinch.d;
    if(drag.mode==='ov')S.overlays[drag.i].size=Math.max(20,Math.min(600,drag.pinch.z*r));else S.cells[drag.i].z=Math.max(1,Math.min(5,drag.pinch.z*r));draw();return}
  const dx=p.x-drag.start.x,dy=p.y-drag.start.y;if(Math.hypot(dx,dy)>12){if(!drag.moved)clearTimeout(drag.lp);drag.moved=true}
  if(!drag.moved)return;
  if(drag.mode==='split'){S.split=Math.max(.05,Math.min(.95,p.x/LW))}
  else if(drag.mode==='ov'){S.overlays[drag.i].x=drag.o.x+dx;S.overlays[drag.i].y=drag.o.y+dy}
  else if(drag.mode==='swap'){drag.over=hitCell(p)}
  else{const r=cellRects()[drag.i];const st=S.cells[drag.i];const k=L().kind==='split'?1:1;st.ox=Math.max(-2,Math.min(2,drag.o.x+dx/r.w*k));st.oy=Math.max(-2,Math.min(2,drag.o.y+dy/r.h*k));clampCell(drag.i)}
  draw()});
function clampCell(i){const r=cellRects()[i],st=S.cells[i],p=photos[S.order[i]];if(!r||!p)return;const s=Math.max(r.w/p.img.width,r.h/p.img.height)*st.z;
  const mx=Math.max(0,(p.img.width*s-r.w)/r.w),my=Math.max(0,(p.img.height*s-r.h)/r.h);
  const lo=x=>x;st.ox=Math.max(-(mx)/1+(p.fx-.5)*0, Math.min(mx,st.ox));st.oy=Math.max(-my,Math.min(my,st.oy))}
function endPtr(e){ptrs.delete(e.pointerId);if(!drag)return;if(ptrs.size)return;clearTimeout(drag.lp);
  if(drag.mode==='swap'){if(drag.over>=0&&drag.over!==drag.i){const a=drag.i,b=drag.over;[S.order[a],S.order[b]]=[S.order[b],S.order[a]];[S.cells[a],S.cells[b]]=[S.cells[b],S.cells[a]];toast('Swapped')}else hist.pop()}
  else if(!drag.moved&&!drag.pinch){hist.pop();if(drag.mode==='pan'){sel=sel&&sel.type==='cell'&&sel.i===drag.i?null:{type:'cell',i:drag.i}}ctxbar()}
  drag=null;draw()}
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',endPtr);
cv.addEventListener('wheel',e=>{e.preventDefault();const p=toL(e);const oi=hitOv(p);if(oi>=0){const o=S.overlays[oi];o.size=Math.max(20,Math.min(600,o.size*(e.deltaY<0?1.08:.92)))}else{const ci=hitCell(p);if(ci<0)return;const st=S.cells[ci];st.z=Math.max(1,Math.min(5,st.z*(e.deltaY<0?1.08:.93)));clampCell(ci)}draw()},{passive:false});
cv.addEventListener('dblclick',e=>{const oi=hitOv(toL(e));if(oi>=0&&S.overlays[oi].t==='text')editText(oi)});

// ---------- context bar ----------
function ctxbar(){const b=$('#ctxbar');b.innerHTML='';if(!sel){b.classList.add('hidden');return}b.classList.remove('hidden');
  const add=(t,f)=>{const x=document.createElement('button');x.textContent=t;x.onclick=f;b.appendChild(x)};
  if(sel.type==='cell'){const i=sel.i;
    add('🔄 Replace',()=>{replaceIdx=i;$('#pick').multiple=false;$('#pick').click()});
    add('➕ Zoom in',()=>{snap();S.cells[i].z=Math.min(5,S.cells[i].z*1.2);draw()});
    add('➖ Zoom out',()=>{snap();S.cells[i].z=Math.max(1,S.cells[i].z/1.2);clampCell(i);draw()});
    add('🎯 Reset',()=>{snap();Object.assign(S.cells[i],{z:1,ox:0,oy:0,f:null});draw()});
    add('✦ Filter this photo',()=>{setTab('filter')});
    add('✕ Done',()=>{sel=null;ctxbar();draw()})}
  else{const i=sel.i,o=S.overlays[i];
    if(o.t==='text'){add('✏️ Edit',()=>editText(i));add('Aa Font',()=>{snap();o.font=((o.font||0)+1)%FONTS.length;draw()});
      add('🎨 Color',()=>{snap();const cs=['#ffffff','#111111','#ff5e7e','#ffe08a','#8b7bff','#84fab0'];o.color=cs[(cs.indexOf(o.color)+1)%cs.length];draw()});
      add('▭ Box',()=>{snap();o.box=!o.box;draw()})}
    add('↻ Tilt',()=>{snap();o.rot=((o.rot||0)+.12)%(Math.PI*2);draw()});
    add('＋ Bigger',()=>{snap();o.size*=1.15;draw()});add('－ Smaller',()=>{snap();o.size/=1.15;draw()});
    add('🗑 Delete',()=>{snap();S.overlays.splice(i,1);sel=null;ctxbar();draw()});add('✕ Done',()=>{sel=null;ctxbar();draw()})}}
function editText(i){const o=S.overlays[i];const v=prompt('Edit text',o.s);if(v!=null&&v.trim()){snap();o.s=v.slice(0,120);draw()}}

// ---------- panels ----------
let tab='layout';
function setTab(t){tab=t;$$('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));panel()}
$('#tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)setTab(b.dataset.tab)});
function el(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e}
function chip(label,on,fn,drawer){const b=el('button','chip'+(on?' on':''));if(drawer)b.appendChild(drawer);else b.appendChild(el('span','sw'));b.appendChild(el('span','',label));b.onclick=fn;return b}
function ctl(label,input){const d=el('div','ctl');d.appendChild(el('label','',label));d.appendChild(input);return d}
function range(min,max,val,fn){const r=document.createElement('input');r.type='range';r.min=min;r.max=max;r.value=val;r.oninput=()=>{fn(+r.value);draw()};r.onchange=()=>{};r.onpointerdown=()=>snap();return r}
function layoutThumb(lay){const c=document.createElement('canvas');c.width=88;c.height=88;const x=c.getContext('2d');c.style.width=c.style.height='44px';
  x.fillStyle='#2b2340';x.fillRect(0,0,88,88);const n=Math.max(lay.min,Math.min(lay.max,Math.max(photos.length,4)));const cells=lay.fn(n,3,1);
  if(lay.mask){x.save();maskPath(x,lay.mask,88,88);x.clip()}
  cells.forEach((r,i)=>{x.save();x.translate((r.x+r.w/2)*88,(r.y+r.h/2)*88);x.rotate(r.rot||0);x.fillStyle=['#ff5e7e','#8b7bff','#ffe08a','#84fab0','#bfe9ff'][i%5];
    const w=r.w*88-4,h=r.h*88-4;if(lay.kind==='split'){x.restore();return}x.fillRect(-w/2,-h/2,w,h);x.restore()});
  if(lay.kind==='split'){x.fillStyle='#ff5e7e';x.fillRect(0,0,44,88);x.fillStyle='#8b7bff';x.fillRect(44,0,44,88);x.fillStyle='#fff';x.fillRect(43,0,3,88)}
  if(lay.mask)x.restore();return c}
function panel(){const p=$('#panel');p.innerHTML='';
  if(tab==='layout'){const ch=el('div','chips');LAYOUTS.forEach(l=>ch.appendChild(chip(l.name,S.layout===l.id,()=>{snap();S.layout=l.id;if(l.kind==='strip'&&S.aspect!=='strip')S.aspect='strip';else if(l.kind!=='strip'&&S.aspect==='strip')S.aspect='4:5';syncCells();sel=null;ctxbar();shuffleAnim();panel()},layoutThumb(l))));p.appendChild(ch);
    const r=el('div','ctl');const sh=el('button','pill sm','🔀 Shuffle arrangement');sh.onclick=()=>{snap();S.seed=1+Math.floor(Math.random()*9999);const o=S.order;for(let i=o.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[o[i],o[j]]=[o[j],o[i]]}shuffleAnim()};r.appendChild(sh);p.appendChild(r)}
  if(tab==='size'){const ch=el('div','chips');ASPECTS.forEach(a=>{const c=document.createElement('canvas');c.width=88;c.height=88;c.style.width=c.style.height='44px';const x=c.getContext('2d');x.fillStyle='#2b2340';x.fillRect(0,0,88,88);
      const h=Math.min(76,76*a.r),w=h/a.r;x.fillStyle='#ff5e7e';x.fillRect(44-w/2,44-h/2,w,h);
      ch.appendChild(chip(a.name,S.aspect===a.id,()=>{snap();S.aspect=a.id;draw();panel()},c))});p.appendChild(ch)}
  if(tab==='style'){p.appendChild(ctl('Spacing',range(0,60,S.gap,v=>S.gap=v)));p.appendChild(ctl('Corners',range(0,80,S.radius,v=>S.radius=v)));
    const seg=el('div','seg');[['color','Color'],['grad','Gradient'],['blur','Photo blur']].forEach(([v,t])=>{const b=el('button',S.bgType===v?'on':'',t);b.onclick=()=>{snap();S.bgType=v;draw();panel()};seg.appendChild(b)});p.appendChild(ctl('Background',seg));
    const ch=el('div','chips');
    if(S.bgType==='grad')GRADS.forEach((g,i)=>{const s=el('span','sw');s.style.background=`linear-gradient(135deg,${g[0]},${g[1]})`;ch.appendChild(chip('',S.g===i,()=>{snap();S.g=i;draw();panel()},s))});
    else if(S.bgType==='color'){PALETTE.forEach(c=>{const s=el('span','sw');s.style.background=c;ch.appendChild(chip('',S.bg===c,()=>{snap();S.bg=c;draw();panel()},s))});
      const ci=document.createElement('input');ci.type='color';ci.value=S.bg;ci.oninput=()=>{S.bg=ci.value;draw()};ci.setAttribute('aria-label','Custom color');ch.appendChild(ci)}
    p.appendChild(ch)}
  if(tab==='filter'){const one=sel&&sel.type==='cell';p.appendChild(el('div','muted small',one?'Filter for the selected photo':'Filter for all photos (tap a photo to filter just that one)'));
    const ch=el('div','chips');const sp=photos[one?S.order[sel.i]:S.order[0]]||photos[0];
    FILTERS.forEach(([id,name])=>{const c=document.createElement('canvas');c.width=88;c.height=88;c.style.width=c.style.height='44px';
      if(sp){const t=document.createElement('canvas');t.width=88;t.height=88;const tx=t.getContext('2d');drawCover(tx,sp.img,sp,0,{x:0,y:0,w:88,h:88},{z:1,ox:0,oy:0});
        const fake={id:'t'+sp.id,img:t,fx:.5,fy:.5};c.getContext('2d').drawImage(filtered(fake,id),0,0)}
      const cur=one?(S.cells[sel.i].f||S.filter):S.filter;ch.appendChild(chip(name,cur===id,()=>{snap();if(one)S.cells[sel.i].f=id;else{S.filter=id;S.cells.forEach(c=>c.f=null)}draw();panel()},c))});
    p.appendChild(ch);p.appendChild(ctl('Strength',range(10,100,S.fstr,v=>{S.fstr=v})))}
  if(tab==='add'){const r=el('div','ctl');const b1=el('button','pill sm','Aa Add text');b1.onclick=()=>{const v=prompt('Your text','Best day ever');if(v&&v.trim())addOv({t:'text',s:v.slice(0,120),size:90,color:'#ffffff',font:0})};
    const b2=el('button','pill sm','📅 Date stamp');b2.onclick=()=>{const d=photos[S.order[0]]?.date||new Date();addOv({t:'text',s:d.toLocaleDateString(undefined,{month:'long',year:'numeric'}),size:60,color:'#ffe08a',font:3,box:false})};
    r.appendChild(b1);r.appendChild(b2);p.appendChild(r);const ch=el('div','chips');
    STICKERS.forEach(s=>{const b=el('button','chip');b.appendChild(el('span','sw',`<span class="emo">${s}</span>`));b.firstChild.style.fontSize='30px';b.firstChild.style.display='grid';b.firstChild.style.placeItems='center';b.firstChild.style.background='#2b2340';b.onclick=()=>addOv({t:'emoji',s,size:150});ch.appendChild(b)});p.appendChild(ch)}
  if(tab==='photos'){const g=el('div','photos');photos.forEach((ph,i)=>{const d=el('div','ph');const im=new Image();im.src=ph.thumb;im.alt='';d.appendChild(im);
      const x=el('button','','✕');x.setAttribute('aria-label','Remove photo');x.onclick=()=>{snap();photos.splice(i,1);S.order=S.order.filter(o=>o!==i).map(o=>o>i?o-1:o);S.cells=[];syncCells();draw();panel()};d.appendChild(x);g.appendChild(d)});
    const a=el('button','ph add','＋');a.setAttribute('aria-label','Add photos');a.onclick=()=>{replaceIdx=-1;$('#pick').multiple=true;$('#pick').click()};g.appendChild(a);p.appendChild(g)}
}
function addOv(o){snap();o.x=LW/2;o.y=LH()*(.2+Math.random()*.6);o.rot=o.t==='emoji'?(Math.random()-.5)*.5:0;S.overlays.push(o);sel={type:'ov',i:S.overlays.length-1};ctxbar();draw();
  if(!RM)cv.animate([{transform:'scale(1.02)'},{transform:'none'}],{duration:250})}

// ---------- export ----------
function renderBlob(res,fmt){const c=document.createElement('canvas');const s=Math.min(res,4096/LH(),4096/LW);c.width=Math.round(LW*s);c.height=Math.round(LH()*s);
  const x=c.getContext('2d');render(x,s,false);return new Promise(r=>c.toBlob(r,'image/'+fmt,.92))}
let exFmt='png',exRes=2,lastUrl=null;
function seg(id,cb){$(id).addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$$(id+' button').forEach(x=>x.classList.toggle('on',x===b));cb(b.dataset.v)})}
seg('#exFmt',v=>exFmt=v);seg('#exRes',v=>exRes=+v);
function openSheet(on){$('#sheet').classList.toggle('on',on);$('#sheetBg').classList.toggle('on',on)}
$('#btnExport').onclick=async()=>{if(!photos.length)return;sel=null;ctxbar();draw();const b=await renderBlob(.5,'jpeg');if(lastUrl)URL.revokeObjectURL(lastUrl);lastUrl=URL.createObjectURL(b);$('#exPreview').src=lastUrl;$('#exMsg').textContent='';openSheet(true)};
$('#sheetBg').onclick=()=>openSheet(false);
const fname=ext=>`snapcollage-${new Date().toISOString().slice(0,10)}.${ext}`;
function download(blob,name){const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)}
async function shareOrDownload(blob,name,forceDl){const f=new File([blob],name,{type:blob.type});
  if(!forceDl&&navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:'My SnapCollage'});done('Shared!');return}catch(e){if(e.name==='AbortError')return}}
  download(blob,name);done('Saved to your downloads')}
function done(msg){$('#exMsg').textContent=msg;toast(msg);$('#miniFollow').classList.remove('hidden');confetti()}
$('#exShare').onclick=async()=>{busy(true,'Making your high-res collage…');const b=await renderBlob(exRes,exFmt);busy(false);shareOrDownload(b,fname(exFmt==='png'?'png':'jpg'))};
$('#exDown').onclick=async()=>{busy(true,'Making your high-res collage…');const b=await renderBlob(exRes,exFmt);busy(false);shareOrDownload(b,fname(exFmt==='png'?'png':'jpg'),true)};
$('#exProject').onclick=async()=>{await saveProject();$('#exMsg').textContent='Saved on this phone. Find it on the home screen.';toast('Saved on this device')};
function confetti(){if(RM)return;const cs=['#ff5e7e','#8b7bff','#ffe08a','#84fab0','#bfe9ff'];for(let i=0;i<36;i++){const d=el('div','confetti');d.style.left=Math.random()*100+'vw';d.style.background=cs[i%5];d.style.animationDelay=Math.random()*.4+'s';document.body.appendChild(d);setTimeout(()=>d.remove(),2400)}}

// slideshow video (MediaRecorder, all local)
$('#exVideo').onclick=async()=>{
  if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){$('#exMsg').textContent="This browser can't record video. Try Chrome or a newer iPhone.";return}
  const types=['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm'];const type=types.find(t=>MediaRecorder.isTypeSupported(t));if(!type)return($('#exMsg').textContent='Video not supported here');
  const W=720,H=Math.round(720*AR()/ (AR()>2?1.5:1));const c=document.createElement('canvas');c.width=W;c.height=Math.min(1280,Math.round(720*AR()));const x=c.getContext('2d');
  const final=document.createElement('canvas');final.width=W;final.height=c.height;const fs=Math.min(W/LW,c.height/LH());const fx=final.getContext('2d');fx.fillStyle='#000';fx.fillRect(0,0,W,c.height);fx.save();fx.translate((W-LW*fs)/2,(c.height-LH()*fs)/2);render(fx,fs,false);fx.restore();
  const list=S.order.slice(0,12).map(i=>photos[i]);const per=1.7,fin=2.6,total=list.length*per+fin;
  const st=c.captureStream(30);const rec=new MediaRecorder(st,{mimeType:type,videoBitsPerSecond:5e6});const chunks=[];rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
  busy(true,'Recording slideshow… 0%');rec.start(200);const t0=performance.now();
  await new Promise(res=>{function frame(){const t=(performance.now()-t0)/1000;$('#busyText').textContent='Recording slideshow… '+Math.min(100,Math.round(t/total*100))+'%';
      x.fillStyle='#000';x.fillRect(0,0,W,c.height);const k=Math.floor(t/per);
      if(k<list.length){const p=list[k],u=(t-k*per)/per;const z=1.05+u*.12;drawCover(x,filtered(p,S.filter),p,0,{x:-(z-1)*W/2,y:-(z-1)*c.height/2,w:W*z,h:c.height*z},{z:1,ox:0,oy:0});
        if(u<.2){x.globalAlpha=1-u/.2;x.fillStyle='#000';x.fillRect(0,0,W,c.height);x.globalAlpha=1}}
      else{const u=Math.min(1,(t-list.length*per)/.5);x.globalAlpha=u;x.drawImage(final,0,0);x.globalAlpha=1}
      if(t<total)requestAnimationFrame(frame);else res()}frame()});
  rec.stop();await new Promise(r=>rec.onstop=r);busy(false);const blob=new Blob(chunks,{type:type.split(';')[0]});
  shareOrDownload(blob,fname(type.includes('mp4')?'mp4':'webm'));
};

// ---------- projects (IndexedDB, on this device only) ----------
function db(){return new Promise((res,rej)=>{const r=indexedDB.open('snapcollage',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects',{keyPath:'id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function tx(mode,fn){const d=await db();return new Promise((res,rej)=>{const t=d.transaction('projects',mode);const s=t.objectStore('projects');const out=fn(s);t.oncomplete=()=>res(out.result);t.onerror=()=>rej(t.error)})}
let projId=null;
async function saveProject(){const thumb=await renderBlob(.3,'jpeg');projId=projId||Date.now();
  const pics=await Promise.all(photos.map(p=>new Promise(r=>p.img.toBlob(b=>r({blob:b,fx:p.fx,fy:p.fy,date:+p.date}),'image/jpeg',.9))));
  await tx('readwrite',s=>s.put({id:projId,updated:Date.now(),thumb,state:S,photos:pics}))}
async function loadProjects(){let all=[];try{all=await tx('readonly',s=>s.getAll())}catch(e){}
  const w=$('#projects');w.innerHTML='';$('#projectsWrap').classList.toggle('hidden',!all.length);
  all.sort((a,b)=>b.updated-a.updated).forEach(pr=>{const d=el('div','proj');const im=new Image();im.src=URL.createObjectURL(pr.thumb);im.alt='Saved collage';d.appendChild(im);
    d.onclick=()=>openProject(pr);const x=el('button','del','✕');x.setAttribute('aria-label','Delete');x.onclick=async e=>{e.stopPropagation();if(confirm('Delete this collage from this phone?')){await tx('readwrite',s=>s.delete(pr.id));loadProjects()}};d.appendChild(x);w.appendChild(d)})}
async function openProject(pr){busy(true,'Opening…');photos=[];for(const q of pr.photos){const p=await loadFile(new File([q.blob],'p.jpg',{type:'image/jpeg',lastModified:q.date}));p.fx=q.fx;p.fy=q.fy;p.date=new Date(q.date);photos.push(p)}
  S=Object.assign(freshState(),pr.state);projId=pr.id;hist=[];busy(false);show('editor');syncCells();draw();panel()}

// ---------- memories ----------
let memPhotos=[];
$('#memPick').onclick=()=>{pickMode='mem';$('#pick').multiple=true;$('#pick').click()};
async function buildMemories(files){busy(true,'Reading photo dates on your device…');memPhotos=[];
  for(const f of [...files].slice(0,150)){const d=(await readExifDate(f))||new Date(f.lastModified);memPhotos.push({f,d,u:URL.createObjectURL(f)})}busy(false);
  const groups={};memPhotos.forEach(m=>{const k=m.d.getFullYear()+'-'+String(m.d.getMonth()+1).padStart(2,'0');(groups[k]=groups[k]||[]).push(m)});
  const years={};memPhotos.forEach(m=>{(years[m.d.getFullYear()]=years[m.d.getFullYear()]||[]).push(m)});
  const list=$('#memList');list.innerHTML='';let delay=0;
  const item=(title,sub,arr,isYear)=>{const b=el('button','mem');b.style.animationDelay=(delay+=.05)+'s';const t=el('div','thumbs');arr.slice(0,4).forEach(m=>{const i=new Image();i.src=m.u;i.alt='';t.appendChild(i)});
    b.appendChild(t);b.appendChild(el('div','',`<b>${title}</b><small>${sub}</small>`));b.onclick=()=>openMemory(arr,title,isYear);list.appendChild(b)};
  Object.keys(years).sort().reverse().forEach(y=>{const arr=years[y];if(arr.length>=4){const byM={};arr.forEach(m=>byM[m.d.getMonth()]=byM[m.d.getMonth()]||m);const pick=Object.values(byM);
    const extra=arr.filter(m=>!pick.includes(m));while(pick.length<Math.min(9,arr.length))pick.push(extra.shift());item(`✨ ${y} recap`,`${pick.length} highlights from ${arr.length} photos`,pick,true)}});
  Object.keys(groups).sort().reverse().forEach(k=>{const [y,m]=k.split('-');const name=new Date(+y,+m-1,1).toLocaleDateString(undefined,{month:'long',year:'numeric'});item(name,groups[k].length+' photos',groups[k])});
  if(!memPhotos.length)list.innerHTML='<p class="muted">No photos found.</p>'}
async function openMemory(arr,title,isYear){await addFiles(arr.slice(0,isYear?12:16).map(m=>m.f),{replace:true});
  S.overlays.push({t:'text',s:title.replace('✨ ',''),size:isYear?120:80,color:'#ffffff',font:isYear?4:1,box:false,x:LW/2,y:LH()-140,rot:0});draw()}

// ---------- photo booth ----------
let stream=null,facing='user',shots=[];
async function startBooth(){show('booth');shots=[];$('#boothThumbs').innerHTML='';
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing,width:{ideal:1280},height:{ideal:1280}},audio:false});$('#boothVideo').srcObject=stream;$('#boothMsg').textContent='Camera video stays on this device.'}
  catch(e){$('#boothMsg').textContent='Camera unavailable. Allow camera access, or use "Take a photo" instead.'}}
function stopBooth(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}}
$('#boothFlip').onclick=()=>{facing=facing==='user'?'environment':'user';stopBooth();startBooth()};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
$('#boothGo').onclick=async()=>{const v=$('#boothVideo');if(!stream||!v.videoWidth)return toast('Camera not ready');$('#boothGo').disabled=true;shots=[];$('#boothThumbs').innerHTML='';
  for(let s=0;s<4;s++){for(const n of [3,2,1]){const c=$('#boothCount');c.textContent=n;c.classList.remove('go');void c.offsetWidth;c.classList.add('go');await wait(RM?500:800)}
    $('#boothCount').textContent='';const f=$('#boothFlash');f.classList.remove('go');void f.offsetWidth;f.classList.add('go');
    const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;const x=c.getContext('2d');if(facing==='user'){x.translate(c.width,0);x.scale(-1,1)}x.drawImage(v,0,0);
    const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.92));shots.push(new File([b],`booth${s}.jpg`,{type:'image/jpeg',lastModified:Date.now()}));
    const i=new Image();i.src=URL.createObjectURL(b);i.alt='';$('#boothThumbs').appendChild(i);await wait(500)}
  $('#boothGo').disabled=false;stopBooth();await addFiles(shots,{replace:true});
  S.layout='strip';S.aspect='strip';S.bgType='color';S.bg='#ffffff';S.gap=24;S.radius=6;S.filter='mono';syncCells();
  S.overlays=[{t:'text',s:new Date().toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}),size:64,color:'#111111',font:3,x:LW/2,y:LH()*.94,rot:0}];draw();panel()};

// ---------- wiring ----------
let replaceIdx=-1,pickMode='edit';
$('#btnPick').onclick=()=>{pickMode='new';$('#pick').multiple=true;$('#pick').click()};
$('#btnCam').onclick=()=>$('#cam').click();
$('#btnBooth').onclick=startBooth;$('#btnMem').onclick=()=>show('memories');
$('#cam').onchange=e=>{const f=[...e.target.files];e.target.value='';if(!f.length)return;if($('#editor').classList.contains('active')&&photos.length)addFiles(f,{auto:false});else{projId=null;addFiles(f,{replace:true})}};
$('#pick').onchange=async e=>{const f=[...e.target.files];e.target.value='';if(!f.length)return;
  if(pickMode==='mem'){pickMode='edit';return buildMemories(f)}
  if(pickMode==='new'){pickMode='edit';projId=null;return addFiles(f,{replace:true})}
  if(replaceIdx>=0){snap();const p=await loadFile(f[0]);photos.push(p);S.order[replaceIdx]=photos.length-1;S.cells[replaceIdx]={z:1,ox:0,oy:0,f:null};replaceIdx=-1;draw();panel();return}
  addFiles(f,{auto:false})};
$$('[data-back]').forEach(b=>b.onclick=()=>show('home'));
$('#edBack').onclick=async()=>{if(photos.length){await saveProject().catch(()=>{});toast('Saved on this device')}show('home')};
$('#btnAuto').onclick=()=>autoCollage(true);$('#btnUndo').onclick=undo;
addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undo()}if((e.key==='Delete'||e.key==='Backspace')&&sel&&sel.type==='ov'&&document.activeElement===document.body){snap();S.overlays.splice(sel.i,1);sel=null;ctxbar();draw()}});
// drop files on desktop
addEventListener('dragover',e=>e.preventDefault());addEventListener('drop',e=>{e.preventDefault();if(e.dataTransfer.files.length){projId=null;addFiles(e.dataTransfer.files,{replace:!photos.length})}});

// install help
let deferred=null;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;$('#btnInstall').classList.remove('hidden');$('#installTip').classList.remove('hidden');$('#installText').textContent='Add it to your home screen. It opens full-screen and works with no internet.'});
$('#btnInstall').onclick=async()=>{if(!deferred)return;deferred.prompt();await deferred.userChoice;deferred=null;$('#installTip').classList.add('hidden')};
const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
if(!standalone&&/iphone|ipad|ipod/i.test(navigator.userAgent)){$('#installTip').classList.remove('hidden');$('#installText').textContent='On iPhone: tap the Share button in Safari, then "Add to Home Screen". It works offline after that.'}
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
loadProjects();
window.__sc={get S(){return S},get photos(){return photos},addFiles,autoCollage,render};
