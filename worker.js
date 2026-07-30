const SESSION_PREFIX = "session:";
const SESSION_BACKUP_PREFIX = "session-backup:";
const FEEDBACK_PREFIX = "feedback:";
const SESSION_STORAGE_KEY = "session";
const PASSCODE_PATTERN = /^\d{6}$/;
const PROFILE_NAMES = ["me", "partner"];
const BODY_SIZE_LIMIT = 512 * 1024;
const FEEDBACK_SIZE_LIMIT = 64 * 1024;
const MUTATION_HISTORY_LIMIT = 100;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/feedback") {
      return handleFeedbackRequest(request, env);
    }

    if (url.pathname.startsWith("/api/sessions")) {
      return routeSessionRequest(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

export class SessionCoordinator {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sockets = new Set();
    this.mutationQueue = Promise.resolve();
  }

  async fetch(request) {
    const url = new URL(request.url);
    let passcode = sessionPasscodeFromPath(url.pathname);

    if (request.method === "POST" && url.pathname === "/api/sessions") {
      const parsed = await readJsonBody(request.clone(), BODY_SIZE_LIMIT);
      if (!parsed.ok) {
        return jsonResponse({ error: parsed.error }, parsed.status);
      }
      passcode = normalizePasscode(parsed.value?.passcode);
    }

    if (request.method === "OPTIONS") {
      return jsonResponse({}, 204);
    }

    if (!PASSCODE_PATTERN.test(passcode || "")) {
      return jsonResponse({ error: "Use a six-digit passcode." }, 400);
    }

    if (url.pathname.endsWith("/sync")) {
      return this.openSyncSocket(request, passcode);
    }

    if (url.pathname.endsWith("/export") && request.method === "GET") {
      await this.mutationQueue;
      return this.exportSession(passcode);
    }

    if (url.pathname.endsWith("/profile") && request.method === "PATCH") {
      return this.enqueueMutation(() => this.updateProfile(request, passcode));
    }

    if (url.pathname.endsWith("/actions") && request.method === "POST") {
      return this.enqueueMutation(() => this.applyAction(request, passcode));
    }

    if (request.method === "POST" && url.pathname === "/api/sessions") {
      return this.enqueueMutation(() => this.createSession(request, passcode));
    }

    if (request.method === "GET") {
      await this.mutationQueue;
      return this.getSession(passcode);
    }

    if (request.method === "PUT") {
      return jsonResponse({
        error: "This MapCrush page is out of date. Reload before saving."
      }, 426);
    }

    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  enqueueMutation(callback) {
    const result = this.mutationQueue.then(callback, callback);
    this.mutationQueue = result.catch(() => {});
    return result;
  }

  async createSession(request, passcode) {
    const existing = await this.loadSession(passcode);

    if (existing) {
      return jsonResponse({ error: "That passcode already exists." }, 409);
    }

    const parsed = await readJsonBody(request, BODY_SIZE_LIMIT);
    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, parsed.status);
    }

    const validationError = validateNewSession(parsed.value, passcode);
    if (validationError) {
      return jsonResponse({ error: validationError }, 400);
    }

    const record = normalizeSessionRecord(parsed.value, passcode);
    await this.storeSession(record);
    this.broadcastRevision(record, ["session"]);
    return jsonResponse({ session: publicSession(record) }, 201);
  }

  async getSession(passcode) {
    const record = await this.loadSession(passcode);

    if (!record) {
      return jsonResponse({ error: "No online ranking found for that passcode." }, 404);
    }

    return jsonResponse({ session: publicSession(record) });
  }

  async updateProfile(request, passcode) {
    const record = await this.loadSession(passcode);
    if (!record) {
      return jsonResponse({ error: "No online ranking found for that passcode." }, 404);
    }

    const parsed = await readJsonBody(request, BODY_SIZE_LIMIT);
    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, parsed.status);
    }

    const result = applyProfileUpdate(record, parsed.value);
    if (!result.ok) {
      const body = { error: result.error };
      if (result.conflict) {
        body.session = publicSession(record);
      }
      return jsonResponse(body, result.status);
    }

    if (result.duplicate) {
      return jsonResponse({ session: publicSession(record), duplicate: true });
    }

    await this.storeSession(record);
    this.broadcastRevision(record, [`profiles.${parsed.value.actor}`]);
    return jsonResponse({ session: publicSession(record) });
  }

  async applyAction(request, passcode) {
    const record = await this.loadSession(passcode);
    if (!record) {
      return jsonResponse({ error: "No online ranking found for that passcode." }, 404);
    }

    const parsed = await readJsonBody(request, BODY_SIZE_LIMIT);
    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, parsed.status);
    }

    const result = applySharedAction(record, parsed.value);
    if (!result.ok) {
      return jsonResponse({ error: result.error }, result.status);
    }

    if (result.duplicate) {
      return jsonResponse({ session: publicSession(record), duplicate: true });
    }

    await this.storeSession(record);
    this.broadcastRevision(record, ["shared"]);
    return jsonResponse({ session: publicSession(record) });
  }

  async exportSession(passcode) {
    const record = await this.loadSession(passcode);
    if (!record) {
      return jsonResponse({ error: "No online ranking found for that passcode." }, 404);
    }

    const body = {
      format: "mapcrush-save",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      session: publicSession(record)
    };

    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="mapcrush-${passcode}-${dateStamp()}.json"`
      }
    });
  }

  async openSyncSocket(request, passcode) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return jsonResponse({ error: "A WebSocket connection is required." }, 426);
    }

    const record = await this.loadSession(passcode);
    if (!record) {
      return jsonResponse({ error: "No online ranking found for that passcode." }, 404);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.sockets.add(server);

    const removeSocket = () => this.sockets.delete(server);
    server.addEventListener("close", removeSocket);
    server.addEventListener("error", removeSocket);
    server.send(JSON.stringify({
      type: "connected",
      sessionRevision: record.sessionRevision
    }));

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcastRevision(record, changed) {
    const message = JSON.stringify({
      type: "session-updated",
      sessionRevision: record.sessionRevision,
      changed
    });

    for (const socket of this.sockets) {
      try {
        socket.send(message);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }

  async loadSession(passcode) {
    const stored = await this.ctx.storage.get(SESSION_STORAGE_KEY);
    if (stored) {
      return normalizeSessionRecord(stored, passcode);
    }

    const legacyStore = getSessionStore(this.env);
    if (!legacyStore) {
      return null;
    }

    const legacy = await legacyStore.get(sessionKey(passcode));
    if (!legacy) {
      return null;
    }

    try {
      const migrated = normalizeSessionRecord(JSON.parse(legacy), passcode);
      await this.ctx.storage.put(SESSION_STORAGE_KEY, migrated);
      return migrated;
    } catch {
      return null;
    }
  }

  async storeSession(record) {
    await this.ctx.storage.put(SESSION_STORAGE_KEY, record);

    const backupStore = getSessionStore(this.env);
    if (backupStore && this.ctx.waitUntil) {
      const backup = backupStore.put(
        `${SESSION_BACKUP_PREFIX}${record.passcode}`,
        JSON.stringify(publicSession(record))
      );
      this.ctx.waitUntil(backup);
    }
  }
}

async function routeSessionRequest(request, env) {
  if (request.method === "OPTIONS") {
    return jsonResponse({}, 204);
  }

  if (!env.SESSION_COORDINATOR) {
    return jsonResponse({
      error: "The session coordinator binding is missing."
    }, 500);
  }

  const url = new URL(request.url);
  let passcode = sessionPasscodeFromPath(url.pathname);

  if (request.method === "POST" && url.pathname === "/api/sessions") {
    const parsed = await readJsonBody(request.clone(), BODY_SIZE_LIMIT);
    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, parsed.status);
    }
    passcode = normalizePasscode(parsed.value?.passcode);
  }

  if (!PASSCODE_PATTERN.test(passcode || "")) {
    return jsonResponse({ error: "Use a six-digit passcode." }, 400);
  }

  const stub = typeof env.SESSION_COORDINATOR.getByName === "function"
    ? env.SESSION_COORDINATOR.getByName(passcode)
    : env.SESSION_COORDINATOR.get(env.SESSION_COORDINATOR.idFromName(passcode));

  return stub.fetch(request);
}

async function handleFeedbackRequest(request, env) {
  if (request.method === "OPTIONS") {
    return jsonResponse({}, 204);
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const store = getSessionStore(env);
  if (!store) {
    return jsonResponse({ error: "Cloudflare KV binding is missing." }, 500);
  }

  const parsed = await readJsonBody(request, FEEDBACK_SIZE_LIMIT);
  if (!parsed.ok) {
    return jsonResponse({ error: parsed.error }, parsed.status);
  }

  const message = String(parsed.value?.message || "").trim();
  if (!message) {
    return jsonResponse({ error: "Feedback message is required." }, 400);
  }

  const entry = {
    message: message.slice(0, 4000),
    snapshot: parsed.value.snapshot || null,
    receivedAt: new Date().toISOString()
  };
  const key = `${FEEDBACK_PREFIX}${entry.receivedAt}:${Math.random().toString(36).slice(2, 8)}`;
  await store.put(key, JSON.stringify(entry));
  return jsonResponse({ ok: true, key }, 201);
}

function applyProfileUpdate(record, update) {
  const actor = update?.actor;
  if (!PROFILE_NAMES.includes(actor)) {
    return { ok: false, status: 400, error: "Choose a valid profile." };
  }

  if (!update.profile || typeof update.profile !== "object" || Array.isArray(update.profile)) {
    return { ok: false, status: 400, error: "Profile data is required." };
  }

  const mutationId = normalizeMutationId(update.mutationId);
  if (!mutationId) {
    return { ok: false, status: 400, error: "A mutation ID is required." };
  }

  if (record._appliedMutationIds.includes(mutationId)) {
    return { ok: true, duplicate: true };
  }

  const expected = Number(update.expectedProfileRevision);
  const current = record.profileRevisions[actor];
  if (!Number.isInteger(expected) || expected !== current) {
    return {
      ok: false,
      conflict: true,
      status: 409,
      error: "This profile changed on another device."
    };
  }

  record.profiles[actor] = structuredClone(update.profile);
  record.profileRevisions[actor] += 1;
  finishMutation(record, mutationId);
  return { ok: true };
}

function applySharedAction(record, action) {
  const actor = action?.actor;
  if (!PROFILE_NAMES.includes(actor)) {
    return { ok: false, status: 400, error: "Choose a valid profile." };
  }

  const mutationId = normalizeMutationId(action.mutationId);
  if (!mutationId) {
    return { ok: false, status: 400, error: "A mutation ID is required." };
  }

  if (record._appliedMutationIds.includes(mutationId)) {
    return { ok: true, duplicate: true };
  }

  const countryId = String(action.countryId || "").trim();
  if (!countryId) {
    return { ok: false, status: 400, error: "A country is required." };
  }

  if (action.type === "suggest-removal") {
    record.removalSuggestions[countryId] = actor;
  } else if (action.type === "remove-country") {
    if (!record.removedCountryIds.includes(countryId)) {
      record.removedCountryIds.push(countryId);
    }
    delete record.removalSuggestions[countryId];

    for (const profileName of PROFILE_NAMES) {
      const pair = record.profiles[profileName]?.currentPair;
      if (Array.isArray(pair) && pair.includes(countryId)) {
        record.profiles[profileName].currentPair = null;
        record.profileRevisions[profileName] += 1;
      }
    }
  } else {
    return { ok: false, status: 400, error: "Unknown shared action." };
  }

  record.sharedRevision += 1;
  finishMutation(record, mutationId);
  return { ok: true };
}

function finishMutation(record, mutationId) {
  record.sessionRevision += 1;
  record.updatedAt = new Date().toISOString();
  record._appliedMutationIds.push(mutationId);
  record._appliedMutationIds = record._appliedMutationIds.slice(-MUTATION_HISTORY_LIMIT);
}

function normalizeSessionRecord(input, passcode) {
  const source = structuredClone(input || {});
  const record = {
    ...source,
    schemaVersion: 2,
    passcode: normalizePasscode(passcode || source.passcode),
    sessionRevision: nonNegativeInteger(source.sessionRevision, 0),
    sharedRevision: nonNegativeInteger(source.sharedRevision, 0),
    profileRevisions: {
      me: nonNegativeInteger(source.profileRevisions?.me, 0),
      partner: nonNegativeInteger(source.profileRevisions?.partner, 0)
    },
    removedCountryIds: Array.isArray(source.removedCountryIds) ? source.removedCountryIds : [],
    removalSuggestions: source.removalSuggestions && typeof source.removalSuggestions === "object"
      ? source.removalSuggestions
      : {},
    profiles: {
      me: source.profiles?.me || {},
      partner: source.profiles?.partner || {}
    },
    _appliedMutationIds: Array.isArray(source._appliedMutationIds)
      ? source._appliedMutationIds.slice(-MUTATION_HISTORY_LIMIT)
      : []
  };

  delete record.activeProfile;
  return record;
}

function publicSession(record) {
  const session = structuredClone(record);
  delete session._appliedMutationIds;
  return session;
}

function validateNewSession(session, passcode) {
  if (normalizePasscode(session?.passcode) !== passcode) {
    return "Passcode in the request and saved data must match.";
  }
  if (!["solo", "partner"].includes(session?.mode)) {
    return "Session mode must be solo or partner.";
  }
  if (!session.profiles?.me || !session.profiles?.partner) {
    return "Both profile records are required.";
  }
  return "";
}

async function readJsonBody(request, limit) {
  let rawText;
  try {
    rawText = await request.text();
  } catch {
    return { ok: false, status: 400, error: "Send data as JSON." };
  }

  if (new TextEncoder().encode(rawText).length > limit) {
    return { ok: false, status: 413, error: "The request is too large." };
  }

  try {
    return { ok: true, value: JSON.parse(rawText) };
  } catch {
    return { ok: false, status: 400, error: "Send data as JSON." };
  }
}

function getSessionStore(env) {
  return env.KV_BINDING || env.SESSIONS || env.KV || null;
}

function normalizeMutationId(value) {
  const id = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{8,100}$/.test(id) ? id : "";
}

function nonNegativeInteger(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function normalizePasscode(passcode) {
  return String(passcode || "").replace(/\D/g, "").slice(0, 6);
}

function sessionPasscodeFromPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  return normalizePasscode(parts[2] || "");
}

function sessionKey(passcode) {
  return `${SESSION_PREFIX}${passcode}`;
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function jsonResponse(body, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

export {
  applyProfileUpdate,
  applySharedAction,
  normalizeSessionRecord,
  publicSession
};
