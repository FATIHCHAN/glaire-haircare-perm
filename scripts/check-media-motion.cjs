/* Проверки реальных регрессий интерфейса без браузера, сети и настоящих призов.
   Виртуальные часы проверяют паузы, гонки загрузки и быстрые команды. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
let time = 0, serial = 0;
const timers = new Map(), frames = new Map();
const setTimer = (fn, delay = 0) => { const id = ++serial; timers.set(id, {fn, due: time + delay}); return id; };
const advance = (ms) => {
  const end = time + ms;
  for (let count = 0; count < 1000; count++) {
    const next = [...timers].filter(([,x]) => x.due <= end).sort((a,b) => a[1].due - b[1].due)[0];
    if (!next) break;
    time = next[1].due; timers.delete(next[0]); next[1].fn();
  }
  time = end;
};
const animateFrames = (ms = 650) => {
  for (let n = 0; n <= ms; n += 16) {
    time += 16;
    const batch = [...frames]; frames.clear(); batch.forEach(([,fn]) => fn(time));
  }
};
class Node {
  constructor() {
    this.listeners = new Map(); this.attrs = {}; this.dataset = {}; this.style = {scrollBehavior:'',scrollSnapType:''};
    this.classList = {add(){}, remove(){}}; this.children = [];
    this.scrollLeft = 0; this.clientWidth = 300; this.scrollWidth = 1100;
  }
  addEventListener(type, fn) { const handlers = this.listeners.get(type) || []; handlers.push(fn); this.listeners.set(type, handlers); }
  dispatchEvent(event) { (this.listeners.get(event.type) || []).forEach(fn => fn(event)); }
  emit(type, properties = {}) { this.dispatchEvent({type, target:this, ...properties}); }
  setAttribute(k,v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  getAttribute(k) { return this.attrs[k]; }
  querySelector() { return null; }
  append(node) { node.parentElement = this; this.children.push(node); }
  contains(n) { return n === this || this.children.includes(n); }
  matches() { return false; }
  cloneNode() { const n = new Node(); n.src=this.src; return n; }
  before(n) { this.parentElement.append(n); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(n=>n!==this); }
  animate() {
    let resolve, reject; const finished = new Promise((r,j) => {resolve=r; reject=j;});
    const id = setTimer(resolve, 620); return {finished, cancel(){timers.delete(id);reject(new Error('cancelled'));}};
  }
  closest() { return null; }
  setPointerCapture() { this.captured = true; }
  hasPointerCapture() { return !!this.captured; }
  releasePointerCapture() { this.captured = false; }
}
const document = new Node(); document.hidden = false; document.activeElement = new Node(); document.createElement = () => new Node();
let modal = false;
document.querySelector = () => modal ? new Node() : null;
const reduced = {matches:false, addEventListener(){}};
const observers = [];
const context = {
  window: new Node(), document, matchMedia: () => reduced,
  IntersectionObserver: class { constructor(fn){this.fn=fn;observers.push(this);} observe(target){this.target=target;} },
  Event: class {constructor(type){this.type=type;}},
  setTimeout:setTimer, clearTimeout:(id)=>timers.delete(id),
  requestAnimationFrame:(fn)=>{let id=++serial;frames.set(id,fn);return id;}, cancelAnimationFrame:(id)=>frames.delete(id),
  queueMicrotask, console,
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/media-motion.js'),'utf8'), context);
const motion = context.window.GlaireMediaMotion;
async function main() {
  // Стрелки не перехватываются свайпом; вертикальный жест и pointercancel не листают.
  const surface = new Node(), button = new Node(), image = new Node(), moved = [];
  button.closest = () => button;
  motion.swipe(surface, dir=>moved.push(dir));
  surface.emit('pointerdown',{target:button,button:0,pointerId:1,clientX:100,clientY:100});
  surface.emit('pointermove',{pointerId:1,clientX:20,clientY:100}); surface.emit('pointerup',{pointerId:1});
  assert.equal(moved.length,0); assert.equal(surface.captured,undefined);
  surface.emit('pointerdown',{target:image,button:0,pointerId:2,clientX:100,clientY:100});
  surface.emit('pointermove',{pointerId:2,clientX:98,clientY:150});surface.emit('pointerup',{pointerId:2});assert.equal(moved.length,0);
  surface.emit('pointerdown',{target:image,button:0,pointerId:3,clientX:100,clientY:100});
  surface.emit('pointermove',{pointerId:3,clientX:30,clientY:102});surface.emit('pointerup',{pointerId:3});assert.deepEqual(moved,[1]);
  surface.emit('pointerdown',{target:image,button:0,pointerId:4,clientX:100,clientY:100});
  surface.emit('pointermove',{pointerId:4,clientX:20,clientY:100});surface.emit('pointercancel',{pointerId:4});assert.deepEqual(moved,[1]);

  // Три быстрых нажатия дают ровно три шага, а не один неполный скролл.
  const track = new Node();
  motion.scrollRail(track,1,200); motion.scrollRail(track,1,200); motion.scrollRail(track,1,200);
  animateFrames(); assert.equal(track.scrollLeft,600); assert.equal(track.style.scrollSnapType,''); assert.equal(track.style.scrollBehavior,'');
  motion.scrollRail(track,-1,200);animateFrames();assert.equal(track.scrollLeft,400);
  motion.scrollRail(track,1,200);motion.cancelRail(track);animateFrames();assert.equal(track.scrollLeft,400);
  track.scrollLeft=800;motion.scrollRail(track,1,200,true);animateFrames();assert.equal(track.scrollLeft,0);

  // Видимость, ручной приоритет, остановка в модальном окне и настройка reduced-motion.
  let slides=0;const root=new Node();const player=motion.autoplay(root,{interval:9000,advance:()=>slides++});
  const observer=observers.at(-1);observer.fn([{isIntersecting:true,intersectionRatio:.5}]);
  advance(8999);assert.equal(slides,0);advance(1);assert.equal(slides,1);
  player.interaction();advance(11999);assert.equal(slides,1);advance(1);assert.equal(slides,2);
  modal=true;document.emit('glaire:modal-state');advance(30000);assert.equal(slides,2);
  modal=false;document.emit('glaire:modal-state');advance(9000);assert.equal(slides,3);
  root.children[0].emit('click');advance(30000);assert.equal(slides,3);assert.equal(root.children[0].attrs['aria-pressed'],'true');
  root.children[0].emit('click');advance(9000);assert.equal(slides,4);
  observer.fn([{isIntersecting:false,intersectionRatio:0}]);advance(30000);assert.equal(slides,4);
  reduced.matches=true;observer.fn([{isIntersecting:true,intersectionRatio:.8}]);advance(30000);assert.equal(slides,4);
  reduced.matches=false;document.hidden=true;player.schedule();advance(30000);assert.equal(slides,4);document.hidden=false;

  // Старые загрузки не завершают новый переход, временный слой всегда один.
  const photo=new Node(), frame=new Node();frame.append(photo);photo.complete=true;photo.naturalWidth=800;photo.src='first';photo.decode=()=>Promise.resolve();
  const loads=[];let ready=0;
  const load=(img,src,success)=>loads.push(success);
  motion.photo(photo,['first'],load,()=>ready++);await loads[0]();
  motion.photo(photo,['second'],load,()=>ready++);
  motion.photo(photo,['third'],load,()=>ready++);
  assert.equal(frame.children.length,2);
  await loads[1]();assert.equal(ready,1);assert.equal(photo.dataset.mediaPending,'1');
  await loads[2]();assert.equal(ready,2);assert.equal(photo.dataset.mediaPending,undefined);
  advance(620);await Promise.resolve();assert.equal(frame.children.length,1);
  console.log('Media motion: swipe/button priority, rapid rail steps, autoplay visibility/pause/modal/reduced-motion, stale image loads passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
