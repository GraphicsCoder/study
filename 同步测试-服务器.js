/* 服务器设置面板：地址校验、测试连接的三种结果、保存后生效 */
const fs=require("fs"), vm=require("vm");
const SRC=fs.readFileSync("同步.js","utf8");

function makeDoc(){
  const byId={};
  function el(tag){
    const e={tag,dataset:{},children:[],style:{},id:"",className:"",textContent:"",title:"",
      type:"",value:"",checked:false,_html:"",
      get innerHTML(){return this._html;},
      set innerHTML(h){ this._html=h;
        for(const m of h.matchAll(/id="([^"]+)"/g)){ const c=el("div"); c.id=m[1]; byId[m[1]]=c; } },
      appendChild(c){ this.children.push(c); if(c.id) byId[c.id]=c; return c; },
      addEventListener(){}, querySelector(s){ return byId[s.replace("#","")]||null; }, focus(){},
      classList:{_s:new Set(),add(c){this._s.add(c)},remove(c){this._s.delete(c)},contains(c){return this._s.has(c)}}};
    return e;
  }
  const doc={_byId:byId,head:el("head"),body:el("body"),createElement:el,addEventListener(){},
    currentScript:{dataset:{key:"math-tdsjs-v1"}}};
  let n=0; const orig=doc.createElement;
  doc.createElement=t=>{const e=orig(t);
    if(++n===2){e.id="syncchip";byId.syncchip=e;}
    if(t==="div"&&n===3){e.id="syncmask";byId.syncmask=e;}
    return e;};
  return doc;
}

function launch({store={}, fetchImpl}={}){
  const s=Object.assign({__sync_mode__:"worker"}, store);
  const ls={getItem:k=>k in s?s[k]:null,setItem:(k,v)=>{s[k]=String(v)},removeItem:k=>{delete s[k]}};
  const doc=makeDoc();
  const ctx={document:doc,window:{addEventListener(){}},localStorage:ls,
    sessionStorage:{getItem:()=>null,setItem(){}},navigator:{},location:{reload(){}},console,
    confirm:()=>true,setTimeout:(fn,ms)=>{ if(ms!==15000&&ms!==600) fn(); return 0; },clearTimeout:()=>{},
    fetch:fetchImpl||(()=>Promise.reject(new TypeError("Failed to fetch")))};
  vm.createContext(ctx); vm.runInContext(SRC,ctx);
  return {store:s,doc,$:id=>doc._byId[id],chip:doc._byId.syncchip,
          mask:doc._byId.syncmask,html:()=>doc._byId.syncmask.children[0]._html};
}

const out=[]; const ok=(n,c,e)=>out.push((c?"PASS ":"FAIL ")+n+(c?"":"  <<< "+e));
const tick=()=>new Promise(r=>setImmediate(()=>setImmediate(()=>setImmediate(r))));
const json=o=>()=>Promise.resolve({status:200,json:()=>Promise.resolve(o)});

(async()=>{
  // 1. 入口：未登录面板能进服务器设置
  let a=launch(); await tick();
  a.chip.onclick();                       // 打开登录面板
  ok("登录面板有服务器设置入口", !!a.$("syncsrv"));
  a.$("syncsrv").onclick();
  ok("能进服务器设置", !!a.$("syncapi") && !!a.$("syncping"), "");
  ok("地址预填了默认值", /workers\.dev/.test(a.$("syncapi").value), a.$("syncapi").value);

  // 2. 地址格式校验
  a.$("syncapi").value="study-sync.abc.workers.dev";    // 少了协议头
  a.$("syncping").onclick(); await tick();
  ok("缺 https:// 会被拦住", /https:\/\/ 开头/.test(a.$("synctest")._html), a.$("synctest")._html);

  // 3. 连不上 → 提示没部署
  let b=launch(); await tick();
  b.chip.onclick(); b.$("syncsrv").onclick();
  b.$("syncapi").value="https://nope.example.workers.dev";
  b.$("syncping").onclick(); await tick();
  ok("连不上时指出「没部署」", /没有部署 Worker/.test(b.$("synctest")._html), b.$("synctest")._html.slice(0,60));

  // 4. KV 没绑定 → 精确指出
  let c=launch({fetchImpl:json({ok:false,err:"KV 没绑定：Worker 的 Settings 里变量名必须正好是 STUDY"})});
  await tick(); c.chip.onclick(); c.$("syncsrv").onclick();
  c.$("syncapi").value="https://ok.example.workers.dev";
  c.$("syncping").onclick(); await tick();
  ok("认出 KV 没绑定", /KV 还没绑定/.test(c.$("synctest")._html), c.$("synctest")._html.slice(0,60));
  ok("并给出变量名 STUDY", /STUDY/.test(c.$("synctest")._html));

  // 5. 一切正常
  let d=launch({fetchImpl:json({ok:true,blob:{}})});
  await tick(); d.chip.onclick(); d.$("syncsrv").onclick();
  d.$("syncapi").value="https://good.example.workers.dev";
  d.$("syncping").onclick(); await tick();
  ok("连通时给出肯定答复", /连接正常/.test(d.$("synctest")._html), d.$("synctest")._html.slice(0,50));

  // 6. 保存后写进 localStorage，并被后续请求采用
  let used=null;
  let e=launch({fetchImpl:(u)=>{used=u; return json({ok:true,blob:{}})();}});
  await tick(); e.chip.onclick(); e.$("syncsrv").onclick();
  e.$("syncapi").value="https://mine.example.workers.dev/";   // 故意带结尾斜杠
  e.$("syncsave").onclick();
  ok("保存进 localStorage", e.store.__sync_api__==="https://mine.example.workers.dev",
     e.store.__sync_api__);
  ok("结尾斜杠被去掉", !/\/$/.test(e.store.__sync_api__||""), e.store.__sync_api__);

  // 7. 登录后请求确实走新地址
  let used2=null;
  let f=launch({store:{__sync_code__:"lisa2026", __sync_api__:"https://mine.example.workers.dev"},
                fetchImpl:(u)=>{used2=u; return json({ok:true,blob:{}})();}});
  await tick();
  ok("请求走的是新地址", used2&&used2.indexOf("https://mine.example.workers.dev/?k=")===0, used2);

  // 8. 没设过时走默认地址
  let used3=null;
  let g=launch({store:{__sync_code__:"lisa2026"},fetchImpl:(u)=>{used3=u; return json({ok:true,blob:{}})();}});
  await tick();
  ok("没设过时用默认地址", used3&&used3.indexOf("https://study-sync.eden-meng.workers.dev/?k=")===0, used3);

  console.log(out.join("\n"));
  const bad=out.filter(x=>x.startsWith("FAIL")).length;
  console.log(bad?`\n${bad} 项未通过`:`\n全部 ${out.length} 项通过`);
  process.exit(bad?1:0);
})();
