import puppeteer from 'puppeteer-core';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE='http://localhost:8151';
const W=430,H=932,DSF=3; // -> 1290x2796 (Apple 6.7"); portrait, >1080 for Play
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--force-device-scale-factor=3','--hide-scrollbars']});
const p=await b.newPage();
await p.setViewport({width:W,height:H,deviceScaleFactor:DSF,isMobile:true,hasTouch:true});
async function shot(name){await p.screenshot({path:`store-assets/screenshots/${name}.png`});console.log('shot',name);}
// 1. HOME
await p.goto(`${BASE}/`,{waitUntil:'networkidle2'});await sleep(2500);await shot('01-home');
// 2. GAME TABLE - start a bot game, skip deal, let a few plays land
await p.goto(`${BASE}/game-local?bots=3&level=easy`,{waitUntil:'networkidle2'});await sleep(2500);
// tap center to skip deal
await p.mouse.click(W/2,H*0.45);await sleep(1200);await p.mouse.click(W/2,H*0.45);await sleep(4000);await shot('02-table');
// 3. HOW TO PLAY
await p.goto(`${BASE}/how-to-play`,{waitUntil:'networkidle2'});await sleep(2000);await shot('03-howtoplay');
// 4. HOME with difficulty picker open (fresh)
await p.evaluate(()=>localStorage.clear());
await p.goto(`${BASE}/`,{waitUntil:'networkidle2'});await sleep(2000);
// click PLAY to open the picker
const clicked=await p.evaluate(()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.textContent.trim().toLowerCase()==='play'&&e.children.length===0);const el=els[els.length-1];if(!el)return false;const r=el.getBoundingClientRect();const o={bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2};for(const ev of['pointerdown','pointerup','click'])el.dispatchEvent(new MouseEvent(ev,o));return true;});
await sleep(1200);await shot('04-difficulty');
await b.close();console.log('DONE');
