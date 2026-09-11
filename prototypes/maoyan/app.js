/* Formatting is attached to immutable character offsets, not browser selection ranges. */
const SOURCE = `# 图和文字是一体的

我的内容创作我觉得图和文字是一体的，我不太喜欢我的图出来了以后。又要再去把它排版，上传一次去网页。

<mark style="background:rgba(189, 221, 34, 0.57)">有一些细小的视觉上面的审美差别，人可能还是要调一下的。</mark>虽然AI可以加速人们的效率，但我觉得也没有必要这么快。

如果是科技点的话，可能就是荔枝白跟嫩绿那种更亮眼一点的颜色。

我没有选择Skill的原因是因为实际上Skill每次在执行的时候它都会浪费Token的，但我认为这种排版的工作不需要去用Token，而且实际上有一些细小的视觉上面的审美差别，人可能还是要调一下的。

我自己可能原文档没有加粗，但是我在生成卡片的时候，我希望有一些地方可以让我标颜色或者是加粗，那这个时候我可以直接在插件里面进行点选。`;
const KEY = 'maoyan-layout-prototype-v3';
const DEFAULTS = {
  wheat: { name: '麦浪青野', paper: '#F7F5EF', heading: '#117C0D', body: '#29332A', accent: '#FAC75E', font: 'wenkai' },
  lime: { name: '荔枝青绿', paper: '#F6F7F4', heading: '#0961F6', body: '#29332A', accent: '#BDDD22', font: 'system' },
};
const FONTS = { wenkai: 'WenkaiLocal,"Kaiti SC",KaiTi,serif', system: '"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Microsoft YaHei",sans-serif' };
const $ = (id) => document.getElementById(id);
const clone = (value) => JSON.parse(JSON.stringify(value));
const validHex = (value) => /^#[\da-f]{6}$/i.test(value);
let state = { source: SOURCE, active: 'wheat', compare: true, themes: clone(DEFAULTS), edits: {}, profile: { name: '猫彦', bio: '', avatar: '' }, custom: [] };
let selection = null;
let past = [], future = [], renderFrame = 0;
let storageAvailable = true;
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved && saved.source === SOURCE && ['wheat', 'lime'].includes(saved.active)
    && ['wheat', 'lime'].every((key) => saved.themes?.[key] && ['paper', 'heading', 'body', 'accent'].every((role) => validHex(saved.themes[key][role])) && FONTS[saved.themes[key].font])
    && typeof saved.profile?.name === 'string' && typeof saved.profile?.bio === 'string'
    && typeof saved.edits === 'object' && Array.isArray(saved.custom)) state = saved;
} catch { storageAvailable = false; }

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); $('save-status').textContent = '已保存到本机'; }
  catch { storageAvailable = false; $('save-status').textContent = '存储不可用，当前修改仅本次有效'; }
}
function change(fn, controls = false) {
  past.push(clone(state)); if (past.length > 40) past.shift(); future = [];
  fn(); persist(); if (controls) syncControls(); scheduleRender(); syncHistory();
}
function syncHistory() { $('undo').disabled = !past.length; $('redo').disabled = !future.length; }
function travel(from, to) {
  if (!from.length) return;
  to.push(clone(state)); state = from.pop(); persist(); syncControls(); scheduleRender(); syncHistory(); updateSelection();
}
function scheduleRender() { cancelAnimationFrame(renderFrame); renderFrame = requestAnimationFrame(render); }

let index = 0;
const blocks = SOURCE.split(/\n\n/).map((text) => {
  const heading = text.startsWith('# ');
  const plain = heading ? text.slice(2) : text;
  const fragment = new DOMParser().parseFromString(plain, 'text/html');
  const chars = [];
  function walk(node, inherited = {}) {
    if (node.nodeType === Node.TEXT_NODE) {
      Array.from(node.textContent).forEach(char => chars.push({ text: char, id: index++, base: { ...inherited } }));
      return;
    }
    if (['SCRIPT', 'STYLE', 'IFRAME'].includes(node.nodeName)) return;
    const style = { ...inherited };
    if (['STRONG', 'B'].includes(node.nodeName)) style.bold = true;
    if (node.nodeName === 'MARK' && node.style.backgroundColor) style.background = node.style.backgroundColor;
    node.childNodes.forEach(child => walk(child, style));
    }
  walk(fragment.body);
  return { heading, chars };
});
const allChars = blocks.flatMap((b) => b.chars);

function makeIdentity() {
  const row = document.createElement('div'); row.className = 'identity';
  const avatar = state.profile.avatar && /^data:image\/(png|jpeg|webp);base64,/.test(state.profile.avatar)
    ? document.createElement('img') : document.createElement('span');
  avatar.className = 'avatar';
  if (avatar.tagName === 'IMG') { avatar.src = state.profile.avatar; avatar.alt = '自定义头像'; }
  else { avatar.textContent = (state.profile.name || '猫彦').slice(0, 1); avatar.setAttribute('aria-label', '文字头像占位'); }
  const text = document.createElement('div'); text.className = 'identity-text';
  const name = document.createElement('strong'); name.textContent = state.profile.name || '猫彦'; text.append(name);
  if (state.profile.bio) { const bio = document.createElement('small'); bio.textContent = state.profile.bio; text.append(bio); }
  row.append(avatar, text); return row;
}
function makePaper(theme) {
  const paper = document.createElement('article'); paper.className = 'paper';
  Object.entries({ '--paper': theme.paper, '--heading': theme.heading, '--body': theme.body, '--accent-color': theme.accent, '--font': FONTS[theme.font] }).forEach(([k,v]) => paper.style.setProperty(k,v));
  paper.append(makeIdentity());
  const content = document.createElement('div'); content.className = 'paper-content'; paper.append(content);
  const footer = document.createElement('div'); footer.className = 'paper-footer';
  const label = document.createElement('span'); label.textContent = `${theme.name} / 会话选段`;
  const count = document.createElement('span'); count.className = 'page-number'; footer.append(label, count); paper.append(footer);
  return paper;
}
function makeBlock(block, chars) {
  const node = document.createElement(block.heading ? 'h2' : 'p');
  for (const char of chars) {
    const span = document.createElement('span'); span.dataset.i = char.id; span.textContent = char.text;
    const style = { ...char.base, ...(state.edits[char.id] || {}) };
    if (style.bold !== undefined) span.style.fontWeight = style.bold ? '700' : '400';
    if (style.italic !== undefined) span.style.fontStyle = style.italic ? 'italic' : 'normal';
    if (style.underline !== undefined) span.style.textDecoration = style.underline ? 'underline' : 'none';
    if (validHex(style.color)) span.style.color = style.color;
    if (/^rgba\([\d., ]+\)$/.test(style.background || '')) span.style.backgroundColor = style.background;
    if (selection && char.id >= selection.start && char.id < selection.end) span.classList.add('selected');
    node.append(span);
  }
  return node;
}
function paginate(theme) {
  const measure = document.createElement('div'); measure.className = 'measure'; document.body.append(measure);
  const pages = []; let paper, content;
  const nextPage = () => {
    paper = makePaper(theme); measure.replaceChildren(paper); content = paper.querySelector('.paper-content');
    // Profile height is variable; the text always stops above the footer.
    content.style.height = `${paper.querySelector('.paper-footer').offsetTop - content.offsetTop - 14}px`;
    pages.push(paper);
  };
  nextPage();
  for (const block of blocks) {
    let remaining = block.chars;
    while (remaining.length) {
      const full = makeBlock(block, remaining); content.append(full);
      if (content.scrollHeight <= content.clientHeight) break;
      full.remove();
      let low = 0, high = remaining.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2), trial = makeBlock(block, remaining.slice(0, mid)); content.append(trial);
        const fits = content.scrollHeight <= content.clientHeight; trial.remove();
        if (fits) low = mid; else high = mid - 1;
      }
      if (low) { content.append(makeBlock(block, remaining.slice(0, low))); remaining = remaining.slice(low); }
      if (!low && !content.children.length) { throw new Error('身份资料占用过多空间，请缩短简介。'); }
      nextPage();
    }
  }
  measure.remove(); return pages;
}
const observer = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const scale = entry.contentRect.width / 432;
    entry.target.style.height = `${576 * scale}px`;
    entry.target.firstElementChild.style.transform = `scale(${scale})`;
  }
});
function render() {
  observer.disconnect(); $('cards').replaceChildren();
  $('cards').classList.toggle('single', !state.compare);
  const keys = state.compare ? ['wheat', 'lime'] : [state.active];
  for (const key of keys) {
    const theme = state.themes[key], column = document.createElement('section'); column.className = 'theme-column'; column.dataset.theme = key;
    const heading = document.createElement('div'); heading.className = 'column-heading';
    const name = document.createElement('strong'); name.textContent = theme.name;
    const font = document.createElement('small'); font.textContent = theme.font === 'wenkai' ? '霞鹜文楷' : '系统黑体'; heading.append(name, font); column.append(heading);
    const pages = paginate(theme);
    pages.forEach((paper, i) => {
      paper.querySelector('.page-number').textContent = `${String(i+1).padStart(2,'0')} / ${String(pages.length).padStart(2,'0')}`;
      paper.setAttribute('aria-label', `${theme.name}第${i+1}张卡片`);
      const shell = document.createElement('div'); shell.className = 'card-shell'; shell.append(paper); column.append(shell); observer.observe(shell);
      const label = document.createElement('div'); label.className = 'page-label'; label.textContent = `${i+1}.png · 1728 × 2304`; column.append(label);
    });
    $('cards').append(column);
  }
  updateExport();
}
function getPoint(node, offset) {
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  const span = el.closest?.('[data-i]'); if (!span) return null;
  return Number(span.dataset.i) + (offset > 0 ? 1 : 0);
}
document.addEventListener('selectionchange', () => {
  const browserSelection = window.getSelection(); if (!browserSelection.rangeCount || browserSelection.isCollapsed) return;
  const range = browserSelection.getRangeAt(0);
  const start = getPoint(range.startContainer, range.startOffset), end = getPoint(range.endContainer, range.endOffset);
  const first = range.startContainer.parentElement?.closest('.theme-column');
  const last = range.endContainer.parentElement?.closest('.theme-column');
  if (start === null || end === null || start >= end || first !== last || !first) return;
  selection = { start, end }; updateSelection();
});
function updateSelection() {
  const count = selection ? selection.end - selection.start : 0;
  $('selection-count').textContent = count ? `已选 ${count} 字` : '未选中文字';
  $('selection-text').textContent = count ? allChars.slice(selection.start, selection.end).map(c => c.text).join('') : '请先在卡片中拖选文字';
  ['bold', 'italic', 'underline', 'clear', 'text-color-trigger', 'highlight-trigger', 'apply-color', 'apply-highlight'].forEach(id => $(id).disabled = !count);
  for (const styleName of ['bold', 'italic', 'underline']) {
    const active = count && allChars.slice(selection.start, selection.end).every(c => (state.edits[c.id]?.[styleName] ?? c.base[styleName]));
    $(styleName).setAttribute('aria-pressed', String(Boolean(active)));
  }
  document.querySelectorAll('.theme-column [data-i]').forEach(span => {
    const id = Number(span.dataset.i);
    span.classList.toggle('selected', Boolean(selection && id >= selection.start && id < selection.end));
  });
}
function applyStyle(patch) {
  if (!selection) return;
  change(() => { for (let i = selection.start; i < selection.end; i++) state.edits[i] = { ...(state.edits[i] || {}), ...patch }; });
  $('announcement').textContent = `已调整 ${selection.end - selection.start} 个字，原文保持不变。`;
  updateSelection();
}
$('bold').onclick = () => {
  const allBold = allChars.slice(selection.start, selection.end).every(c => (state.edits[c.id]?.bold ?? c.base.bold));
  applyStyle({ bold: !allBold });
};
$('italic').onclick = () => {
  const allItalic = allChars.slice(selection.start, selection.end).every(c => (state.edits[c.id]?.italic ?? c.base.italic));
  applyStyle({ italic: !allItalic });
};
$('underline').onclick = () => {
  const allUnderline = allChars.slice(selection.start, selection.end).every(c => (state.edits[c.id]?.underline ?? c.base.underline));
  applyStyle({ underline: !allUnderline });
};
$('clear').onclick = () => {
  change(() => { for (let i = selection.start; i < selection.end; i++) delete state.edits[i]; });
  updateSelection();
};
function readColor(id) {
  const value = $(id).value.trim();
  $('text-error').textContent = validHex(value) ? '' : '请输入完整 HEX 色码，例如 #117C0D。';
  $(id).setAttribute('aria-invalid', String(!validHex(value)));
  return validHex(value) ? value : null;
}
function applyHighlight(value) {
  const opacity = Number($('opacity-number').value);
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100 || $('opacity-number').value === '') { $('text-error').textContent = '透明度请输入 0 到 100。'; return false; }
  if (!value) return false;
  const rgb = [1,3,5].map(i => parseInt(value.slice(i,i+2),16));
  applyStyle({ background: `rgba(${rgb.join(',')},${opacity/100})` });
  return true;
}
$('apply-color').onclick = () => { const value = readColor('text-color'); if (value) { applyStyle({ color: value }); closePopovers(); } };
$('apply-highlight').onclick = () => { const value = readColor('highlight-color'); if (value && applyHighlight(value)) closePopovers(); };
for (const role of ['text', 'highlight']) {
  $(`${role}-picker`).oninput = (e) => {
    $(`${role}-color`).value = e.target.value.toUpperCase();
    document.querySelector(`.${role}-indicator`).style.background = e.target.value;
  };
  $(`${role}-color`).oninput = (e) => {
    if (validHex(e.target.value)) {
      $(`${role}-picker`).value = e.target.value;
      document.querySelector(`.${role}-indicator`).style.background = e.target.value;
    }
  };
}
$('opacity').oninput = e => $('opacity-number').value = e.target.value;
$('opacity-number').oninput = e => { if (e.target.value !== '' && Number(e.target.value) >= 0 && Number(e.target.value) <= 100) $('opacity').value = e.target.value; };
function closePopovers() {
  for (const [triggerId, popoverId] of [['text-color-trigger','text-color-popover'],['highlight-trigger','highlight-popover']]) {
    $(popoverId).hidden = true;
    $(triggerId).setAttribute('aria-expanded', 'false');
  }
}
function togglePopover(triggerId, popoverId) {
  const willOpen = $(popoverId).hidden;
  closePopovers();
  if (willOpen) { $(popoverId).hidden = false; $(triggerId).setAttribute('aria-expanded', 'true'); }
}
$('text-color-trigger').onclick = event => { event.stopPropagation(); togglePopover('text-color-trigger', 'text-color-popover'); };
$('highlight-trigger').onclick = event => { event.stopPropagation(); togglePopover('highlight-trigger', 'highlight-popover'); };
document.querySelectorAll('.color-popover').forEach(popover => popover.onclick = event => event.stopPropagation());
document.addEventListener('click', closePopovers);
document.addEventListener('keydown', event => { if (event.key === 'Escape') closePopovers(); });
document.querySelectorAll('[data-text-swatch]').forEach(button => button.onclick = () => {
  const value = button.dataset.textSwatch;
  $('text-color').value = value; $('text-picker').value = value;
  document.querySelector('.text-indicator').style.background = value;
  applyStyle({ color: value }); closePopovers();
});
document.querySelectorAll('[data-highlight-swatch]').forEach(button => button.onclick = () => {
  const value = button.dataset.highlightSwatch;
  $('highlight-color').value = value; $('highlight-picker').value = value;
  document.querySelector('.highlight-indicator').style.background = value;
  applyHighlight(value); closePopovers();
});
$('undo').onclick = () => travel(past, future);
$('redo').onclick = () => travel(future, past);
$('compare').onclick = () => change(() => state.compare = true, true);
$('single').onclick = () => change(() => state.compare = false, true);
document.querySelectorAll('[data-theme]').forEach(button => button.onclick = () => change(() => state.active = button.dataset.theme, true));
$('font').onchange = e => change(() => state.themes[state.active].font = e.target.value);
$('restore-theme').onclick = () => change(() => state.themes[state.active] = clone(DEFAULTS[state.active]), true);
const colorNames = { paper: '背景', heading: '标题', body: '正文', accent: '点缀' };
for (const [role, name] of Object.entries(colorNames)) {
  const box = document.createElement('div');
  const label = document.createElement('label'); label.className = 'field-label'; label.htmlFor = `theme-${role}`; label.textContent = name;
  const row = document.createElement('div'); row.className = 'color-row';
  const picker = document.createElement('input'); picker.type = 'color'; picker.id = `picker-${role}`; picker.setAttribute('aria-label', `${name}色板`);
  const hex = document.createElement('input'); hex.id = `theme-${role}`; hex.maxLength = 7; hex.setAttribute('aria-label', `${name}色码`);
  const update = value => {
    if (!validHex(value)) { $('theme-error').textContent = `${name}请输入完整 HEX 色码，例如 #F1ECE0。`; hex.setAttribute('aria-invalid','true'); return; }
    hex.setAttribute('aria-invalid','false'); $('theme-error').textContent = ''; picker.value = value; hex.value = value.toUpperCase();
    change(() => state.themes[state.active][role] = value);
  };
  picker.onchange = e => update(e.target.value); hex.onchange = e => update(e.target.value.trim());
  row.append(picker, hex); box.append(label, row); $('theme-colors').append(box);
}
function syncControls() {
  document.querySelectorAll('button[data-theme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.theme === state.active)));
  $('compare').setAttribute('aria-pressed', String(state.compare)); $('single').setAttribute('aria-pressed', String(!state.compare));
  const theme = state.themes[state.active]; $('font').value = theme.font;
  Object.keys(colorNames).forEach(role => { $(`theme-${role}`).value = theme[role].toUpperCase(); $(`picker-${role}`).value = theme[role]; });
  $('profile-name').value = state.profile.name; $('profile-bio').value = state.profile.bio;
  $('saved-theme').replaceChildren(new Option('选择主题', ''));
  state.custom.forEach((theme, i) => $('saved-theme').add(new Option(theme.name, String(i))));
}
$('save-theme').onclick = () => {
  const name = $('theme-name').value.trim();
  if (!name) { $('theme-error').textContent = '请先填写主题名称。'; return; }
  if (state.custom.some(t => t.name === name)) { $('theme-error').textContent = '这个名称已存在，请使用另一个名称。'; return; }
  change(() => state.custom.push({ ...clone(state.themes[state.active]), name }), true);
  $('theme-error').textContent = ''; $('announcement').textContent = `已保存主题 ${name}`;
};
$('saved-theme').onchange = e => { if (e.target.value !== '') change(() => state.themes[state.active] = clone(state.custom[Number(e.target.value)]), true); };
for (const [id, role] of [['profile-name','name'],['profile-bio','bio']]) $(id).onchange = e => change(() => state.profile[role] = e.target.value);
$('avatar').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { $('avatar-error').textContent = '请选择小于 2 MB 的 PNG、JPEG 或 WebP 图片。'; return; }
  const reader = new FileReader();
  reader.onerror = () => $('avatar-error').textContent = '头像读取失败，请重新选择。';
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => $('avatar-error').textContent = '无法解码此图片，请换一张头像。';
    image.onload = () => { $('avatar-error').textContent = ''; change(() => state.profile.avatar = reader.result); };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
};
function updateExport() {
  const pages = document.querySelectorAll(`.theme-column[data-theme="${state.active}"] .paper`).length || paginate(state.themes[state.active]).length;
  $('export-theme').textContent = state.themes[state.active].name;
  $('export-path').textContent = `会话选段-3比4图文/\n${Array.from({length:pages},(_,i) => `  ${i+1}.png`).join('\n')}`;
}
$('export').onclick = () => { $('export-panel').hidden = false; updateExport(); $('export-panel').scrollIntoView({ block:'nearest' }); };
$('close-export').onclick = () => $('export-panel').hidden = true;
syncControls(); updateSelection(); render();
document.fonts.load('20px WenkaiLocal').then(() => {
  const available = document.fonts.check('20px WenkaiLocal');
  $('font-status').textContent = available ? '霞鹜文楷已就绪' : '霞鹜文楷未检测到，当前使用后备字体';
  scheduleRender();
}).catch(() => { $('font-status').textContent = '霞鹜文楷未检测到，当前使用后备字体'; });
if (!storageAvailable) $('save-status').textContent = '存储不可用，当前修改仅本次有效';
