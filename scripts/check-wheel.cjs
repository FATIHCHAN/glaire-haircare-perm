/* Изолированная проверка ограничений колеса. Браузер и реальные призы не участвуют.
   Используется один вымышленный FIXTURE-приз и память только этого процесса. */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../assets/events/fortune-wheel.js'), 'utf8');
const storage = new Map();
const context = {
  window: {}, location: {protocol: 'https:', hostname: 'fixture.invalid'},
  localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)},
  navigator: {}, matchMedia: () => ({matches: true}),
  setTimeout: () => 1, clearTimeout: () => {}, Date, Math, Uint32Array,
};
vm.runInNewContext(source, context);
const Wheel = context.window.GlaireFortuneWheel;
// DOM отрисовывается отдельно при браузерной приёмке. Здесь проверяем состояние.
Wheel.prototype.build = function () {
  this.spinButton = {}; this.status = {}; this.disc = {style: {}};
  this.wheel = {classList: {add() {}}};
};
Wheel.prototype.restore = function () {this.restored = true;};
const campaign = {
  campaignId: 'FIXTURE-NOT-A-CAMPAIGN', codePrefix: 'FIXTURE',
  startsAt: '2000-01-01', endsAt: '2100-01-01',
  prizes: [{id: 'fixture', title: 'Вымышленный результат теста'}],
};
const first = new Wheel(campaign);
assert.equal(first.preview, false);
first.draw();
const originalCode = first.saved.code;
assert.match(originalCode, /^FIXTURE-/);
assert.equal(originalCode.startsWith('TEST-'), false);
first.spinning = false;
first.spin();
assert.equal(first.saved.code, originalCode, 'Повтор в том же экземпляре запрещён');
const reload = new Wheel(campaign);
assert.equal(reload.saved.code, originalCode, 'Результат переживает повторную загрузку');
reload.draw();
assert.equal(reload.saved.code, originalCode);
const otherTab = new Wheel(campaign);
otherTab.saved = null; // Снимок другой вкладки до того, как она прочитала общий результат.
otherTab.draw();
assert.equal(otherTab.saved.code, originalCode, 'Перед выдачей перечитывается сохранённый результат');
assert.equal(otherTab.restored, true);
let repeated = false;
otherTab.spin = () => {repeated = true;};
otherTab.repeatPreview();
assert.equal(repeated, false, 'Публичный режим не разрешает пробный повтор');
context.location.hostname = '127.0.0.1'; context.location.protocol = 'http:';
const preview = new Wheel(campaign);
preview.draw();
assert.equal(preview.preview, true);
assert.match(preview.saved.code, /^TEST-FIXTURE-/);
assert.notEqual(preview.key, first.key, 'Тестовые и публичные результаты разделены');
console.log('Wheel: public repeat/reload/second-tab guards and local TEST mode passed; no real prize drawn.');
