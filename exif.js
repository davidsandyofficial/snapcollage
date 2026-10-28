// Tiny local EXIF date reader (JPEG only). Nothing leaves the device.
window.readExifDate=async function(file){
  try{
    const buf=await file.slice(0,262144).arrayBuffer();const v=new DataView(buf);
    if(v.getUint16(0)!==0xFFD8)return null;
    let o=2;
    while(o<v.byteLength-4){
      const m=v.getUint16(o);const len=v.getUint16(o+2);
      if(m===0xFFE1&&v.getUint32(o+4)===0x45786966){
        const t=o+10;const le=v.getUint16(t)===0x4949;
        const u16=p=>v.getUint16(p,le),u32=p=>v.getUint32(p,le);
        const ifd=(p)=>{const n=u16(p);const out={};for(let i=0;i<n;i++){const e=p+2+i*12;out[u16(e)]={type:u16(e+2),count:u32(e+4),off:e+8}}return out};
        const str=(en)=>{const p=en.count>4?t+u32(en.off):en.off;let s='';for(let i=0;i<en.count-1;i++)s+=String.fromCharCode(v.getUint8(p+i));return s};
        const i0=ifd(t+u32(t+4));let s=null;
        if(i0[0x8769]){const ex=ifd(t+u32(i0[0x8769].off));if(ex[0x9003])s=str(ex[0x9003])}
        if(!s&&i0[0x132])s=str(i0[0x132]);
        if(s){const m2=s.match(/(\d{4}):(\d{2}):(\d{2})/);if(m2)return new Date(+m2[1],+m2[2]-1,+m2[3])}
        return null;
      }
      if((m&0xFF00)!==0xFF00)break;o+=2+len;
    }
  }catch(e){}
  return null;
};
