// ==UserScript==
// @name         DuoBot
// @version      3.6.9
// @author       local
// @namespace    http://tampermonkey.net/
// @description  Auto-complete Duolingo lessons with smart GUI
// @match        https://*.duolingo.com/*
// @match        https://*.duolingo.cn/*
// @grant        none
// @run-at       document-start
// @license      MIT
// ==/UserScript==

/* ═══ PHASE 1: FETCH PATCH (before Duolingo JS loads) ═══ */
;(function(){
  const _f=window.fetch.bind(window);
  const U=/\/\d{4}-\d{2}-\d{2}\/users\//;
  window.fetch=async function(i,o){
    const url=typeof i==='string'?i:i?.url??'';
    const m=(o?.method??(typeof i==='object'?i.method:'GET')??'GET').toUpperCase();
    if(m==='POST'&&url.includes('remove-heart'))
      return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});
    const r=await _f(i,o);
    if(url.includes('/sessions') || url.includes('/legendary') || url.includes('/practice') || url.includes('/challenge')){
      try{
        r.clone().json().then(d=>{
          if(Array.isArray(d?.challenges))window.__DUO_CHALLENGES__=d.challenges;
          else if(Array.isArray(d?.session?.challenges))window.__DUO_CHALLENGES__=d.session.challenges;
        }).catch(()=>{});
      }catch(_){}
    }
    if(m==='GET'&&U.test(url)&&!url.includes('/shop-items')){
      try{
        const d=await r.clone().json();let ok=false;
        const p=u=>{if(!u)return;
          if(u.health){u.health.unlimitedHeartsAvailable=true;u.health.hearts=u.health.maxHearts??5;ok=true;}
          u.hasPlus=true;
          if(typeof u.premium_subscription!=='string'){
            u.premium_subscription={vendor:'STRIPE',status:'ACTIVE',renewing:true,isFamilyPlan:true,expectedExpiration:9999999999000};ok=true;}
        };
        p(d);if(Array.isArray(d?.users))d.users.forEach(p);
        if(ok)return new Response(JSON.stringify(d),{status:r.status,headers:r.headers});
      }catch(_){}
    }
    return r;
  };
})();

/* ═══ PHASE 2: MAIN ═══ */
;(function(){
'use strict';
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
else boot();

function boot(){

// ─── UTILS ────────────────────────────────────────────────────────────────
const CE=()=>new MouseEvent('click',{view:window,bubbles:true,cancelable:true});

function clickEl(el){
  if(!el)return false;
  const target=el.closest('button, [role="button"], [role="radio"], [data-test*="choice"], [data-test*="token"], [data-test="stories-choice"]')||el;
  try{
    if(typeof target.click==='function')target.click();
    else target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
  }catch(_){
    try{target.click();}catch(__){}
  }
  return true;
}

function dynamicInput(el,text){
  if(!el)return;
  const k=el.tagName==='SPAN'?'textContent':'value';
  const prev=el[k]; el[k]=text;
  const e=new Event('input',{bubbles:true}); e.simulated=true;
  if(el._valueTracker)el._valueTracker.setValue(prev);
  el.dispatchEvent(e);
}

function getProps(el){
  const k=Object.keys(el).find(x=>/^__reactProps/.test(x));
  return k?el[k]:null;
}

function getFiber(el){
  const k=Object.keys(el).find(x=>/^__reactFiber/.test(x));
  return k?el[k]:null;
}

function findFromFiber(el){
  let f=getFiber(el);
  let d=0;
  while(f && d<50){
    const p=f.memoizedProps;
    if(p && typeof p==='object'){
      if(p.challenge&&typeof p.challenge==='object')return p.challenge;
      if(p.currentChallenge&&typeof p.currentChallenge==='object')return p.currentChallenge;
      if(p.activeChallenge&&typeof p.activeChallenge==='object')return p.activeChallenge;
      if(p.item?.challenge&&typeof p.item.challenge==='object')return p.item.challenge;
      if(p.slide?.challenge&&typeof p.slide.challenge==='object')return p.slide.challenge;
      if(p.slide?.currentChallenge&&typeof p.slide.currentChallenge==='object')return p.slide.currentChallenge;
      for(const k of Object.keys(p)){
        const v=p[k];
        if(v&&typeof v==='object'&&!Array.isArray(v)&&typeof v.type==='string'&&(v.correctIndex!==undefined||v.choices||v.correctTokens||v.correctSolutions||v.correctIndices||v.displayTokens||v.pairs)){
          return v;
        }
      }
    }
    let s=f.memoizedState;
    let hd=0;
    while(s && hd<20){
      const ms=s.memoizedState;
      if(ms&&typeof ms==='object'){
        if(ms.challenge&&typeof ms.challenge==='object')return ms.challenge;
        if(ms.currentChallenge&&typeof ms.currentChallenge==='object')return ms.currentChallenge;
        if(typeof ms.type==='string'&&(ms.correctIndex!==undefined||ms.choices||ms.correctTokens||ms.correctSolutions||ms.tokens||ms.pairs))return ms;
      }
      if(s.challenge&&typeof s.challenge==='object')return s.challenge;
      s=s.next;
      hd++;
    }
    const sn=f.stateNode;
    if(sn){
      const sp=sn.props;
      if(sp?.challenge&&typeof sp.challenge==='object')return sp.challenge;
      if(sp?.currentChallenge&&typeof sp.currentChallenge==='object')return sp.currentChallenge;
      const ss=sn.state;
      if(ss?.challenge&&typeof ss.challenge==='object')return ss.challenge;
    }
    f=f.return;
    d++;
  }
  return null;
}

// Recursive search props without getting stuck in fiber circular refs
function deepFind(obj,d=0,seen=new Set()){
  if(!obj||d>25||seen.has(obj))return null;
  if(typeof obj!=='object')return null;
  seen.add(obj);

  const isCh=x=>x&&typeof x==='object'&&(x.type||x.challengeType);
  if(isCh(obj.challenge))return obj.challenge;
  if(isCh(obj.currentChallenge))return obj.currentChallenge;
  if(isCh(obj.activeChallenge))return obj.activeChallenge;
  if(isCh(obj.storyChallenge))return obj.storyChallenge;
  if(isCh(obj.question))return obj.question;

  if(Array.isArray(obj)){
    for(let i=0;i<obj.length;i++){
      const r=deepFind(obj[i],d+1,seen);
      if(r)return r;
    }
    return null;
  }

  for(const k of Object.keys(obj)){
    if(k==='_owner'||k==='_source'||k==='_self'||k==='stateNode'||k==='child'||k==='sibling'||k==='return')continue;
    try{
      if(typeof obj[k]==='object'&&obj[k]!==null){
        const r=deepFind(obj[k],d+1,seen);
        if(r)return r;
      }
    }catch(_){}
  }
  return null;
}

function cleanPillText(raw){
  return (raw||'').replace(/^\s*\d+[\s\n\r]+/, '').replace(/[\s\n\r]+\d+\s*$/, '').trim().toLowerCase();
}

// Normalisasi teks: kolaps blank (…, _, ., spasi beruntun) jadi satu spasi — untuk matcher soal
function normText(s){
  return String(s||'').toLowerCase().replace(/[\u2026…_.*·•]+/g,' ').replace(/\s+/g,' ').trim();
}

function getPills(){
  const specific=Array.from(document.querySelectorAll(
    '[data-test*="tap-token"], [data-test*="choice"], [data-test="word-bank"] button, ' +
    '[data-test="word-bank"] [role="button"], [role="radiogroup"] [role="radio"], ' +
    '[data-test="stories-choice"]'
  ));
  const challengeArea=document.querySelector('[data-test*="challenge"], [data-test="challenge"], main, #root');
  const allInArea=challengeArea?Array.from(challengeArea.querySelectorAll('button, [role="button"], [role="radio"]')):[];
  const combined=Array.from(new Set([...specific, ...allInArea]));

  return combined.filter(el=>{
    if(el.matches('[data-test="player-next"], [data-test="player-skip"], [data-test="player-quit"], [data-test="quit-button"], footer *, [data-test="player-footer"] *'))return false;
    if(el.matches('header *, [data-test="close-button"], #db-root *'))return false;
    if(el.getAttribute('data-test')==='word-bank')return false;
    if(el.getAttribute('aria-disabled')==='true'||el.disabled)return false;
    const txt=(el.innerText||el.textContent||'').trim();
    if(!txt||txt.length>50)return false;
    return true;
  });
}

function getPillText(el){
  if(!el)return '';
  const sub=el.querySelector('[data-test="challenge-tap-token-text"], [data-test="challenge-judge-text"]');
  const raw=sub?(sub.innerText||sub.textContent||''):(el.innerText||el.textContent||'');
  return cleanPillText(raw);
}

function getTargetWords(ch, pills){
  const pillTexts=pills?pills.map(getPillText).filter(Boolean):[];

  // 1. Array of correctTokens — normalisasi: string ATAU object token
  if(Array.isArray(ch.correctTokens)&&ch.correctTokens.length){
    const toks=ch.correctTokens.map(x=>typeof x==='string'?x:(x?.text||x?.token||x?.word||'')).map(s=>String(s).trim()).filter(Boolean);
    if(toks.length)return toks;
  }

  // 2. displayTokens with blanks
  if(Array.isArray(ch.displayTokens)){
    const blanks=ch.displayTokens.filter(t=>t.isBlank||t.damageStart!==undefined);
    if(blanks.length){
      const words=blanks.map(t=>(t.damageStart!==undefined?t.text?.slice(t.damageStart):t.text)||'').filter(Boolean);
      if(words.length)return words;
    }
  }

  // 3. correctIndices
  const pool=ch.choices||ch.tokens;
  if(Array.isArray(ch.correctIndices)&&pool?.length){
    return ch.correctIndices.map(i=>{
      const c=pool[i];
      return typeof c==='string'?c:(c?.text||c?.phrase||c?.word||c?.translation||c?.value||c?.display||'');
    }).filter(Boolean);
  }

  // 4. Single correctIndex
  const idx=ch.correctIndex??ch.correctIndices?.[0];
  if(ch.choices&&idx!==undefined&&ch.choices[idx]){
    const c=ch.choices[idx];
    // choice bisa object: {text}/{phrase}/{word}/{translation}/{value}/{display}
    const s=typeof c==='string'?c:(c?.text||c?.phrase||c?.word||c?.translation||c?.value||c?.display||'');
    if(s)return [s];
  }

  // 5. Match against correctSolutions
  if(ch.correctSolutions?.[0]&&pillTexts.length){
    const sol=ch.correctSolutions[0].toLowerCase();
    const matches=[];
    for(const pt of pillTexts){
      if(pt&&sol.includes(pt))matches.push({text:pt,idx:sol.indexOf(pt)});
    }
    if(matches.length){
      matches.sort((a,b)=>a.idx-b.idx);
      return matches.map(m=>m.text);
    }
  }
  return [];
}

// Fiber object bisa PARTIAL: {type:'gapFill', choices:[...]} tanpa correctIndex/
// correctSolutions (pitfall v3.6.9). Klik buta pills[0] = jawab selalu opsi 1.
// ONLY fiber object dengan field jawaban nyata ditrust; partial ke-skip supaya
// cache /sessions (ground truth, has correctIndex) bisa matched.
function hasAnswer(ch){
  return !!ch&&(ch.correctIndex!==undefined||ch.correctIndices?.length||
    ch.correctTokens?.length||ch.correctSolutions?.length||ch.pairs?.length);
}

function getChallenge(){
  const pills=getPills();
  let partial=null;

  // 1. Fiber traversal directly from on-screen pills
  for(const p of pills){
    const chF=findFromFiber(p);
    if(!chF)continue;
    if(chF.type||chF.choices||chF.correctTokens||chF.correctSolutions||chF.displayTokens||chF.pairs||chF.correctIndices||chF.tokens){
      if(hasAnswer(chF))return chF;
      partial=partial||chF;
    }
  }

  // 2. Fiber & props traversal from main containers
  const sel='[data-test~="challenge"], [data-test*="challenge"], [data-test*="stories"], [data-test="challenge-choice"], [data-test*="tap-token"], [data-test="word-bank"], [data-test="player-next"], main, #root';
  const nodes=document.querySelectorAll(sel);
  for(let i=nodes.length-1;i>=0;i--){
    const chF=findFromFiber(nodes[i]);
    if(chF&&(chF.type||chF.choices||chF.correctTokens||chF.correctSolutions||chF.displayTokens||chF.pairs||chF.correctIndices||chF.tokens)){
      if(hasAnswer(chF))return chF;
      partial=partial||chF;
    }
    const props=getProps(nodes[i]);
    if(props){
      const chP=deepFind(props,0);
      if(chP){
        if(hasAnswer(chP))return chP;
        partial=partial||chP;
      }
    }
  }

  // 3. Intercepted session challenges — ground truth — dibaca BEFORE partial fiber.
  //     Partial fiber (choices tanpa index) causaria blind pills[0] = opsi 1 SAMA
  //     ALWAYS. Cache challenge has correctIndex di posisi benar.
  const cached=matchFromCache();
  if(cached)return cached;

  // Partial fiber = last resort: MAYBE jawab, tapi at least type known.
  return partial;
}

// Cache /sessions matcher (step 3 lama): trigram + choice matching
function matchFromCache(){
  if(!Array.isArray(window.__DUO_CHALLENGES__)||!window.__DUO_CHALLENGES__.length)return null;
  const bodyText=(document.body.innerText||'').toLowerCase();
  const bodyNorm=normText(bodyText); // blank dirender jadi …/_ di DOM — kolaps dulu
  const inBody=s=>{const n=normText(s);return n.length>=2&&bodyNorm.includes(n);};

  for(const c of window.__DUO_CHALLENGES__){
    // Choices match: if 2+ choices from challenge are on screen
    if(c.choices?.length){
      const cChoices=c.choices.map(x=>(typeof x==='string'?x:x.text||'').toLowerCase().trim());
      const matchCount=cChoices.filter(ch=>ch.length>0&&bodyText.includes(ch)).length;
      if(matchCount>=2)return c;
    }
    // correctSolutions: solusi penuh (blank-tolerant) lalu trigram 3 kata berurutan
    if(Array.isArray(c.correctSolutions)){
      for(const sol of c.correctSolutions){
        if(inBody(sol))return c;
        const words=normText(sol).split(' ').filter(Boolean);
        for(let i=0;i<=words.length-3;i++){
          if(bodyNorm.includes(words.slice(i,i+3).join(' ')))return c;
        }
      }
    }
    // fill-in-the-blank (tapCloze): kalimat token lengkap yang likely cocok dengan body
    const toksArr=Array.isArray(c.tokens)?c.tokens:(Array.isArray(c.displayTokens)?c.displayTokens:null);
    if(toksArr){
      const full=toksArr.map(t=>typeof t==='string'?t:t.text||'').filter(Boolean).join(' ');
      if(inBody(full))return c;
    }
    if(c.prompt&&inBody(c.prompt))return c;
    if(c.sentence&&inBody(c.sentence))return c;
  }
  return null;
}

// ─── SOLVERS ──────────────────────────────────────────────────────────────
function solveChoiceOrToken(ch){
  const pills=getPills();
  if(!pills.length)return false;

  const targetWords=getTargetWords(ch, pills);

  if(targetWords.length){
    const clickedPills=new Set();
    let anyClicked=false;

    for(const target of targetWords){
      const cleanTarget=cleanPillText(target);
      let match=pills.find(p=>!clickedPills.has(p)&&getPillText(p)===cleanTarget);
      if(!match){
        const noPunct=cleanTarget.replace(/[^\p{L}\p{N}]/gu,'');
        match=pills.find(p=>!clickedPills.has(p)&&getPillText(p).replace(/[^\p{L}\p{N}]/gu,'')===noPunct);
      }
      if(match){
        clickEl(match);
        clickedPills.add(match);
        anyClicked=true;
      }
    }
    if(anyClicked)return true;
  }

  // Fallback 1: index-based — correctIndex mengindeks daftar choice yang ter-render
  // (pills = union selector bisa bergeser; pakai kontainer choice dulu)
  const idx=ch?.correctIndex??ch?.correctIndices?.[0];
  if(idx!==undefined){
    const opts=Array.from(document.querySelectorAll(
      '[data-test="challenge-choice"], [data-test="challenge-choice-card"], [data-test="challenge-judge-text"], ' +
      '[data-test*="challenge-select"] [role="radio"], [role="radiogroup"] [role="radio"]'
    ));
    const pool=opts.length?opts:pills;
    if(pool.length){
      const t=pool[idx]||pool[0];
      if(t){clickEl(t);return true;}
    }
  }

  // Fallback 2: word-bank auto-click — HANYA jika jumlah pill == jumlah blank yang
  // DITAHU dari displayTokens. Tanpa blank yang terdeteksi (blankCnt===0) JANGAN klik
  // semua pill: pada soal "pilih frasa yang benar" pill bank = opsi, klik semua = salah.
  const wbPills=pills.filter(p=>p.closest('[data-test="word-bank"]'));
  const blankCnt=(ch?.displayTokens||[]).filter(t=>t.isBlank||t.damageStart!==undefined).length;
  if(wbPills.length>0&&blankCnt>0&&wbPills.length===blankCnt){
    for(const p of wbPills)clickEl(p);
    return true;
  }

  // Fallback 3: pill pertama HANYA jika tidak ada choice terstruktur (hindari tebak buta pilihan ganda).
  // Guard v3.6.9: kalau ch.choices ada (multi-choice soal), JANGAN klik pills[0] — itu opsi 1 SAMA
  // selalu. Tebak buta = jawab salah; lebih baik skip dan log ⚠.
  const structured=document.querySelectorAll('[data-test="challenge-choice"], [data-test="challenge-choice-card"]');
  if(!structured.length&&!ch?.choices?.length&&pills[0]){
    clickEl(pills[0]);
    return true;
  }
  return false;
}

function solveChoice(ch){
  solveChoiceOrToken(ch);
}

function solveTranslate(ch){
  if(ch.correctTokens?.length){
    const toks=document.querySelectorAll('[data-test="challenge-tap-token-text"]');
    const used=[];
    for(const w of ch.correctTokens){
      for(let i=0;i<toks.length;i++){
        if(used.includes(i))continue;
        if(toks[i].innerText.trim()===w){clickEl(toks[i]);used.push(i);break;}
      }
    }
  } else if(ch.correctSolutions?.[0]){
    const inp=document.querySelector('[data-test="challenge-translate-input"]');
    if(inp)dynamicInput(inp,ch.correctSolutions[0]);
  }
}

function solveListen(ch){
  const inp=document.querySelector('[data-test="challenge-translate-input"]')
    ||document.querySelector('[data-test="challenge-text-input"]');
  const text=ch.prompt||ch.correctSolutions?.[0]||'';
  if(inp&&text)dynamicInput(inp,text);
}

function solveFill(ch){
  const pills=getPills();
  const inputs=document.querySelectorAll('[data-test="challenge-text-input"]');

  // A) word-bank / pill: klik target sesuai urutan (correctTokens > displayTokens blank > correctIndices)
  if(pills.length){
    const targets=getTargetWords(ch,pills);
    if(targets.length){
      const clicked=new Set();let n=0;
      for(const target of targets){
        const cw=cleanPillText(target);
        let m=pills.find(p=>!clicked.has(p)&&getPillText(p)===cw);
        if(!m){
          const bare=cw.replace(/[^\p{L}\p{N}]/gu,'');
          m=pills.find(p=>!clicked.has(p)&&getPillText(p).replace(/[^\p{L}\p{N}]/gu,'')===bare);
        }
        if(m){clickEl(m);clicked.add(m);n++;}
      }
      if(n>0)return true;
    }
    // Pill ada tapi target tak ketemu → pilih pill yang cocok dgn correctSolutions (bukan pill pertama)
    const sol=(ch.correctSolutions?.[0]||'').toLowerCase();
    if(sol){
      const m=pills.find(p=>{const t=getPillText(p);return t&&t.length>1&&sol.includes(t);});
      if(m){clickEl(m);return true;}
    }
  }

  // B) input teks: isi blank sesuai displayTokens
  if(ch.displayTokens&&inputs.length){
    let i=0;
    for(const t of ch.displayTokens){
      if(t.damageStart!==undefined&&inputs[i])dynamicInput(inputs[i++],t.text?.slice(t.damageStart)||'');
      else if(t.isBlank&&inputs[i])dynamicInput(inputs[i++],t.text??'');
    }
    if(i>0)return true;
  }

  // C) contenteditable (partialReverseTranslate) atau input tunggal
  if(ch.correctSolutions?.[0]){
    const ce=document.querySelector('[data-test*="partialReverseTranslate"] [contenteditable="true"], [contenteditable="true"]');
    if(ce){
      ce.focus();
      ce.textContent=ch.correctSolutions[0];
      ce.dispatchEvent(new Event('input',{bubbles:true}));
      return true;
    }
    if(inputs[0]){dynamicInput(inputs[0],ch.correctSolutions[0]);return true;}
  }

  // D) terakhir: choice/token (tidak akan menebak buta; lihat solveChoiceOrToken)
  return solveChoiceOrToken(ch);
}

function solveName(ch){
  const sol=ch.correctSolutions?.[0]||'';
  const parts=sol.trim().split(/\s+/);
  if(parts.length>1&&ch.articles?.length){
    const art=parts[0].toLowerCase();
    const opts=document.querySelectorAll('[data-test="challenge-choice"]');
    for(const b of opts){
      if(b.innerText.trim().toLowerCase()===art)clickEl(b);
    }
    const inp=document.querySelector('[data-test="challenge-text-input"]');
    if(inp)dynamicInput(inp,parts.slice(1).join(' '));
  } else {
    solveTranslate(ch);
  }
}

function solveStory(ch){
  // 1) arrange / form-the-sentence: klik chip stories-choice berurutan sesuai correctTokens
  if(Array.isArray(ch.correctTokens)&&ch.correctTokens.length){
    const chips=document.querySelectorAll('[data-test="stories-choice"]');
    const used=[];let n=0;
    for(const w of ch.correctTokens){
      const cw=cleanPillText(w);
      for(let i=0;i<chips.length;i++){
        if(used.includes(i))continue;
        if(cleanPillText(chips[i].innerText)===cw){clickEl(chips[i]);used.push(i);n++;break;}
      }
    }
    if(n>0)return true;
  }
  // 2) arrange by correctIndices pada chip stories-choice
  if(Array.isArray(ch.correctIndices)&&ch.correctIndices.length){
    const chips=document.querySelectorAll('[data-test="stories-choice"]');
    let n=0;
    for(const i of ch.correctIndices)if(chips[i]){clickEl(chips[i]);n++;}
    if(n>0)return true;
  }
  // 3) choice tunggal by index
  const idx=ch.correctAnswerIndex??ch.correctIndex;
  if(idx!==undefined){
    const opts=document.querySelectorAll('[data-test="stories-choice"],[data-test="challenge-choice"]');
    if(opts[idx]){clickEl(opts[idx]);return true;}
  }
  // 4) tile token (layout lesson di dalam story)
  if(ch.correctTokens?.length||ch.correctIndices?.length)return solveTapIdx(ch);
  // 5) pasangan token
  if(ch.pairs)return solveMatch(ch);
  return false;
}

function solveMatch(ch){
  if(!ch.pairs)return;
  const toks=document.querySelectorAll('[data-test="challenge-tap-token-text"]');
  for(const pr of ch.pairs){
    const a=pr.fromToken??pr.character??pr.learningWord??'';
    const b=pr.learningToken??pr.transliteration??pr.translation??'';
    for(const t of toks)
      if(t.innerText.trim()===a||t.innerText.trim()===b)clickEl(t);
  }
}

function solveTapIdx(ch){
  // correctIndices mengindeks token DI WORD-BANK (pola DOM gapFill/tapCloze), fallback ke semua token
  let toks=Array.from(document.querySelectorAll('[data-test="word-bank"] [data-test="challenge-tap-token-text"]'));
  if(!toks.length)toks=Array.from(document.querySelectorAll('[data-test="challenge-tap-token-text"]'));
  // 1. correctIndices (exact order)
  if(Array.isArray(ch.correctIndices)&&ch.correctIndices.length){
    let n=0;
    for(const i of ch.correctIndices)if(toks[i]){clickEl(toks[i]);n++;}
    return n>0;
  }
  // 2. Fallback: resolve target words (correctTokens / displayTokens blanks / correctSolutions match)
  const target=getTargetWords(ch,[]);
  if(target.length&&toks.length){
    const used=[];let n=0;
    for(const w of target){
      const cw=cleanPillText(w);
      for(let i=0;i<toks.length;i++){
        if(used.includes(i))continue;
        if(cleanPillText(toks[i].innerText)===cw){clickEl(toks[i]);used.push(i);n++;break;}
      }
    }
    return n>0;
  }
  return false;
}

function skipSpeech(){
  const b=document.querySelector('[data-test="player-skip"]');
  if(b)clickEl(b);
}

const norm=s=>s.toLowerCase().replace(/[-_]/g,'');

const CHOICE='assist characterIntro characterPuzzle characterSelect definition dialogue dialogueAssist form gapFillSelect imageAssist imageSelect judge listenIsolation select selectPronunciation selectTranscription readComprehension listenComprehension sameDifferent'.split(' ').map(norm);
const FILL='completeReverseTranslation partialReverseTranslation typeCloze typeComplete fillInBlank gapFill tapCloze'.split(' ').map(norm);
const MATCH='match characterMatch listenMatch'.split(' ').map(norm);
const SKIP='speak readAloud freeResponse listenSpeak characterTrace characterWrite'.split(' ').map(norm);

function solveDomFallback(){
  const pills=getPills();
  const wbPills=pills.filter(p=>p.closest('[data-test="word-bank"]'));
  if(wbPills.length>0&&wbPills.length<=4){
    for(const p of wbPills)clickEl(p);
    return true;
  }
  const story=document.querySelector('[data-test="stories-choice"]');
  if(story){clickEl(story);return true;}
  if(pills[0]){clickEl(pills[0]);return true;}
  return false;
}

function dispatch(ch){
  const raw=ch.type||ch.challengeType||'';
  const t=norm(raw);
  // Story player aktif: semua tipe story (multiplechoice/pointtophrase/arrange/tapComplete) lewat solveStory
  if(document.querySelector('[data-test="stories-choice"]'))return solveStory(ch);
  if(SKIP.includes(t))return skipSpeech();
  if(t==='name')return solveName(ch);
  if(t==='multiplechoice'||t==='pointtophrase'||t==='arrange')return solveStory(ch);
  if(t==='gapfill'||t==='tapcloze')return solveFill(ch);
  if(t==='tapcomplete'||t==='tapcompletetable')return solveTapIdx(ch);
  if(CHOICE.includes(t))return solveChoice(ch);
  if(t==='translate'||t==='listentap'||t==='tapdescribe')return solveTranslate(ch);
  if(t==='listen'||t==='listentyped'||t==='typeanswer')return solveListen(ch);
  if(FILL.includes(t)||t==='listencomplete'||t==='listenspell')return solveFill(ch);
  if(MATCH.includes(t))return solveMatch(ch);
  if(ch.choices)return solveChoice(ch);
  if(ch.correctTokens)return solveTranslate(ch);
  if(ch.correctSolutions)return solveFill(ch);
  solveChoice(ch); // fallback
}

// ─── STATE ────────────────────────────────────────────────────────────────
let running=false, timerIv=null, cdIv=null, startTs=0, solved=0;
// turbo: gen = token pembunuh loop; solvedSig = guard anti double-dispatch soal yang sama;
// nextAt = cooldown klik Next supaya tidak dobel saat soal belum sempat bertukar
let loopGen=0, solvedSig=null, logSig=null, nextAt=0, retryAt=0, lastRes=null;

function getNextButton(){
  let b=document.querySelector(
    '[data-test="player-next"], [data-test="player-footer"] button, ' +
    'footer button, [data-test="stories-player-continue"], [data-test="stories-player-done"], ' +
    '[data-test="story-start"], [data-test="player-done"], [data-test="player-practice-again"]'
  );
  if(b)return b;
  const btns=Array.from(document.querySelectorAll('button:not(#db-root *), [role="button"]:not(#db-root *)'));
  return btns.find(btn=>{
    const txt=(btn.textContent||btn.innerText||'').toUpperCase().trim();
    return txt==='CHECK'||txt==='CONTINUE'||txt==='NEXT'||txt==='START'||txt==='DONE';
  })||null;
}

function isOnLesson(){
  const routes=['/lesson','/practice','/stories','/story','/alphabets','/characters','/legendary'];
  if(routes.some(p=>location.pathname.includes(p)))return true;
  return !!document.querySelector('[data-test="player-next"], [data-test="player-footer"], footer button, [data-test*="challenge"]');
}

// Legendary lesson bisa tersembunyi: challenge type bukan 'legendary', hanya route /legendary (pitfall #4)
function isLegendarySession(ch,path=location.pathname){
  return !!ch&&(ch.type==='legendary'||ch.metadata?.isLegendary||path.includes('/legendary'));
}

// ─── CORE LOOP ────────────────────────────────────────────────────────────
// Signature soal: stabil selama soal belum bertukar, berubah saat soal baru muncul.
function challengeSig(ch){
  if(!ch)return '';
  const pick=t=>typeof t==='string'?t:(t?.text||t?.word||t?.token||'');
  const cs=(ch.choices||[]).map(pick).join('|');
  return [ch.id||'',ch.type||ch.challengeType||'',ch.prompt||ch.sentence||'',cs,ch.correctIndex??''].join('~');
}

function tick(){
  if(!running)return;
  // Lesson selesai (end-screen / replay overlay)? hentikan & auto-next
  if(lessonDone()){
    if(logSig!=='__done__'){logSig='__done__';log('Lesson selesai','ok');}
    scheduleNext();
    return;
  }
  const nb=getNextButton();
  if(!nb)return;

  const disabled=nb.getAttribute('aria-disabled')==='true'||nb.disabled;
  const hasStoryChoices=!!document.querySelector('[data-test="stories-choice"]');

  // Jawab hanya saat tombol belum aktif (atau story yang butuh susun sendiri).
  // Guard solvedSig: loop turbo memanggil tick() tiap ~150ms — tanpa ini pill
  // yang sama diklik berulang dan React 18 membatalkan pilihannya (deselect).
  if(disabled||hasStoryChoices){
    const ch=getChallenge();
    const sig=challengeSig(ch);
    if(sig&&sig===solvedSig){
      // Sudah dieksekusi. Kalau kemarin mengeksekusi (pil terklik) → jangan ulang-
      // execute: klik ulang pill yang sama = deselect. Tunggu tombol CHECK aktif.
      // Kalau sudah >6s CHECK masih disabled → force retry (jawaban tak kompleet).
      if(Date.now()<retryAt)return;
      if(lastRes===true&&Date.now()<retryAt+6000)return;
    }
    if(ch){
      // Legendary: unchecked = skip (jalankan hanya jika toggle ON)
      if(!elLeg.checked&&isLegendarySession(ch)){
        log('⚡ Legendary — skipped','info');
        scheduleNext();
        return;
      }
      solvedSig=sig;
      const ok=dispatch(ch);
      lastRes=ok;
      retryAt=Date.now()+(elSafe.checked?2500:1500);
      if(ok!==false){
        solved++;
        elSolved.textContent=solved;
        if(elXp)elXp.textContent=solved*15;
        if(logSig!==sig){logSig=sig;log('✓ '+(ch.type||'soal'),'ok');}
      } else {
        if(logSig!==sig+'!'){logSig=sig+'!';log('⚠ tidak bisa eksekusi '+(ch.type||'soal'),'err');}
      }
    } else {
      solvedSig=sig||'?';
      if(logSig!=='__fb__'){logSig='__fb__';log('⚠ soal tidak terdeteksi — fallback DOM','err');}
      const fb=solveDomFallback();
      lastRes=fb;
      retryAt=Date.now()+(elSafe.checked?2500:1500);
      if(!fb){
        // toggle keyboard if word bank hidden
        const kb=document.querySelector('[data-test="player-toggle-keyboard"]');
        if(kb)clickEl(kb);
      }
    }
  }

  // Klik Check/Continue segera setelah aktif — tanpa setTimeout tertunda.
  // nextAt = cooldown supaya tidak klik ganda sebelum React sempat menukar soal.
  if(Date.now()<nextAt)return;
  const b=getNextButton();
  if(b&&b.getAttribute('aria-disabled')!=='true'&&!b.disabled&&!lessonDone()){
    nextAt=Date.now()+(elSafe.checked?700:250);
    solvedSig=null; retryAt=0; lastRes=null;   // soal berikutnya boleh dieksekusi
    clickEl(b);
  }
}

function jumpToLatestLesson(){
  log('Mencari lesson terbaru...','info');
  sessionStorage.setItem('db_autostart','1');

  // 1. Popover open or direct lesson link on page
  const direct=document.querySelector('[data-test="start-button"], a[href^="/lesson"], a[href*="/lesson"]');
  if(direct){
    direct.click();
    return;
  }

  // 2. Active level on path map
  const activeLevel=document.querySelector(
    '[data-test="skill-path-level"][aria-current="step"],' +
    '[data-test="skill-path-level"]:not([disabled]):not([aria-disabled="true"]),' +
    '[data-test*="path-level"][aria-current="step"],' +
    '[data-test="path-unit"] button:not([disabled])'
  );
  if(activeLevel){
    activeLevel.scrollIntoView({behavior:'smooth',block:'center'});
    activeLevel.dispatchEvent(CE());
    setTimeout(()=>{
      const sb=document.querySelector('[data-test="start-button"], a[href^="/lesson"], a[href*="/lesson"]');
      if(sb) sb.click();
      else location.href='/lesson';
    },400);
    return;
  }

  // 3. Direct route navigation
  location.href='/lesson';
}

function doStart(){
  if(running)return;
  stopCountdown(); // batalkan auto-next yang tertunda
  if(!isOnLesson()){
    log('Auto jump ke lesson terbaru...','info');
    jumpToLatestLesson();
    return;
  }
  running=true; startTs=Date.now(); solved=0;
  solvedSig=null; logSig=null; nextAt=0; retryAt=0;
  elSolved.textContent='0';
  if(elXp)elXp.textContent='0';
  elBtn.textContent='⏹ STOP'; elBtn.className='db-btn db-halt';
  elDot.classList.add('on');
  timerIv=setInterval(updateTimer,1000);
  log(elSafe.checked?'Started (safe ~2s/siklus)':'Started (turbo ~150ms/siklus)','ok');
  runLoop();
}

// Self-loop: tiap siklus langsung jalan, sisa waktu tidur sampai target periode.
// Periode bukan lagi setInterval buta — kalau solve selesai 40ms, siklus berikutnya
// jalan 40ms lagi, bukan nunggu 1500ms.
async function runLoop(){
  const gen=++loopGen;
  while(running&&gen===loopGen){
    const t0=Date.now();
    try{ tick(); }catch(_){}
    const target=elSafe.checked?Math.floor(Math.random()*1400+900)  // safe: 900-2300ms
                              :Math.floor(Math.random()*120+110);   // turbo: 110-230ms
    const elapsed=Date.now()-t0;
    if(target>elapsed)await new Promise(r=>setTimeout(r,target-elapsed));
    else await new Promise(r=>setTimeout(r,0)); // yield ke event loop, jangan blok React
  }
}

function doStop(){
  running=false;
  loopGen++; // batalkan loop yang sedang berjalan
  clearInterval(timerIv);
  elBtn.textContent='▶  START'; elBtn.className='db-btn db-go';
  elDot.classList.remove('on');
  log('Stopped','info');
}

function updateTimer(){
  if(!running)return;
  const s=Math.floor((Date.now()-startTs)/1000);
  const m=Math.floor(s/60);
  elTimer.textContent=m+':'+String(s%60).padStart(2,'0');
}

// ─── AUTO-NEXT (countdown 5 detik) ──────────────────────────────────────
function lessonDone(){
  return !!document.querySelector('[data-test="player-practice-again"], [data-test="player-done"], [data-test="stories-player-done"]');
}

function scheduleNext(){
  doStop();
  if(!elAuto.checked)return;
  log('Auto next dalam 5 detik...','info');
  startCountdown(5);
}

function nextLesson(){
  sessionStorage.setItem('db_autostart','1');
  location.href='/learn';
}

function startCountdown(secs){
  stopCountdown();
  let t=secs;
  elCd.style.display='block';
  const paint=()=>{elCd.textContent='⏭ Lesson berikutnya dalam '+t+'s…';};
  paint();
  cdIv=setInterval(()=>{
    t--;
    if(t<=0){stopCountdown();nextLesson();return;}
    paint();
  },1000);
}

function stopCountdown(){clearInterval(cdIv);cdIv=null;if(elCd)elCd.style.display='none';}

// ─── GUI ──────────────────────────────────────────────────────────────────
const css=document.createElement('style');
css.textContent=`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
#db-root{
  position:fixed;z-index:99999999;
  right:14px;bottom:14px;width:272px;
  font-family:'Inter',system-ui,sans-serif;font-size:12px;
  color:#dce4ec;
  background:linear-gradient(160deg,#111b26 0%,#162030 100%);
  border:1px solid rgba(100,120,160,.25);
  border-radius:18px;
  box-shadow:0 12px 40px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.04);
  overflow:hidden;
  transition:all .25s cubic-bezier(.4,0,.2,1);
  transform-origin:bottom right;
}
#db-root.mini{width:52px;height:52px;border-radius:50%;cursor:pointer}
#db-root.mini #db-body{display:none}
#db-root.mini #db-fab{display:flex}
#db-fab{
  display:none;width:52px;height:52px;
  align-items:center;justify-content:center;
  font-size:24px;
  background:linear-gradient(135deg,#7c3aed,#a855f7);
}
.db-hdr{
  display:flex;align-items:center;justify-content:space-between;
  padding:14px 16px 10px;
}
.db-brand{
  display:flex;align-items:center;gap:8px;
  font-weight:900;font-size:16px;letter-spacing:-.3px;
  color:#c4b5fd;
}
.db-dot{
  width:9px;height:9px;border-radius:50%;
  background:#f87171;box-shadow:0 0 10px #f87171;
  transition:all .3s;
}
.db-dot.on{background:#34d399;box-shadow:0 0 10px #34d399}
.db-x{
  background:none;border:none;color:#64748b;font-size:18px;
  cursor:pointer;padding:2px 4px;border-radius:6px;
  transition:all .15s;
}
.db-x:hover{color:#e2e8f0;background:rgba(255,255,255,.06)}
.db-stats{
  display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;
  padding:2px 16px 8px;
}
.db-sc{
  text-align:center;padding:8px 4px;
  background:rgba(255,255,255,.03);
  border:1px solid rgba(100,120,160,.12);
  border-radius:10px;
}
.db-sv{font-size:17px;font-weight:800;line-height:1.2}
.db-sl{font-size:8px;text-transform:uppercase;letter-spacing:1.2px;color:#64748b;font-weight:700;margin-top:2px}
.db-btn{
  display:flex;align-items:center;justify-content:center;gap:6px;
  margin:4px 16px 6px;width:calc(100% - 32px);height:42px;
  border:none;border-radius:12px;
  font-family:inherit;font-size:13px;font-weight:800;
  letter-spacing:.5px;text-transform:uppercase;
  color:#fff;cursor:pointer;
  transition:all .12s;
}
.db-btn:active{transform:translateY(2px)}
.db-go{
  background:linear-gradient(135deg,#22c55e,#16a34a);
  box-shadow:0 3px 0 #15803d,0 6px 16px rgba(34,197,94,.25);
}
.db-go:active{box-shadow:none}
.db-halt{
  background:linear-gradient(135deg,#ef4444,#dc2626);
  box-shadow:0 3px 0 #b91c1c,0 6px 16px rgba(239,68,68,.25);
}
.db-halt:active{box-shadow:none}
.db-opts{padding:2px 16px 8px}
.db-opt{
  display:flex;align-items:center;justify-content:space-between;
  padding:7px 0;
  border-bottom:1px solid rgba(100,120,160,.08);
}
.db-opt:last-child{border-bottom:none}
.db-cd{
  display:none;margin:0 16px 8px;padding:8px 10px;
  border-radius:10px;text-align:center;
  background:rgba(96,165,250,.12);border:1px solid rgba(96,165,250,.25);
  font-size:11px;font-weight:700;color:#7dd3fc;
}
.db-ol{font-size:11px;font-weight:600;display:flex;align-items:center;gap:6px}
.db-oi{width:18px;text-align:center;font-size:13px;flex-shrink:0}
.db-sw{position:relative;width:34px;height:18px;flex-shrink:0}
.db-sw input{opacity:0;width:0;height:0;position:absolute}
.db-sw b{
  position:absolute;inset:0;
  background:#334155;border-radius:9px;
  cursor:pointer;transition:background .2s;
}
.db-sw b::after{
  content:'';position:absolute;left:2px;top:2px;
  width:14px;height:14px;background:#94a3b8;
  border-radius:50%;transition:all .2s;
}
.db-sw input:checked+b{background:#7c3aed}
.db-sw input:checked+b::after{transform:translateX(16px);background:#fff}
.db-log{
  padding:4px 16px 6px;max-height:52px;overflow-y:auto;
  font-size:10px;font-family:'Courier New',monospace;
  color:#64748b;border-top:1px solid rgba(100,120,160,.1);
}
.db-ll{margin:1px 0}
.db-ll.ok{color:#34d399}.db-ll.err{color:#f87171}.db-ll.info{color:#60a5fa}
.db-ft{
  padding:6px 16px 10px;text-align:center;
  font-size:9px;color:#475569;font-weight:600;letter-spacing:.5px;
  border-top:1px solid rgba(100,120,160,.08);
}
`;
document.head.appendChild(css);

const root=document.createElement('div');
root.id='db-root';
root.innerHTML=`
<div id="db-fab">🤖</div>
<div id="db-body">
  <div class="db-hdr">
    <div class="db-brand"><span class="db-dot" id="db-dot"></span>DuoBot</div>
    <button class="db-x" id="db-min" title="Minimize">✕</button>
  </div>
  <div class="db-stats">
    <div class="db-sc"><div class="db-sv" id="db-xp" style="color:#fbbf24">0</div><div class="db-sl">XP</div></div>
    <div class="db-sc"><div class="db-sv" id="db-solved" style="color:#34d399">0</div><div class="db-sl">Solved</div></div>
    <div class="db-sc"><div class="db-sv" id="db-timer" style="color:#60a5fa">0:00</div><div class="db-sl">Time</div></div>
  </div>
  <button class="db-btn db-go" id="db-start">▶  START</button>
  <div class="db-opts">
    <div class="db-opt">
      <span class="db-ol"><span class="db-oi">🛡</span>Safe Mode</span>
      <label class="db-sw"><input type="checkbox" id="db-safe"><b></b></label>
    </div>
    <div class="db-opt">
      <span class="db-ol"><span class="db-oi">⚡</span>Run Legendary</span>
      <label class="db-sw"><input type="checkbox" id="db-leg"><b></b></label>
    </div>
    <div class="db-opt">
      <span class="db-ol"><span class="db-oi">⏭</span>Auto Next (5s)</span>
      <label class="db-sw"><input type="checkbox" id="db-auto" checked><b></b></label>
    </div>
    <div class="db-opt">
      <span class="db-ol"><span class="db-oi">🌄</span>Auto Start</span>
      <label class="db-sw"><input type="checkbox" id="db-astart"><b></b></label>
    </div>
    <div class="db-opt">
      <span class="db-ol"><span class="db-oi">❤️</span>Unlimited Hearts</span>
      <label class="db-sw"><input type="checkbox" checked disabled><b></b></label>
    </div>
  </div>
  <div class="db-cd" id="db-cd"></div>
  <div class="db-log" id="db-log"></div>
  <div class="db-ft">DUOBOT v3.6.8 — LOCAL BUILD</div>
</div>`;
document.body.appendChild(root);

const elDot=document.getElementById('db-dot');
const elXp=document.getElementById('db-xp');
const elSolved=document.getElementById('db-solved');
const elTimer=document.getElementById('db-timer');
const elBtn=document.getElementById('db-start');
const elLog=document.getElementById('db-log');
const elSafe=document.getElementById('db-safe');
const elLeg=document.getElementById('db-leg');
const elAuto=document.getElementById('db-auto');
const elAStart=document.getElementById('db-astart');
const elCd=document.getElementById('db-cd');
const elMin=document.getElementById('db-min');

// simpan preferensi toggle lintas reload
function bindToggle(el,key){
  const v=localStorage.getItem(key);
  if(v!==null)el.checked=v==='1';
  el.addEventListener('change',()=>localStorage.setItem(key,el.checked?'1':'0'));
}
bindToggle(elSafe,'db_safe');
bindToggle(elLeg,'db_leg');
bindToggle(elAuto,'db_auto');
bindToggle(elAStart,'db_astart_mode');

function log(msg,cls=''){
  const d=document.createElement('div');
  d.className='db-ll '+cls;
  const n=new Date();
  d.textContent=String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0')+' '+msg;
  elLog.prepend(d);
  while(elLog.children.length>30)elLog.lastChild.remove();
}

// collapse/expand
elMin.addEventListener('click',()=>root.classList.add('mini'));
root.addEventListener('click',e=>{
  if(root.classList.contains('mini')){e.stopPropagation();root.classList.remove('mini');}
});

// single clean handler
elBtn.onclick=()=>{stopCountdown();running?doStop():doStart();};

// autostart check on route change or initial load
function checkAutoStart(){
  const wants=sessionStorage.getItem('db_autostart')==='1'||localStorage.getItem('db_astart_mode')==='1';
  if(!wants)return;
  if(isOnLesson()){
    sessionStorage.removeItem('db_autostart');
    log('Auto-starting lesson...','ok');
    setTimeout(doStart,800);
  } else if(location.pathname.includes('/learn')){
    // kembali ke peta path setelah lesson / mode auto: lompat ke level aktif
    setTimeout(jumpToLatestLesson,500);
  }
}

// nav watch
let pp=location.pathname;
new MutationObserver(()=>{
  if(location.pathname!==pp){
    pp=location.pathname;
    checkAutoStart();
  }
}).observe(document.body,{childList:true,subtree:true});

// Edge-trigger: begitu tombol Next jadi aktif atau soal baru ter-render,
// langsung tick — tidak menunggu sisa periode poll. Guard solvedSig/nextAt
// di tick() yang mencegah klik ganda, jadi aman dipanggil sering.
let moAt=0;
new MutationObserver(()=>{
  if(!running)return;
  const now=Date.now();
  if(now-moAt<80)return;   // rate-limit: fiber traversal mahal
  moAt=now;
  try{ tick(); }catch(_){}
}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-disabled','disabled']});

checkAutoStart();

log('Ready — open a lesson & press START','info');

} // end boot
})();
