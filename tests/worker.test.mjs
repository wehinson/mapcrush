import assert from "node:assert/strict";
import test from "node:test";

import {
  SessionCoordinator,
  applyProfileUpdate,
  applySharedAction,
  normalizeSessionRecord,
  publicSession
} from "../worker.js";

function profile(rounds = 0) {
  return {
    ratings: { japan: 1000, italy: 1000 },
    rounds,
    currentPair: ["japan", "italy"],
    loved: [],
    comments: {},
    donationHidden: false,
    history: []
  };
}

function sessionRecord() {
  return normalizeSessionRecord({
    passcode: "482913",
    mode: "partner",
    profileNames: { me: "Ed", partner: "Partner" },
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    removedCountryIds: [],
    removalSuggestions: {},
    profiles: {
      me: profile(),
      partner: profile()
    }
  }, "482913");
}

class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }

  async get(key) {
    return structuredClone(this.values.get(key));
  }

  async put(key, value) {
    this.values.set(key, structuredClone(value));
  }
}

class MemoryKv {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async put(key, value) {
    this.values.set(key, value);
  }
}

function coordinatorWith(storage, kv = new MemoryKv()) {
  const backgroundTasks = [];
  const ctx = {
    storage,
    waitUntil(promise) {
      backgroundTasks.push(promise);
    }
  };
  return {
    coordinator: new SessionCoordinator(ctx, { KV_BINDING: kv }),
    backgroundTasks
  };
}

test("both partners can save at the same time without replacing each other", async () => {
  const storage = new MemoryStorage({ session: sessionRecord() });
  const { coordinator } = coordinatorWith(storage);

  const me = profile(12);
  const partner = profile(27);
  const [meResponse, partnerResponse] = await Promise.all([
    coordinator.fetch(new Request("https://mapcrush.test/api/sessions/482913/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor: "me",
        expectedProfileRevision: 0,
        mutationId: "mutation-me-0001",
        profile: me
      })
    })),
    coordinator.fetch(new Request("https://mapcrush.test/api/sessions/482913/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor: "partner",
        expectedProfileRevision: 0,
        mutationId: "mutation-partner-0001",
        profile: partner
      })
    }))
  ]);

  assert.equal(meResponse.status, 200);
  assert.equal(partnerResponse.status, 200);

  const saved = await storage.get("session");
  assert.equal(saved.profiles.me.rounds, 12);
  assert.equal(saved.profiles.partner.rounds, 27);
  assert.deepEqual(saved.profileRevisions, { me: 1, partner: 1 });
  assert.equal(saved.sessionRevision, 2);
});

test("a stale save for the same profile is rejected", () => {
  const record = sessionRecord();
  const first = applyProfileUpdate(record, {
    actor: "me",
    expectedProfileRevision: 0,
    mutationId: "mutation-first-0001",
    profile: profile(4)
  });
  const stale = applyProfileUpdate(record, {
    actor: "me",
    expectedProfileRevision: 0,
    mutationId: "mutation-stale-0001",
    profile: profile(9)
  });

  assert.equal(first.ok, true);
  assert.equal(stale.ok, false);
  assert.equal(stale.status, 409);
  assert.equal(record.profiles.me.rounds, 4);
});

test("a repeated mutation is applied only once", () => {
  const record = sessionRecord();
  const update = {
    actor: "partner",
    expectedProfileRevision: 0,
    mutationId: "mutation-repeat-0001",
    profile: profile(8)
  };

  assert.equal(applyProfileUpdate(record, update).ok, true);
  assert.equal(applyProfileUpdate(record, update).duplicate, true);
  assert.equal(record.profileRevisions.partner, 1);
  assert.equal(record.sessionRevision, 1);
});

test("shared removal actions preserve profile data and clear affected pairs", () => {
  const record = sessionRecord();
  const suggestion = applySharedAction(record, {
    type: "suggest-removal",
    actor: "me",
    countryId: "japan",
    mutationId: "mutation-suggest-0001"
  });
  const removal = applySharedAction(record, {
    type: "remove-country",
    actor: "partner",
    countryId: "japan",
    mutationId: "mutation-remove-0001"
  });

  assert.equal(suggestion.ok, true);
  assert.equal(removal.ok, true);
  assert.deepEqual(record.removedCountryIds, ["japan"]);
  assert.deepEqual(record.removalSuggestions, {});
  assert.equal(record.profiles.me.currentPair, null);
  assert.equal(record.profiles.partner.currentPair, null);
  assert.equal(record.profiles.me.rounds, 0);
});

test("an existing KV session migrates when it is first loaded", async () => {
  const legacy = sessionRecord();
  delete legacy.schemaVersion;
  delete legacy.sessionRevision;
  delete legacy.sharedRevision;
  delete legacy.profileRevisions;
  legacy.activeProfile = "partner";

  const storage = new MemoryStorage();
  const kv = new MemoryKv({
    "session:482913": JSON.stringify(publicSession(legacy))
  });
  const { coordinator } = coordinatorWith(storage, kv);
  const response = await coordinator.fetch(
    new Request("https://mapcrush.test/api/sessions/482913")
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.session.schemaVersion, 2);
  assert.deepEqual(payload.session.profileRevisions, { me: 0, partner: 0 });
  assert.equal("activeProfile" in payload.session, false);
  assert.equal((await storage.get("session")).schemaVersion, 2);
});

test("export returns the canonical synchronized session without internal mutation data", async () => {
  const record = sessionRecord();
  applyProfileUpdate(record, {
    actor: "me",
    expectedProfileRevision: 0,
    mutationId: "mutation-export-0001",
    profile: profile(15)
  });

  const storage = new MemoryStorage({ session: record });
  const { coordinator } = coordinatorWith(storage);
  const response = await coordinator.fetch(
    new Request("https://mapcrush.test/api/sessions/482913/export")
  );
  const exported = await response.json();

  assert.equal(response.status, 200);
  assert.equal(exported.format, "mapcrush-save");
  assert.equal(exported.session.profiles.me.rounds, 15);
  assert.equal("_appliedMutationIds" in exported.session, false);
  assert.match(response.headers.get("Content-Disposition"), /mapcrush-482913-/);
});
