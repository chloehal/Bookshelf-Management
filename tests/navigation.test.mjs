import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('programmatic page navigation activates its tab without a click event', () => {
  const source = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
  const start = source.indexOf('function showPage(pageId) {');
  const end = source.indexOf('// --- Affichage des livres ---', start);
  let activated = false;
  const target = { classList: { add() { activated = true; } } };
  const tab = { setAttribute() {}, classList: { remove() {}, add() {} }, getAttribute: () => "showPage('reconciliation-page')" };
  const document = {
    querySelectorAll: selector => selector === '.page' ? [] : [tab],
    getElementById: () => target,
  };
  const context = vm.createContext({ document, importManagement: null });
  vm.runInContext(source.slice(start, end), context);
  assert.doesNotThrow(() => vm.runInContext("showPage('reconciliation-page')", context));
  assert.equal(activated, true);
});
