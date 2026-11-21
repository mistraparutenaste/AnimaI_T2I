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
    CHAR_SCOPED_SLOTS, LS, countTokenChunks, mergePresets, mergeImportedFavorites,
    favTagsForSection, isFavTag, tagDefault, categoryById, toggleTag,
    splitPromptTokens, parseToken, lookupTag, addPromptText, importPromptText, encodeShare,
    decodeShareFromText, recordHistory, undo, redo, undoHistory, reorderPool, setWeight, suggestCandidates,
};
`;
(0, eval)(appSrc + shim);
const { state, countTokens, applyWeight, assemblePositive, assembleNegative,
        randomize, serializeSelection, restoreSelection, countTokenChunks, mergePresets,
        mergeImportedFavorites, favTagsForSection, isFavTag, tagDefault, categoryById,
        toggleTag, splitPromptTokens, parseToken, lookupTag, addPromptText, importPromptText,
        encodeShare, decodeShareFromText, recordHistory, undo, redo, undoHistory, reorderPool,
        setWeight, suggestCandidates } = globalThis.__T;

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
check('n_accessories has anal tail', hasNsfwTag('n_accessories', 'anal tail'));
check('n_nsfw has panties aside', hasNsfwTag('n_nsfw', 'panties aside'));
// male-receiving (男性受け) ejaculation scenarios
check('n_situation has defeat ejaculation', hasNsfwTag('n_situation', 'defeat, ejaculation'));
check('n_situation has ejaculating while penetrated', hasNsfwTag('n_situation', 'ejaculating while penetrated'));
check('n_situation has ruined orgasm', hasNsfwTag('n_situation', 'ruined orgasm'));
check('n_situation has forced orgasm', hasNsfwTag('n_situation', 'forced orgasm'));
check('n_situation has fucked silly', hasNsfwTag('n_situation', 'fucked silly'));
// gap-fill: 男性受け直結 + 一般NSFW欠落タグの補完
check('n_situation has pegging', hasNsfwTag('n_situation', 'pegging'));
check('n_situation has futa on male', hasNsfwTag('n_situation', 'futa on male'));
check('n_situation has netorare', hasNsfwTag('n_situation', 'netorare'));
check('n_body_type has trap', hasNsfwTag('n_body_type', 'trap'));
check('n_body_type has large penis', hasNsfwTag('n_body_type', 'large penis'));
check('n_expression has mind break', hasNsfwTag('n_expression', 'mind break'));
check('n_expression has torogao', hasNsfwTag('n_expression', 'torogao'));
check('n_accessories has chastity cage', hasNsfwTag('n_accessories', 'chastity cage'));
check('n_nsfw has naked apron', hasNsfwTag('n_nsfw', 'naked apron'));
// gap-fill 2: 深掘り調査で確認したDanbooru実在タグ
check('n_situation has standing doggystyle', hasNsfwTag('n_situation', 'standing doggystyle'));
check('n_situation has anilingus', hasNsfwTag('n_situation', 'anilingus'));
check('n_situation has orgasm', hasNsfwTag('n_situation', 'orgasm'));
check('n_situation has testicle sucking', hasNsfwTag('n_situation', 'testicle sucking'));
check('n_situation has licking nipple', hasNsfwTag('n_situation', 'licking nipple'));
check('n_body_type has muscular male', hasNsfwTag('n_body_type', 'muscular male'));
check('n_expression has naughty face', hasNsfwTag('n_expression', 'naughty face'));
check('n_pose has spread pussy', hasNsfwTag('n_pose', 'spread pussy'));
check('n_accessories has remote control vibrator', hasNsfwTag('n_accessories', 'remote control vibrator'));

// 同性愛カテゴリ (n_homosexual)
check('n_homosexual category exists', !!nsfwCat('n_homosexual'));
check('n_homosexual has yaoi', hasNsfwTag('n_homosexual', 'yaoi'));
check('n_homosexual has yuri', hasNsfwTag('n_homosexual', 'yuri'));
check('n_homosexual has bara', hasNsfwTag('n_homosexual', 'bara'));
check('n_homosexual has gachimuchi', hasNsfwTag('n_homosexual', 'gachimuchi'));
check('n_homosexual has frottage', hasNsfwTag('n_homosexual', 'frottage'));
check('n_homosexual has tribadism', hasNsfwTag('n_homosexual', 'tribadism'));
check('n_homosexual bundle: yaoi kiss', hasNsfwTag('n_homosexual', 'yaoi, kiss'));
check('n_homosexual bundle: yuri kiss', hasNsfwTag('n_homosexual', 'yuri, kiss'));
check('n_homosexual bundle: yaoi fellatio', hasNsfwTag('n_homosexual', 'yaoi, fellatio'));
check('n_homosexual bundle: yaoi cum in ass', hasNsfwTag('n_homosexual', 'yaoi, cum in ass'));
// 移動済みタグは n_situation に残っていない
check('n_situation no longer has yaoi', !hasNsfwTag('n_situation', 'yaoi'));
check('n_situation no longer has gay', !hasNsfwTag('n_situation', 'gay'));
check('n_situation no longer has tribadism', !hasNsfwTag('n_situation', 'tribadism'));

// ---- Character design & creative coverage ----
console.log('Character design & creative coverage:');
const sfwCat = id => window.PROMPTS_DATA.sfw.find(c => c.id === id);
const hasSfwTag = (id, tag) => (sfwCat(id) || { tags: [] }).tags.some(t => t.prompt === tag);

check('character_design category exists', !!sfwCat('character_design'));
check('character_design has standing front set', hasSfwTag('character_design', 'standing, full body, straight-on, white background'));
check('character_design has a-pose standing', hasSfwTag('character_design', 'standing, full body, a-pose, white background'));
check('character_design has t-pose standing', hasSfwTag('character_design', 'standing, full body, t-pose, white background'));
check('character_design has a-pose', hasSfwTag('character_design', 'a-pose'));
check('character_design has t-pose', hasSfwTag('character_design', 't-pose'));
check('character_design has reference_sheet', hasSfwTag('character_design', 'reference_sheet'));
check('character_design has turnaround', hasSfwTag('character_design', 'reference_sheet, multiple_views, turnaround'));
check('character_design has multiple_views', hasSfwTag('character_design', 'multiple_views'));
check('character_design has multiple_expressions', hasSfwTag('character_design', 'reference_sheet, multiple_expressions'));
check('character_design has color_guide', hasSfwTag('character_design', 'color_guide'));
check('character_design has height_chart', hasSfwTag('character_design', 'height_chart'));
check('character_design has game asset sprite', hasSfwTag('character_design', 'game asset, sprite, full body, transparent background'));
check('character_design has contrapposto', hasSfwTag('character_design', 'standing, full body, contrapposto'));

// pose & composition coverage
check('pose has a-pose', hasSfwTag('pose', 'a-pose'));
check('pose has t-pose', hasSfwTag('pose', 't-pose'));
check('pose has arms at sides', hasSfwTag('pose', 'arms at sides'));
check('pose has contrapposto', hasSfwTag('pose', 'contrapposto'));
check('composition has straight-on', hasSfwTag('composition', 'straight-on'));
check('composition has facing viewer', hasSfwTag('composition', 'facing viewer'));
check('composition has turnaround', hasSfwTag('composition', 'turnaround'));
check('composition has multiple_views', hasSfwTag('composition', 'multiple_views'));

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

// ---- regression: bugs fixed in v2.1 ----
console.log('Regressions:');
const clearAll = () => { state.slots.forEach(m => m.clear()); state.negativeTags.clear(); };
clearAll();
state.multiChar = false;
state.nsfwMode = true;
state.modelId = 'illustrious';
state.slots[0].set('1girl', { weight: 1.0, locked: false, cat: 'subject' });
state.slots[0].set('uncensored', { weight: 1.0, locked: false, cat: 'n_nsfw' });
pos = assemblePositive();
check('n_nsfw tag reaches the prompt', pos.split(', ').includes('uncensored'), pos);
check('n_nsfw tag sits right after rating', pos.indexOf('nsfw, uncensored') >= 0, pos);
state.multiChar = true;
pos = assemblePositive();
check('n_nsfw tag kept in multi-char mode', pos.split(', ').includes('uncensored'), pos);
state.multiChar = false;

// tags whose slot is missing from a (stale) template are never dropped
const illPreset = state.presets.find(p => p.id === 'illustrious');
const savedTpl = illPreset.template;
illPreset.template = savedTpl.filter(s => s !== 'rating_adj');
pos = assemblePositive();
check('unknown slot falls back instead of vanishing', pos.split(', ').includes('uncensored'), pos);
illPreset.template = savedTpl;
state.nsfwMode = false;
clearAll();

// every category's slot is in every preset template
const tplAll = global.window.MODEL_PRESETS.every(p =>
    [...global.window.PROMPTS_DATA.sfw, ...global.window.PROMPTS_DATA.nsfw]
        .every(c => p.template.includes(c.slot)));
check('all category slots covered by templates', tplAll);

// CSV weight column is honoured
const fakeCat = { id: 'x', tags: [{ prompt: 'a', weight: 1.2 }, { prompt: 'b', weight: null }] };
check('csv weight used as default', tagDefault(fakeCat, 'a') === 1.2);
check('missing csv weight -> 1.0', tagDefault(fakeCat, 'b') === 1.0);

// BREAK-aware token chunks
const ch = countTokenChunks('1girl, smile, BREAK, 1boy, frown');
check('BREAK splits token chunks', ch.length === 2 && ch[0] > 0 && ch[1] > 0, JSON.stringify(ch));
check('no BREAK -> single chunk', countTokenChunks('1girl, smile').length === 1);

// stored presets: user edits kept, template always from build
const merged = mergePresets([{ id: 'illustrious', quality: ['foo'], template: ['subject'] }]);
const ill = merged.find(p => p.id === 'illustrious');
check('preset merge keeps user quality edit', ill.quality.join() === 'foo');
check('preset merge ignores stale template', ill.template.includes('rating_adj'));
check('preset merge keeps all build presets', merged.length === global.window.MODEL_PRESETS.length);

// favourites import: legacy array + v2 object, name collisions
state.favorites = []; state.favTags = [];
let r = mergeImportedFavorites([{ name: 'A', data: { slots: [] } }, { name: 'A', data: { slots: [] } }]);
check('legacy array import', r.added === 2 && state.favorites[1].name === 'A (2)', JSON.stringify(state.favorites.map(f => f.name)));
r = mergeImportedFavorites({ favorites: [{ name: 'B', data: {} }, { name: 'bad' }],
    favoriteTags: [{ cat: 'hair', prompt: 'long hair', japanese: 'ロングヘア' }, { cat: 'hair', prompt: 'long hair' }] });
check('v2 import adds favourites + tags, skips invalid/dupes', r.added === 1 && r.addedTags === 1);
let threw = false; try { mergeImportedFavorites('x'); } catch (e) { threw = true; }
check('invalid import rejected', threw);

// favourite tags
check('isFavTag', isFavTag('hair', 'long hair'));
check('favTagsForSection resolves sfw tag', favTagsForSection('sfw').some(e => e.item.prompt === 'long hair'));
check('favTagsForSection filters other sections', favTagsForSection('nsfw').length === 0);
state.favTags.push({ cat: 'hair', prompt: 'no such tag' });
check('stale favourite tag ignored', favTagsForSection('sfw').length === 1);

// restore sanitises imported data
restoreSelection({ modelId: 'deleted-model', slots: [{ x: { weight: 'abc', cat: 'hair' } }] });
check('restore ignores unknown modelId', state.presets.some(p => p.id === state.modelId));
check('restore sanitises weight', state.slots[0].get('x').weight === 1.0);

// ---- v2.2: parsing / LoRA / share / undo / reorder / random / suggest ----
console.log('v2.2 features:');
const resetSel = () => { state.slots.forEach(m => m.clear()); state.negativeTags.clear(); state.multiChar = false; state.activeSlot = 0; };
state.modelId = 'illustrious'; state.qualityAuto = true; state.ratingAuto = true; state.nsfwMode = false;

const toks = splitPromptTokens('1girl, (a, b:1.2), <lora:x:0.8>,\nlong hair, character \\(series\\)');
check('split respects brackets/newlines', toks.length === 5 && toks[1] === '(a, b:1.2)', JSON.stringify(toks));
check('parse (tag:1.3)', JSON.stringify(parseToken('(smile:1.3)')) === JSON.stringify({ tag: 'smile', weight: 1.3 }));
check('parse ((tag)) ~ 1.2', parseToken('((smile))').weight === 1.2);
check('parse [tag] ~ 0.9', parseToken('[smile]').weight === 0.9);
check('parse group (a, b:1.2)', parseToken('(a, b:1.2)').tag === 'a, b');
check('escaped parens kept as tag', parseToken('character \\(series\\)').tag === 'character \\(series\\)');
check('parse BREAK', parseToken('BREAK').isBreak === true);
const pl = parseToken('<lora:myStyle:0.65>');
check('parse LoRA key+weight', pl.lora && pl.tag === '<lora:myStyle>' && pl.weight === 0.65, JSON.stringify(pl));

check('lookup with underscores', !!lookupTag('long_hair', false) && lookupTag('long_hair', false).prompt === 'long hair');
check('lookup unknown -> null', lookupTag('zzz not a tag', false) === null);

resetSel();
let ar = addPromptText('(long hair:1.2), my custom thing, <lora:abc:0.7>', false);
check('addPromptText counts', ar.known === 1 && ar.manual === 2, JSON.stringify(ar));
check('known tag joins its category', state.slots[0].get('long hair').cat === 'hair' && state.slots[0].get('long hair').weight === 1.2);
pos = assemblePositive();
check('LoRA emitted last with weight', pos.endsWith('<lora:abc:0.7>'), pos);
check('LoRA not counted as tokens', countTokens('<lora:abc:0.7>') === 0);
state.slots[0].get('<lora:abc>').weight = 0.75;
check('LoRA weight 2 decimals', assemblePositive().includes('<lora:abc:0.75>'));

resetSel();
const ir = importPromptText('masterpiece, 1girl, smile, BREAK, safe\nNegative prompt: lowres, (bad hands:1.3)\nSteps: 20, Sampler: Euler', true);
check('import skips auto quality/rating tags', ir.auto === 2, JSON.stringify(ir));
check('import counts BREAK', ir.breaks === 1);
check('import reads negative block', state.negativeTags.has('lowres') && state.negativeTags.get('bad hands').weight === 1.3, JSON.stringify([...state.negativeTags.keys()]));
check('import drops Steps line', ![...state.negativeTags.keys()].some(k => /Steps|Sampler/.test(k)));
importPromptText('1boy', true);
check('replace mode clears previous', !state.slots[0].has('1girl') && state.slots[0].has('1boy'));
check('replace without negative keeps negatives', state.negativeTags.has('lowres'));

// share round-trip
resetSel();
state.slots[0].set('1girl', { weight: 1.0, locked: true, cat: 'subject' });
state.slots[0].set('<lora:abc>', { weight: 0.6, locked: false, cat: 'manual' });
state.negativeTags.set('lowres', { weight: 1.2, locked: false, cat: 'manual' });
state.nsfwMode = true;
const code = encodeShare();
check('share code is url-safe', /^[A-Za-z0-9_-]+$/.test(code));
const dec = decodeShareFromText('https://example.test/AnimaI.html#s=' + code);
check('share decodes from full link', dec && dec.slots[0]['1girl'].locked === true && dec.nsfwMode === true);
resetSel(); state.nsfwMode = false;
restoreSelection(dec);
check('share restores LoRA weight', state.slots[0].get('<lora:abc>').weight === 0.6);
check('share restores negative weight', state.negativeTags.get('lowres').weight === 1.2);
check('garbage share -> null', decodeShareFromText('#s=!!!') === null && decodeShareFromText('hello') === null);
resetSel();
state.slots[0].set('日本語タグ', { weight: 1, locked: false, cat: 'manual' });
const jpCode = encodeShare();
check('share handles non-ASCII', !!decodeShareFromText('s=' + jpCode).slots[0]['日本語タグ']);
state.nsfwMode = false;

// undo / redo
resetSel();
undoHistory.stack = []; undoHistory.idx = -1;
recordHistory();
state.slots[0].set('1girl', { weight: 1, locked: false, cat: 'subject' }); recordHistory();
state.slots[0].set('smile', { weight: 1, locked: false, cat: 'expression' }); recordHistory();
check('history records steps', undoHistory.stack.length === 3);
undo();
check('undo removes last tag', state.slots[0].has('1girl') && !state.slots[0].has('smile'));
undo();
check('undo to empty', state.slots[0].size === 0);
check('undo at start is no-op', undo() === false);
redo(); redo();
check('redo restores', state.slots[0].has('smile'));
state.slots[0].delete('smile'); recordHistory();
check('new change drops redo branch', redo() === false && undoHistory.idx === undoHistory.stack.length - 1);

// reorder
resetSel();
['a', 'b', 'c'].forEach(p => state.slots[0].set(p, { weight: 1, locked: false, cat: 'manual' }));
reorderPool(state.slots[0], 'c', 'a', false);
check('reorder before', [...state.slots[0].keys()].join() === 'c,a,b');
reorderPool(state.slots[0], 'c', 'b', true);
check('reorder after', [...state.slots[0].keys()].join() === 'a,b,c');

// おまかせ exclusion
resetSel();
state.randomExclude = new Set(['subject', 'hair', 'expression']);
for (let i = 0; i < 5; i++) randomize();
check('excluded categories not picked', ![...state.slots[0].values()].some(m => ['subject', 'hair', 'expression'].includes(m.cat)));
state.randomExclude = new Set();

// manual weight on manual tags
resetSel();
state.slots[0].set('custom', { weight: 1, locked: false, cat: 'manual' });
setWeight(state.slots[0], 'custom', 0.2);
check('manual tag weight applies', assemblePositive().includes('(custom:1.2)'));

// suggest
const sg = suggestCandidates('ツイン', false);
check('suggest by japanese', sg.length > 0 && sg.some(c => c.item.prompt.includes('twin')), JSON.stringify(sg.map(c => c.item.prompt)));
const sg2 = suggestCandidates('long', false);
check('suggest prefix first', sg2.length > 0 && sg2[0].item.prompt.startsWith('long'), sg2.map(c => c.item.prompt).join('|'));
state.nsfwMode = false;
check('suggest hides NSFW in SFW mode', !suggestCandidates('nude', false).some(c => c.cat.section === 'nsfw'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
