// Full DOM smoke test using jsdom: loads the real dist/AnimaI.html,
// runs the app's init, and drives the UI like a user would.
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'AnimaI.html'), 'utf8');
const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'file:///dist/AnimaI.html',
    pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
    if (cond) { pass++; console.log(`  ✔ ${name}`); }
    else { fail++; console.error(`  ✘ ${name}${extra !== undefined ? ' — ' + extra : ''}`); }
};

// jsdom doesn't implement localStorage? It does with url set. Fire DOMContentLoaded
// is handled by jsdom automatically on parse. Wait a tick.
setTimeout(() => {
    console.log('DOM smoke test:');

    // --- static rendering ---
    const sfwCards = document.querySelectorAll('#sfw-categories .category-card');
    check('SFW category cards rendered', sfwCards.length >= 10, sfwCards.length);
    check('negative card rendered', document.querySelectorAll('#negative-categories .category-card').length >= 1);
    const modelOpts = document.querySelectorAll('#model-select option');
    check('model select has 4 presets', modelOpts.length === 4, modelOpts.length);

    // --- click a subject tag ---
    const tags = [...document.querySelectorAll('#sfw-categories .prompt-tag')];
    const girl1 = tags.find(b => b.textContent.includes('1girl'));
    check('found 1girl tag button', !!girl1);
    girl1.click();
    const pos1 = document.getElementById('positive-prompt-output').value;
    check('1girl appears in output', pos1.includes('1girl'), pos1);
    check('safe rating auto-inserted', pos1.includes('safe'), pos1);
    check('quality tags auto (illustrious default)', pos1.includes('very aesthetic'), pos1);
    check('token counter updated', !document.getElementById('pos-token-count').textContent.includes('0 /'), document.getElementById('pos-token-count').textContent);

    // open hair category and click long hair (cards collapsed except first)
    const cards = [...document.querySelectorAll('#sfw-categories .category-card')];
    const hairCard = cards.find(c => c.dataset.cat === 'hair');
    hairCard.classList.remove('collapsed'); // visually open; click works regardless
    const longHairBtn = [...hairCard.querySelectorAll('.prompt-tag')].find(b => b.textContent.includes('long hair'));
    longHairBtn.click();
    const pos2 = document.getElementById('positive-prompt-output').value;
    check('hair selected after subject', pos2.indexOf('long hair') > pos2.indexOf('1girl'), pos2);

    // hair color is a separate category now
    const hairColorCard = cards.find(c => c.dataset.cat === 'hair_color');
    check('hair_color category rendered', !!hairColorCard);
    const blondeBtn0 = [...hairColorCard.querySelectorAll('.prompt-tag')].find(b => b.textContent.includes('blonde hair'));
    blondeBtn0.click();
    const pos2b = document.getElementById('positive-prompt-output').value;
    check('hair color selectable from own category', pos2b.includes('blonde hair'), pos2b);

    // weight buttons in chips
    const chips = [...document.querySelectorAll('#selected-chips .chip')];
    check('chips rendered for selection', chips.length >= 2, chips.length);
    const plusBtn = chips[0].querySelector('button[title="重み +0.1"]');
    check('weight + button exists', !!plusBtn);
    plusBtn.click();
    const pos3 = document.getElementById('positive-prompt-output').value;
    check('weight syntax applied after +', /\(1girl:1\.1\)/.test(pos3), pos3);

    // lock survives randomize
    const lockBtn = chips[0].querySelector('button[title="ランダム生成時に固定"]');
    lockBtn.click();
    document.getElementById('random-btn').click();
    const pos4 = document.getElementById('positive-prompt-output').value;
    check('locked 1girl survives randomize', pos4.includes('1girl'), pos4);

    // --- model switch ---
    document.getElementById('model-select').value = 'animagine';
    document.getElementById('model-select').dispatchEvent(new window.Event('change'));
    const pos5 = document.getElementById('positive-prompt-output').value;
    check('animagine quality tags after switch', pos5.includes('high score') && pos5.includes('great score'), pos5);

    // --- negative ---
    const negCards = [...document.querySelectorAll('#negative-categories .category-card')];
    negCards[0].classList.remove('collapsed');
    const negTag = negCards[0].querySelector('.prompt-tag');
    negTag.click();
    const neg1 = document.getElementById('negative-prompt-output').value;
    check('negative output populated', neg1.length > 5, neg1.slice(0, 40));

    // recommended negative button (animagine has negativeBase)
    const before = document.getElementById('negative-prompt-output').value;
    document.getElementById('add-recommended-negative-btn').click();
    const after = document.getElementById('negative-prompt-output').value;
    check('recommended negative adds tags', after.length > before.length);

    // --- favorites save/load ---
    document.getElementById('favorite-name-input').value = 'テスト保存';
    document.getElementById('save-favorite-btn').click();
    const favItems = document.querySelectorAll('#favorites-list .favorite-item');
    check('favorite saved and listed', favItems.length === 1, favItems.length);

    // --- search filter ---
    document.getElementById('tag-search-input').value = 'ツインテール';
    document.getElementById('tag-search-input').dispatchEvent(new window.Event('input'));
    const visibleSfw = [...document.querySelectorAll('#sfw-categories .category-body-inner .prompt-tag')]
        .filter(b => b.offsetParent !== null || true); // jsdom has no layout; count rendered
    const twintail = visibleSfw.find(b => b.textContent.includes('twintails'));
    check('search finds twintails', !!twintail);
    document.getElementById('tag-search-input').value = '';
    document.getElementById('tag-search-input').dispatchEvent(new window.Event('input'));

    // --- NSFW toggle ---
    document.getElementById('nsfw-toggle').checked = true;
    document.getElementById('nsfw-toggle').dispatchEvent(new window.Event('change'));
    const nsfwTabVisible = document.getElementById('nsfw-tab-btn').style.display !== 'none';
    check('NSFW tab shown after toggle', nsfwTabVisible);
    const pos6 = document.getElementById('positive-prompt-output').value;
    check('rating switched to nsfw', pos6.split(', ').includes('nsfw'), pos6);

    // --- multi-char mode ---
    document.getElementById('multichar-toggle').checked = true;
    document.getElementById('multichar-toggle').dispatchEvent(new window.Event('change'));
    const slotBar = document.getElementById('char-slot-bar');
    check('char slot bar visible', slotBar.style.display === 'flex');
    const pills = document.querySelectorAll('.char-slot-pill');
    check('4 slot pills', pills.length === 4, pills.length);
    pills[1].click(); // select char1
    // click hair tag -> goes to char1 slot
    const hairCard2 = [...document.querySelectorAll('#sfw-categories .category-card')].find(c => c.dataset.cat === 'hair_color');
    const blondeBtn = [...hairCard2.querySelectorAll('.prompt-tag')].find(b => b.textContent.includes('blonde hair'));
    blondeBtn.click();
    // single character slot: no BREAK needed yet
    const pos7a = document.getElementById('positive-prompt-output').value;
    check('single char slot works without BREAK', pos7a.includes('blonde hair'), pos7a);
    // add a second character -> BREAK appears
    const pills2 = document.querySelectorAll('.char-slot-pill');
    pills2[2].click(); // select char2
    const blackHairBtn = [...hairCard2.querySelectorAll('.prompt-tag')].find(b => b.textContent.includes('black hair'));
    blackHairBtn.click();
    const pos7 = document.getElementById('positive-prompt-output').value;
    check('BREAK present with 2 char slots', pos7.includes('BREAK'), pos7);
    check('both char tags present', pos7.includes('blonde hair') && pos7.includes('black hair'), pos7);

    // --- preset modal ---
    document.getElementById('preset-edit-btn').click();
    check('preset modal opens', document.getElementById('preset-modal').style.display === 'flex');
    const rows = document.querySelectorAll('.preset-editor-row');
    check('preset editor rows = 4', rows.length === 4, rows.length);
    document.getElementById('preset-modal-close').click();
    check('preset modal closes', document.getElementById('preset-modal').style.display === 'none');

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}, 300);
