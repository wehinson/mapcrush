import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { applyProfileUpdate, applySharedAction, normalizeSessionRecord, publicSession } from '../worker.js';

// Execute the actual application declarations. Only DOM rendering and timers are
// stubbed; merge, save, action, edit, actor-switch and pair handlers are unchanged.
const source = readFileSync(process.env.MAPCRUSH_SCRIPT || new URL('../public/js/script.js', import.meta.url), 'utf8');
function harness() {
  const pending = [];
  const context = vm.createContext({
    window: { COUNTRY_DATA: ['japan', 'italy', 'france'].map(id => ({ id, name: id, summary: id, photos: ['photo'] })), addEventListener() {} },
    document: { querySelector: () => ({ textContent: '' }) },
    structuredClone, crypto: webcrypto, setTimeout: () => 1, clearTimeout() {},
    fetch: (url, options) => new Promise(resolve => pending.push({ url, body: JSON.parse(options.body), resolve }))
  });
  vm.runInContext(source.slice(0, source.indexOf('els.showExistingSession.addEventListener')), context);
  vm.runInContext(`
    for (const name of ['renderPair', 'renderRankings', 'renderLovedList', 'renderRemovedList',
      'renderCommentsFeed', 'renderDonationFooter', 'renderSession', 'showSaveStateSoon']) {
      globalThis[name] = () => {};
    }
    session = makeSession('482913', 'partner');
    for (const actor of ['me', 'partner']) {
      session.profiles[actor].rounds = 1;
      session.profiles[actor].currentPair = ['japan', 'italy'];
    }
    renderApp();
  `, context);
  const run = code => vm.runInContext(code, context);
  const state = () => JSON.parse(run('JSON.stringify(session)'));
  const server = normalizeSessionRecord(state(), '482913');
  function accept(index) {
    const req = pending[index];
    const result = req.url.endsWith('/profile') ? applyProfileUpdate(server, req.body) : applySharedAction(server, req.body);
    return { status: result.ok ? 200 : result.status, session: structuredClone(publicSession(server)) };
  }
  function respond(index, snapshot) {
    pending[index].resolve({ ok: snapshot.status === 200, status: snapshot.status, json: async () => ({ session: snapshot.session }) });
  }
  return { run, state, server, pending, accept, respond };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const start = h => h.run(`sendSharedAction({type: 'suggest-removal', countryId: 'france'}, 'Suggested')`);
function edit(h) {
  h.run(`applyWin(currentPair[0], currentPair[1]); getActiveProfile().history.push('japan>italy'); advance('Chosen');
    toggleLove('italy'); saveComment('italy', 'New comment');`);
}
function assertEdits(profile) {
  assert.equal(profile.rounds, 2);
  assert.equal(profile.ratings.japan, 1016);
  assert.deepEqual(profile.history, ['japan>italy']);
  assert.deepEqual(profile.loved, ['italy']);
  assert.equal(profile.comments.italy.text, 'New comment');
}
async function saveRetained(h, actor = 'me') {
  const index = h.pending.length;
  const saving = h.run('flushSessionSave()');
  assert.equal(h.pending[index].body.actor, actor);
  assert.equal(h.pending[index].body.expectedProfileRevision, h.server.profileRevisions[actor]);
  const snapshot = h.accept(index);
  assert.equal(snapshot.status, 200);
  h.respond(index, snapshot);
  assert.equal(await saving, true);
  assertEdits(h.server.profiles[actor]);
  assert.equal(h.run(`dirtyProfiles.has('${actor}')`), false);
}

test('pending shared response retains ranking, rounds, comments and love, then saves them', async () => {
  const h = harness();
  const action = start(h);
  const snapshot = h.accept(0);
  edit(h);
  h.respond(0, snapshot);
  assert.equal(await action, true);
  assertEdits(h.state().profiles.me);
  assert.equal(h.run("dirtyProfiles.has('me')"), true);
  assert.equal(h.state().sharedRevision, 1);
  await saveRetained(h);
});

test('without local edits the canonical profiles and revisions are adopted', async () => {
  const h = harness();
  const action = start(h);
  applyProfileUpdate(h.server, {actor: 'partner', expectedProfileRevision: 0, mutationId: 'remote-partner', profile: {...h.server.profiles.partner, rounds: 9}});
  h.respond(0, h.accept(0));
  await action;
  assert.equal(h.state().profiles.partner.rounds, 9);
  assert.deepEqual(h.state().profileRevisions, {me: 0, partner: 1});
  assert.equal(h.run('dirtyProfiles.size'), 0);
});

for (const actor of ['me', 'partner']) {
  test(`switching actors during the request retains ${actor} edits under the correct profile`, async () => {
    const h = harness();
    const action = start(h);
    const snapshot = h.accept(0);
    if (actor === 'partner') h.run('switchProfile()');
    edit(h);
    if (actor === 'me') h.run('switchProfile()');
    h.respond(0, snapshot);
    await action;
    assert.equal(h.state().activeProfile, 'partner');
    assertEdits(h.state().profiles[actor]);
    assert.equal(h.state().profiles[actor === 'me' ? 'partner' : 'me'].rounds, 1);
    await saveRetained(h, actor);
  });
}

test('removals survive retained profiles; both pairs invalidate and regenerate without removed countries', async () => {
  const h = harness();
  const action = h.run("sendSharedAction({type: 'remove-country', countryId: 'japan'}, 'Removed')");
  const snapshot = h.accept(0);
  edit(h);
  h.run("session.profiles.me.currentPair = ['japan', 'italy']; switchProfile(); toggleLove('france')");
  h.respond(0, snapshot);
  await action;
  assert.deepEqual(h.state().removedCountryIds, ['japan']);
  assertEdits(h.state().profiles.me);
  assert.equal(h.state().profiles.me.currentPair, null);
  assert.equal(h.state().profiles.partner.currentPair.includes('japan'), false);
  h.run('switchProfile()');
  assert.equal(h.state().profiles.me.currentPair.includes('japan'), false);
  assert.deepEqual(h.state().profileRevisions, {me: 1, partner: 1});
  // Save drains both dirty profiles, preserving authoritative removal revisions.
  const saving = h.run('flushSessionSave()');
  const index = 1;
  assert.equal(h.pending[index].body.expectedProfileRevision, 1);
  h.respond(index, h.accept(index));
  await saving;
  await tick();
  if (h.pending[2]) { h.respond(2, h.accept(2)); await tick(); }
  assertEdits(h.server.profiles.me);
  assert.equal(h.server.profiles.me.currentPair.includes('japan'), false);
});

for (const responseOrder of ['shared-first', 'save-first']) {
  for (const serverOrder of ['shared-first', 'save-first']) {
    test(`in-flight profile save plus newer edits: server ${serverOrder}, responses ${responseOrder}`, async () => {
      const h = harness();
      edit(h);
      const saving = h.run('flushSessionSave()'); // revision 0, rounds 2
      const action = start(h);
      const snapshots = {};
      for (const index of serverOrder === 'shared-first' ? [1, 0] : [0, 1]) snapshots[index] = h.accept(index);
      h.run("getActiveProfile().rounds = 3; saveComment('italy', 'Latest');");
      for (const index of responseOrder === 'shared-first' ? [1, 0] : [0, 1]) {
        h.respond(index, snapshots[index]);
        await (index === 0 ? saving : action);
      }
      assert.equal(h.state().profiles.me.rounds, 3);
      assert.equal(h.state().profiles.me.comments.italy.text, 'Latest');
      assert.equal(h.state().profileRevisions.me, 1);
      assert.equal(h.state().sharedRevision, 1);
      assert.equal(h.state().sessionRevision, 2);
      assert.equal(h.run("dirtyProfiles.has('me')"), true);
      // The save handler automatically queues retained edits after acknowledgment.
      assert.equal(h.pending[2].body.expectedProfileRevision, 1);
      h.respond(2, h.accept(2));
      await tick();
      assert.equal(h.server.profiles.me.rounds, 3);
      assert.equal(h.server.profiles.me.comments.italy.text, 'Latest');
      assert.equal(h.run('dirtyProfiles.size'), 0);
    });
  }
}

test('an older save response cannot undo a shared removal or its profile revision', async () => {
  const h = harness();
  edit(h);
  h.run("session.profiles.me.currentPair = ['japan', 'italy']");
  const saving = h.run('flushSessionSave()');
  const saved = h.accept(0);
  const action = h.run("sendSharedAction({type: 'remove-country', countryId: 'japan'}, 'Removed')");
  h.respond(1, h.accept(1));
  await action;
  h.respond(0, saved);
  await saving;
  assert.deepEqual(h.state().removedCountryIds, ['japan']);
  assert.equal(h.state().profileRevisions.me, 2);
  assert.equal(h.state().profiles.me.currentPair.includes('japan'), false);
  assert.equal(h.state().sessionRevision, 2);
});

test('a shared snapshot older than an acknowledged save cannot roll back a clean profile', async () => {
  const h = harness();
  const action = start(h);
  const shared = h.accept(0);
  edit(h);
  const saving = h.run('flushSessionSave()');
  h.respond(1, h.accept(1));
  await saving;
  assert.equal(h.run('dirtyProfiles.size'), 0);
  h.respond(0, shared);
  await action;
  assertEdits(h.state().profiles.me);
  assert.equal(h.state().profileRevisions.me, 1);
  assert.equal(h.state().sessionRevision, 2);
});

test('profiles already dirty before a shared action also retain their edits', async () => {
  const h = harness();
  edit(h);
  const action = start(h);
  h.respond(0, h.accept(0));
  await action;
  assertEdits(h.state().profiles.me);
  await saveRetained(h);
});

test('a removal that wins a race with an old profile save retains existing conflict protection', async () => {
  const h = harness();
  h.run('window.confirm = () => false');
  edit(h);
  h.run("session.profiles.me.currentPair = ['japan', 'italy']");
  const saving = h.run('flushSessionSave()');
  const action = h.run("sendSharedAction({type: 'remove-country', countryId: 'japan'}, 'Removed')");
  h.respond(1, h.accept(1));
  await action;
  const rejected = h.accept(0);
  assert.equal(rejected.status, 409);
  h.respond(0, rejected);
  assert.equal(await saving, false);
  assert.equal(h.run('profileConflict'), true);
  assert.equal(h.run("dirtyProfiles.has('me')"), true);
  assertEdits(h.state().profiles.me);
  assert.deepEqual(h.state().removedCountryIds, ['japan']);
  assert.equal(h.state().profiles.me.currentPair.includes('japan'), false);
  assert.equal(h.state().profileRevisions.me, 1);
  assert.equal(await h.run('flushSessionSave()'), false);
});
