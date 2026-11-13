const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
const before = hash(fs.readFileSync('dist/index.html'));
const { out, offlineName } = require('./build-deliverables.cjs');
assert.equal(hash(fs.readFileSync('dist/index.html')), before, 'unchanged assets must retain stable version URLs');
const index = fs.readFileSync('dist/index.html', 'utf8');
for (const asset of ['style.css', 'duel-art.js', 'engine.js', 'ui.js']) {
  const fingerprint = hash(fs.readFileSync('dist/' + asset)).slice(0, 12);
  assert(index.includes(asset + '?v=' + fingerprint), asset + ' must point to its current content');
}
const offline = fs.readFileSync(require('node:path').join(out, offlineName), 'utf8');
assert(!/(?:src|href)="(?:engine\.js|ui\.js|duel-art\.js|style\.css)/.test(offline), 'offline file must embed its code and styles');
assert.equal(hash(fs.readFileSync('dist/engine.js')), hash(fs.readFileSync('wechat/engine.js')));
assert.equal(hash(fs.readFileSync('dist/duel-art.js')), hash(fs.readFileSync('wechat/duel-art.js')));
for (const match of offline.matchAll(/<script>([\s\S]*?)<\/script>/g)) new (require('node:vm').Script)(match[1]);
console.log('PASS stable asset URLs, current content, standalone offline file and matching WeChat engine');

