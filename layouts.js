// Collage layouts. Each returns normalized cells {x,y,w,h,rot}.
(function(){
function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return((s>>>0)%10000)/10000}}
function grid(n){const c=Math.ceil(Math.sqrt(n)),r=Math.ceil(n/c),out=[];
  for(let i=0;i<n;i++){const row=Math.floor(i/c);const inRow=row===r-1?n-c*(r-1):c;const col=i-row*c;
    out.push({x:col/inRow,y:row/r,w:1/inRow,h:1/r})}return out}
function cols(n){return Array.from({length:n},(_,i)=>({x:i/n,y:0,w:1/n,h:1}))}
function rows(n){return Array.from({length:n},(_,i)=>({x:0,y:i/n,w:1,h:1/n}))}
function feature(n){if(n<2)return grid(n);const k=n-1;const t=k>3?0.62:0.68;const out=[{x:0,y:0,w:1,h:t}];
  const per=k>4?Math.ceil(k/2):k;const lines=Math.ceil(k/per);
  for(let i=0;i<k;i++){const l=Math.floor(i/per);const inL=l===lines-1?k-per*(lines-1):per;const c=i-l*per;
    out.push({x:c/inL,y:t+l*(1-t)/lines,w:1/inL,h:(1-t)/lines})}return out}
function magazine(n){if(n<3)return cols(n);const k=n-1;const out=[{x:0,y:0,w:0.6,h:1}];
  for(let i=0;i<k;i++)out.push({x:0.6,y:i/k,w:0.4,h:1/k});return out}
function mosaic(n,seed){const r=rng(seed);const out=[];
  (function split(x,y,w,h,k,dir){if(k===1){out.push({x,y,w,h});return}
    const a=Math.floor(k/2);let f=a/k;f=Math.min(0.75,Math.max(0.25,f+(r()-0.5)*0.25));
    const vert=dir===undefined?w>=h:dir;
    if(vert){split(x,y,w*f,h,a);split(x+w*f,y,w*(1-f),h,k-a)}else{split(x,y,w,h*f,a);split(x,y+h*f,w,h*(1-f),k-a)}
  })(0,0,1,1,n);return out}
function scatter(n,seed,aspect){const r=rng(seed);const out=[];const g=grid(n);
  const sz=Math.min(0.62,1.25/Math.sqrt(n+0.5));
  g.forEach((c,i)=>{const cx=c.x+c.w/2+(r()-0.5)*c.w*0.35,cy=c.y+c.h/2+(r()-0.5)*c.h*0.35;
    const w=sz,h=sz*aspect*1.18;out.push({x:cx-w/2,y:cy-h/2,w,h,rot:(r()-0.5)*0.42})});return out}
function free(n,seed,aspect){const r=rng(seed+7);const out=[];const g=grid(n);
  g.forEach(c=>{const w=c.w*1.15,h=c.h*1.15;out.push({x:c.x+c.w/2-w/2+(r()-0.5)*0.05,y:c.y+c.h/2-h/2+(r()-0.5)*0.05,w,h,rot:(r()-0.5)*0.16})});return out}
function film(n){const out=[];const top=0.12,h=0.76;for(let i=0;i<n;i++)out.push({x:0.04+i*(0.92/n),y:top,w:0.92/n,h});return out}
function strip(n){const out=[];const top=0.03,bot=0.12,h=(1-top-bot)/n;for(let i=0;i<n;i++)out.push({x:0.08,y:top+i*h,w:0.84,h});return out}
function split2(n){return [{x:0,y:0,w:1,h:1},{x:0,y:0,w:1,h:1}]}
window.LAYOUTS=[
 {id:'mosaic',name:'Mosaic',fn:mosaic,min:1,max:16},
 {id:'grid',name:'Grid',fn:grid,min:1,max:25},
 {id:'feature',name:'Hero',fn:feature,min:2,max:9},
 {id:'magazine',name:'Magazine',fn:magazine,min:3,max:6},
 {id:'cols',name:'Columns',fn:cols,min:2,max:6},
 {id:'rows',name:'Rows',fn:rows,min:2,max:6},
 {id:'polaroid',name:'Polaroids',fn:scatter,min:1,max:12,kind:'polaroid'},
 {id:'free',name:'Freeform',fn:free,min:1,max:12,kind:'free'},
 {id:'film',name:'Filmstrip',fn:film,min:2,max:6,kind:'film'},
 {id:'strip',name:'Photo strip',fn:strip,min:2,max:5,kind:'strip'},
 {id:'heart',name:'Heart',fn:grid,min:4,max:25,mask:'heart'},
 {id:'circle',name:'Circle',fn:grid,min:4,max:25,mask:'circle'},
 {id:'star',name:'Star',fn:grid,min:4,max:25,mask:'star'},
 {id:'split',name:'Before / After',fn:split2,min:2,max:2,kind:'split'}
];
})();
