// Node-based logic tests for AnimaI T2I v2 core (DOM stubbed).
// Run: node tests/logic-test.js
'use strict';
const fs = require('fs');
const path = require('path');

global.window = {};
const dataJs = fs.readFileSync(path.join(__dirname, '..', 'prompts-data.js'), 'utf8');
(0, eval)(dataJs); // defines window.PROMPTS_DATA / window.MODEL_PRESETS

const noop = () => {};
const makeEl = () => ({
    value: '', textContent: '', innerHTML: '', className: '', title: '', href: '', download: '',
    style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, appendChild: noop, removeChild: noop, setAttribute: noop,
    querySelectorAll: () => [], querySelector: () => null, closest: () => null,
    click: noop, files: [],
});
global.document = {
    addEventListener: noop,
    getElementById: () => makeEl(),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => makeEl(),
};
global.localStorage = {
    _s: {},
    getItem(k) { return this._s[k] ?? null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
};
global.alert = noop;
global.confirm = () => true;
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: noop };
global.Blob = class {};
global.FileReader = class { readAsText() {} };
Object.defineProperty(global, 'navigator', {
    value: { clipboard: { writeText: async () => {} } },
    configurable: true,
});

// app.js is a browser script; strip its strict directive so the sloppy direct
// eval hoists its top-level bindings into this module scope, then export the
// pieces under test via a shim appended inside the same eval.
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8')
    .replace(`'use strict';`, '');
const shim = `
;globalThis.__T = {
    state, countTokens, applyWeight, assemblePositive, assembleNegative,
    randomize, serializeSelection, restoreSelection, currentPreset,
    CHAR_SCOPED_SLOTS, LS,
};
`;
(0, eval)(appSrc + shim);
const { state, countTokens, applyWeight, assemblePositive, assembleNegative,
        randomize, serializeSelection, restoreSelection } = globalThis.__T;

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log(`  ✔ ${name}`); }
    else { fail++; console.error(`  ✘ ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---- data integrity ----
console.log('Data:');
check('PROMPTS_DATA loaded', Array.isArray(global.window.PROMPTS_DATA.sfw));
check('MODEL_PRESETS 4 presets', global.window.MODEL_PRESETS.length === 4);
const ratingCat = global.window.PROMPTS_DATA.sfw.find(c => c.id === 'rating');
check('rating category has safe/nsfw', ratingCat && ratingCat.tags.some(t => t.prompt === 'safe') && ratingCat.tags.some(t => t.prompt === 'nsfw'));
const eraCat = global.window.PROMPTS_DATA.sfw.find(c => c.id === 'era');
check('era category has newest', eraCat && eraCat.tags.some(t => t.prompt === 'newest'));
check('composition category exists', !!global.window.PROMPTS_DATA.sfw.find(c => c.id === 'composition'));

// ---- token counting ----
console.log('Token counter:');
const t1 = countTokens('1girl, long hair, smile');
check('basic count sane', t1 > 3 && t1 < 12, `got ${t1}`);
const t2 = countTokens('(masterpiece:1.2), best quality, very aesthetic, absurdres, newest');
check('quality tags fit in 75', t2 <= 75, `got ${t2}`);

// ---- weight syntax ----
console.log('Weight syntax:');
check('1.0 -> bare tag', applyWeight('smile', { weight: 1.0 }) === 'smile');
check('1.2 -> weighted', applyWeight('smile', { weight: 1.2 }) === '(smile:1.2)');
check('0.8 -> weighted', applyWeight('smile', { weight: 0.8 }) === '(smile:0.8)');

// ---- assembly & ordering ----
console.log('Assembly & ordering:');
state.slots[0].set('1girl', { weight: 1.0, locked: false, cat: 'subject' });
state.slots[0].set('school uniform', { weight: 1.0, locked: false, cat: 'clothing' });
state.slots[0].set('long hair', { weight: 1.0, locked: false, cat: 'hair' });
state.slots[0].set('night sky, stars', { weight: 1.0, locked: false, cat: 'background' });

state.modelId = 'illustrious';
let pos = assemblePositive();
let parts = pos.split(', ');
check('starts with subject 1girl', parts[0] === '1girl', parts[0]);
check('rating safe auto-inserted', parts.includes('safe'));
check('hair before clothing', pos.indexOf('long hair') < pos.indexOf('school uniform'));
check('quality tags late in prompt', pos.indexOf('very aesthetic') > pos.indexOf('school uniform'));
check('era newest appended', pos.includes('newest'));
check('background after appearance', pos.indexOf('night sky, stars') > pos.indexOf('long hair'));

state.slots[0].set('long hair', { weight: 1.3, locked: false, cat: 'hair' });
pos = assemblePositive();
check('weighted tag emitted as (long hair:1.3)', pos.includes('(long hair:1.3)'));
state.slots[0].set('long hair', { weight: 1.0, locked: false, cat: 'hair' });

state.modelId = 'animagine';
pos = assemblePositive();
check('animagine quality: high score', pos.includes('high score'));
check('animagine quality: great score', pos.includes('great score'));
state.modelId = 'noobai';
pos = assemblePositive();
check('noobai quality: very awa', pos.includes('very awa'));

state.qualityAuto = false;
pos = assemblePositive();
check('qualityAuto off -> no masterpiece', !pos.includes('masterpiece'));
state.qualityAuto = true;

state.ratingAuto = false;
pos = assemblePositive();
check('ratingAuto off -> no safe', !pos.split(', ').includes('safe'));
state.ratingAuto = true;

state.multiChar = true;
state.slots[1].set('1girl', { weight: 1.0, locked: false, cat: 'subject' });
state.slots[1].set('blonde hair', { weight: 1.0, locked: false, cat: 'hair' });
state.slots[2].set('1boy', { weight: 1.0, locked: false, cat: 'subject' });
pos = assemblePositive();
check('BREAK separates chars', pos.includes('BREAK'));
check('char1 block has blonde hair', /1girl, .*blonde hair/.test(pos));
state.multiChar = false;

state.negativeTags.set('lowres', { weight: 1.0, locked: false, cat: 'manual' });
const neg = assembleNegative();
check('negative joined', neg.includes('lowres'));

// ---- duplicate suppression ----
console.log('Duplicate suppression:');
// two negative bundles sharing tags -> each tag once
state.negativeTags.clear();
state.negativeTags.set('lowres, worst quality, bad quality, lowres', { weight: 1.0, locked: false, cat: 'negative_prompt' });
state.negativeTags.set('worst quality, low quality, lowres', { weight: 1.0, locked: false, cat: 'negative_prompt' });
let negDedup = assembleNegative();
const tagList = negDedup.split(', ').map(s => s.toLowerCase());
const dupCount = tagList.length - new Set(tagList).size;
check('negative bundles deduped', dupCount === 0, negDedup);
// positive: selecting both "masterpiece" item and a bundle containing masterpiece
state.negativeTags.clear();
state.slots[0].clear();
state.modelId = 'illustrious';
state.qualityAuto = true;
state.slots[0].set('1girl', { weight: 1.0, locked: false, cat: 'subject' });
state.slots[0].set('masterpiece', { weight: 1.0, locked: false, cat: 'quality' });
let posDedup = assemblePositive();
const posList = posDedup.split(', ');
const posMasterpiece = posList.filter(t => t === 'masterpiece').length;
check('quality tag not duplicated with auto-insert', posMasterpiece === 1, posDedup);
state.qualityAuto = true;

// ---- NSFW expansion coverage (regression) ----
console.log('NSFW expansion coverage:');
const nsfwCat = id => window.PROMPTS_DATA.nsfw.find(c => c.id === id);
const hasNsfwTag = (id, tag) => (nsfwCat(id) || { tags: [] }).tags.some(t => t.prompt === tag);
check('n_pose has arched back', hasNsfwTag('n_pose', 'arched back'));
check('n_situation has mating press', hasNsfwTag('n_situation', 'mating press'));
check('n_situation has 69', hasNsfwTag('n_situation', '69'));
check('n_body_type has large areolae (danbooru official)', hasNsfwTag('n_body_type', 'large areolae'));
check('no big areolae alias remains', !hasNsfwTag('n_body_type', 'big areolae'));
check('n_accessories has tail plug', hasNsfwTag('n_accessories', 'tail plug'));
check('n_nsfw has panties aside', hasNsfwTag('n_nsfw', 'panties aside'));

// ---- random (lock-aware) ----
console.log('Random (lock-aware):');
state.nsfwMode = false;
randomize();
check('randomize keeps a subject', [...state.slots[0].values()].some(m => m.cat === 'subject'));
state.slots[0].forEach(meta => { if (meta.cat === 'hair') meta.locked = true; });
const lockedHair = [...state.slots[0].entries()].filter(([, m]) => m.cat === 'hair').map(([p]) => p);
randomize();
const afterHair = [...state.slots[0].entries()].filter(([, m]) => m.cat === 'hair').map(([p]) => p);
check('locked hair survives reroll', lockedHair.every(p => afterHair.includes(p)), `${lockedHair} vs ${afterHair}`);
check('NSFW cats skipped in SFW mode', ![...state.slots[0].values()].some(m => String(m.cat).startsWith('n_')));

// ---- serialization round-trip ----
console.log('Serialization:');
const snap = serializeSelection();
const json = JSON.stringify(snap);
check('serialize->JSON round-trips', JSON.parse(json).modelId === snap.modelId);
restoreSelection(JSON.parse(json));
check('restore keeps modelId', state.modelId === snap.modelId);
check('restore keeps tags', [...state.slots[0].keys()].length > 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
