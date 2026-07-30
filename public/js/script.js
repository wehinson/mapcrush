const STARTING_ELO = 1000;
const WIN_K = 32;
const HARD_TO_CHOOSE_BOOST = 4;
const MAX_PHOTOS = 20;
const PREVIEW_PHOTOS = 4;
const RANKING_PREVIEW_COUNT = 15;
const TOP_FOCUS_COUNT = 25;
const HISTORY_SCAN_LIMIT = 5000;
const ADVISORY_INFO = {
  1: { label: "Level 1 · Normal",        title: "Exercise Normal Precautions"  },
  2: { label: "Level 2 · Caution",       title: "Exercise Increased Caution"   },
  3: { label: "Level 3 · Reconsider",    title: "Reconsider Travel"            },
  4: { label: "Level 4 · Do Not Travel", title: "Do Not Travel"                }
};
const APP_VERSION = "v2.2.0";
const API_BASE_URL = window.COUNTRY_RANKER_API_URL || "/api/sessions";

const baseCountries = normalizeCountries(window.COUNTRY_DATA || []);
const countryById = new Map(baseCountries.map((country) => [country.id, country]));

let session = null;
let countries = [];
let currentPair = [];
let rankingView = "active";
let rankingsExpanded = false;
let lovedView = "me";
let storageWarning = "";
let saveTimer = null;
let saveInFlight = false;
let saveQueued = false;
const localChangeNumbers = { me: 0, partner: 0 };
const dirtyProfiles = new Set();
let profileConflict = false;
let syncSocket = null;
let syncReconnectTimer = null;
let syncRefreshTimer = null;
let syncPollTimer = null;
let undoState = null;
const recentErrors = [];
const ERROR_BUFFER_LIMIT = 20;

function recordError(label, detail) {
  recentErrors.push({
    at: new Date().toISOString(),
    label,
    detail: String(detail || "").slice(0, 800)
  });
  if (recentErrors.length > ERROR_BUFFER_LIMIT) {
    recentErrors.shift();
  }
}

window.addEventListener("error", (event) => {
  recordError("error", `${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`);
});

window.addEventListener("unhandledrejection", (event) => {
  recordError("unhandledrejection", event.reason?.stack || event.reason || "unknown");
});

const els = {
  onboarding: document.querySelector("#onboarding"),
  welcomePanel: document.querySelector("#welcomePanel"),
  appVersionLabel: document.querySelector("#appVersionLabel"),
  profileVersionLabel: document.querySelector("#profileVersionLabel"),
  existingPanel: document.querySelector("#existingPanel"),
  newPanel: document.querySelector("#newPanel"),
  profilePanel: document.querySelector("#profilePanel"),
  resumePanel: document.querySelector("#resumePanel"),
  resumeVersionLabel: document.querySelector("#resumeVersionLabel"),
  openHelp: document.querySelector("#openHelp"),
  helpModal: document.querySelector("#helpModal"),
  closeHelp: document.querySelector("#closeHelp"),
  floatingTooltip: document.querySelector("#floatingTooltip"),
  showExistingSession: document.querySelector("#showExistingSession"),
  showNewSession: document.querySelector("#showNewSession"),
  passcodeInput: document.querySelector("#passcodeInput"),
  loadSession: document.querySelector("#loadSession"),
  existingMessage: document.querySelector("#existingMessage"),
  backToWelcomeFromExisting: document.querySelector("#backToWelcomeFromExisting"),
  backToWelcomeFromNew: document.querySelector("#backToWelcomeFromNew"),
  newPasscode: document.querySelector("#newPasscode"),
  copyNewPasscode: document.querySelector("#copyNewPasscode"),
  newMessage: document.querySelector("#newMessage"),
  meNameInput: document.querySelector("#meNameInput"),
  partnerNameInput: document.querySelector("#partnerNameInput"),
  startSolo: document.querySelector("#startSolo"),
  startPartner: document.querySelector("#startPartner"),
  chooseMe: document.querySelector("#chooseMe"),
  choosePartner: document.querySelector("#choosePartner"),
  sessionPasscode: document.querySelector("#sessionPasscode"),
  activeProfileLabel: document.querySelector("#activeProfileLabel"),
  sessionModeLabel: document.querySelector("#sessionModeLabel"),
  storageWarning: document.querySelector("#storageWarning"),
  switchProfile: document.querySelector("#switchProfile"),
  exportSession: document.querySelector("#exportSession"),
  changeSession: document.querySelector("#changeSession"),
  countryCount: document.querySelector("#countryCount"),
  roundCount: document.querySelector("#roundCount"),
  leftPanel: document.querySelector("#leftPanel"),
  rightPanel: document.querySelector("#rightPanel"),
  leftAdvisory: document.querySelector("#leftAdvisory"),
  rightAdvisory: document.querySelector("#rightAdvisory"),
  leftPhotos: document.querySelector("#leftPhotos"),
  leftName: document.querySelector("#leftName"),
  leftSummary: document.querySelector("#leftSummary"),
  leftRating: document.querySelector("#leftRating"),
  leftLove: document.querySelector("#leftLove"),
  leftSuggestRemoval: document.querySelector("#leftSuggestRemoval"),
  leftCommentBox: document.querySelector("#leftPanel .comment-box"),
  leftComment: document.querySelector("#leftComment"),
  leftSaveComment: document.querySelector("#leftSaveComment"),
  leftMorePhotos: document.querySelector("#leftMorePhotos"),
  rightPhotos: document.querySelector("#rightPhotos"),
  rightName: document.querySelector("#rightName"),
  rightSummary: document.querySelector("#rightSummary"),
  rightRating: document.querySelector("#rightRating"),
  rightLove: document.querySelector("#rightLove"),
  rightSuggestRemoval: document.querySelector("#rightSuggestRemoval"),
  rightCommentBox: document.querySelector("#rightPanel .comment-box"),
  rightComment: document.querySelector("#rightComment"),
  rightSaveComment: document.querySelector("#rightSaveComment"),
  rightMorePhotos: document.querySelector("#rightMorePhotos"),
  leftChoose: document.querySelector("#leftChoose"),
  rightChoose: document.querySelector("#rightChoose"),
  hardChoice: document.querySelector("#hardChoice"),
  skipPair: document.querySelector("#skipPair"),
  undoChoice: document.querySelector("#undoChoice"),
  resetRatings: document.querySelector("#resetRatings"),
  lastAction: document.querySelector("#lastAction"),
  rankingControls: document.querySelector("#rankingControls"),
  viewTogether: document.querySelector("#viewTogether"),
  viewMe: document.querySelector("#viewMe"),
  viewPartner: document.querySelector("#viewPartner"),
  rankingList: document.querySelector("#rankingList"),
  toggleRankings: document.querySelector("#toggleRankings"),
  lovedControls: document.querySelector("#lovedControls"),
  lovedMe: document.querySelector("#lovedMe"),
  lovedPartner: document.querySelector("#lovedPartner"),
  lovedList: document.querySelector("#lovedList"),
  removedList: document.querySelector("#removedList"),
  suggestionsList: document.querySelector("#suggestionsList"),
  suggestionsSection: document.querySelector("#suggestionsSection"),
  openFeedback: document.querySelector("#openFeedback"),
  openFeedbackFromHelp: document.querySelector("#openFeedbackFromHelp"),
  closeFeedback: document.querySelector("#closeFeedback"),
  feedbackModal: document.querySelector("#feedbackModal"),
  feedbackText: document.querySelector("#feedbackText"),
  feedbackDebug: document.querySelector("#feedbackDebug"),
  feedbackDebugSection: document.querySelector("#feedbackDebugSection"),
  toggleFeedbackDebug: document.querySelector("#toggleFeedbackDebug"),
  submitFeedback: document.querySelector("#submitFeedback"),
  feedbackMessage: document.querySelector("#feedbackMessage"),
  commentsFeed: document.querySelector("#commentsFeed"),
  donationFooter: document.querySelector(".donation-footer"),
  hideDonation: document.querySelector("#hideDonation"),
  photoModal: document.querySelector("#photoModal"),
  modalTitle: document.querySelector("#modalTitle"),
  modalPhotos: document.querySelector("#modalPhotos"),
  closeModal: document.querySelector("#closeModal")
};

function normalizeCountries(input) {
  if (!Array.isArray(input)) {
    throw new Error("Use a JSON array of countries.");
  }

  const normalized = input.map((country, index) => {
    const name = String(country.name || "").trim();
    const summary = String(country.summary || "").trim();
    const photos = normalizePhotos(country);

    if (!name || !summary || photos.length === 0) {
      throw new Error(`Country ${index + 1} needs name, summary, and at least one photo.`);
    }

    return {
      id: String(country.id || slugify(name)).trim(),
      name,
      summary,
      photos,
      advisoryLevel: Number.isInteger(country.usTravelAdvisoryLevel) ? country.usTravelAdvisoryLevel : null
    };
  });

  if (normalized.length < 2) {
    throw new Error("Add at least two countries to compare.");
  }

  return normalized;
}

function normalizePhotos(country) {
  const spreadsheetPhotos = [];

  for (let index = 1; index <= MAX_PHOTOS; index += 1) {
    spreadsheetPhotos.push(country[`photo${index}`]);
  }

  const photoList = Array.isArray(country.photos)
    ? country.photos
    : [country.photo || country.photoUrl, ...spreadsheetPhotos];

  return photoList.map((photo) => String(photo || "").trim()).filter(Boolean).slice(0, MAX_PHOTOS);
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function getActiveProfile() {
  return session.profiles[session.activeProfile];
}

function getProfileName(profileName) {
  return session.profileNames?.[profileName] || (profileName === "partner" ? "Partner" : "Me");
}

function cleanName(value, fallback) {
  return String(value || "").trim() || fallback;
}

function makeProfile() {
  return {
    ratings: Object.fromEntries(baseCountries.map((country) => [country.id, STARTING_ELO])),
    rounds: 0,
    currentPair: null,
    loved: [],
    comments: {},
    donationHidden: false,
    history: []
  };
}

function makeSession(passcode, mode, profileNames) {
  return {
    passcode: normalizePasscode(passcode),
    mode,
    activeProfile: "me",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schemaVersion: 2,
    sessionRevision: 0,
    sharedRevision: 0,
    profileRevisions: {
      me: 0,
      partner: 0
    },
    profileNames: {
      me: cleanName(profileNames?.me, "Me"),
      partner: cleanName(profileNames?.partner, "Partner")
    },
    removedCountryIds: [],
    removalSuggestions: {},
    profiles: {
      me: makeProfile(),
      partner: makeProfile()
    }
  };
}

function normalizePasscode(passcode) {
  return String(passcode || "").replace(/\D/g, "").slice(0, 6);
}

function isValidPasscode(passcode) {
  return normalizePasscode(passcode).length === 6;
}

function generatePasscode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const PASSCODE_STORE_KEY = "mapcrush_passcode";

function savePasscodeLocally(passcode) {
  try { localStorage.setItem(PASSCODE_STORE_KEY, passcode); } catch {}
}

function getSavedPasscode() {
  try { return localStorage.getItem(PASSCODE_STORE_KEY) || ""; } catch { return ""; }
}

function clearSavedPasscode() {
  try { localStorage.removeItem(PASSCODE_STORE_KEY); } catch {}
}

function buildFeedbackSnapshot() {
  return {
    appVersion: APP_VERSION,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: location.href,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    session: session ? {
      passcode: session.passcode,
      mode: session.mode,
      activeProfile: session.activeProfile,
      removedCount: session.removedCountryIds?.length || 0,
      pendingRemovalSuggestions: Object.keys(session.removalSuggestions || {}).length,
      profile: getActiveProfile && session ? {
        rounds: getActiveProfile().rounds,
        lovedCount: getActiveProfile().loved.length,
        commentsCount: Object.keys(getActiveProfile().comments).length,
        historyLength: getActiveProfile().history.length
      } : null
    } : null,
    currentPairIds: currentPair?.map((c) => c?.id) || [],
    rankingView,
    lovedView,
    lastAction: els.lastAction?.textContent || "",
    storageWarning,
    undoStateActive: Boolean(undoState),
    recentErrors: [...recentErrors]
  };
}

async function submitFeedback(message) {
  const snapshot = buildFeedbackSnapshot();
  const payload = { message, snapshot };

  try {
    const response = await fetch(`${API_BASE_URL.replace(/\/sessions$/, "")}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { error: error.error || "Could not send feedback." };
    }

    return { ok: true };
  } catch {
    return { error: "Could not reach the feedback endpoint." };
  }
}

function saveSession(options = {}) {
  if (!session) {
    return Promise.resolve(false);
  }

  if (profileConflict) {
    storageWarning = "This profile changed on another device. Reload to use the saved version, or export this device's unsaved copy.";
    showSaveStateSoon();
    return Promise.resolve(false);
  }

  if (!options.immediate) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      flushSessionSave();
    }, 350);
    return Promise.resolve(true);
  }

  return flushSessionSave(options);
}

async function flushSessionSave(options = {}) {
  if (!session) {
    return false;
  }

  if (profileConflict) {
    return false;
  }

  clearTimeout(saveTimer);
  saveTimer = null;

  if (saveInFlight) {
    saveQueued = true;
    return false;
  }

  const actor = dirtyProfiles.values().next().value;
  if (!actor) {
    return true;
  }

  saveInFlight = true;
  const passcode = normalizePasscode(session.passcode);
  const sentChangeNumber = localChangeNumbers[actor];
  const expectedProfileRevision = session.profileRevisions?.[actor] || 0;
  const profile = structuredClone(session.profiles[actor]);
  let saveSucceeded = false;

  try {
    const response = await fetch(`${API_BASE_URL}/${encodeURIComponent(passcode)}/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      keepalive: Boolean(options.keepalive),
      body: JSON.stringify({
        actor,
        expectedProfileRevision,
        mutationId: createMutationId(),
        profile
      })
    });
    const payload = await response.json().catch(() => ({}));

    if (response.status === 409 && payload.session) {
      handleProfileConflict(payload.session, actor, options);
      return false;
    }

    if (!response.ok || !payload.session) {
      throw new Error(payload.error || `Save failed with ${response.status}`);
    }

    mergeCanonicalSession(payload.session, actor, sentChangeNumber);
    saveSucceeded = true;
    storageWarning = "";
    if (session) {
      renderSession(els.lastAction.textContent || "Ready");
    }
    return true;
  } catch (error) {
    recordError("save", error.message || error);
    storageWarning = "This device is offline. Your latest changes are still here, but they are not saved online yet.";
    showSaveStateSoon();
    return false;
  } finally {
    saveInFlight = false;

    if (saveQueued || (saveSucceeded && dirtyProfiles.size > 0)) {
      saveQueued = false;
      flushSessionSave();
    }
  }
}

function mergeCanonicalSession(savedSession, savedActor, sentChangeNumber) {
  const activeProfile = session.activeProfile;
  const localProfiles = session.profiles;
  const canonical = hydrateSession(savedSession);

  for (const profileName of ["me", "partner"]) {
    const changedAfterSend = profileName === savedActor
      ? localChangeNumbers[profileName] !== sentChangeNumber
      : dirtyProfiles.has(profileName);

    if (changedAfterSend) {
      canonical.profiles[profileName] = localProfiles[profileName];
    }
  }

  if (localChangeNumbers[savedActor] === sentChangeNumber) {
    dirtyProfiles.delete(savedActor);
  }

  canonical.activeProfile = canonical.mode === "partner" ? activeProfile : "me";
  session = canonical;
}

function handleProfileConflict(savedSession, actor, options = {}) {
  const activeProfile = session.activeProfile;
  const localProfile = session.profiles[actor];
  const canonical = hydrateSession(savedSession);
  canonical.activeProfile = canonical.mode === "partner" ? activeProfile : "me";

  if (!options.keepalive && window.confirm(
    "This profile changed on another device. Load the newest saved version?\n\nChoose Cancel to keep this device's unsaved version so you can export it."
  )) {
    session = canonical;
    dirtyProfiles.delete(actor);
    profileConflict = false;
    storageWarning = "";
    renderApp("Loaded the newest saved version");
    return;
  }

  canonical.profiles[actor] = localProfile;
  session = canonical;
  profileConflict = true;
  storageWarning = "This profile changed on another device. Reload to use the saved version, or export this device's unsaved copy.";
  renderApp("Save conflict");
}

function createMutationId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function createSession(nextSession) {
  try {
    const response = await fetch(API_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(nextSession)
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { error: payload.error || "Could not create that online ranking yet." };
    }

    return { session: hydrateSession(payload.session) };
  } catch {
    return { error: "Online save is not connected yet. Deploy the Cloudflare API first, then try again." };
  }
}

async function loadSessionByPasscode(passcode) {
  const normalizedPasscode = normalizePasscode(passcode);

  if (!isValidPasscode(normalizedPasscode)) {
    return { error: "Enter a six-digit passcode." };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/${encodeURIComponent(normalizedPasscode)}`);

    if (response.status === 404) {
      return { error: "No online ranking found for that passcode." };
    }

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { error: payload.error || "That online ranking could not be loaded." };
    }

    return { session: hydrateSession(payload.session) };
  } catch {
    return { error: "Online save is not connected yet. Check the Cloudflare API setup." };
  }
}

async function sendSharedAction(action, message) {
  if (!session) {
    return false;
  }

  const activeProfile = session.activeProfile;

  try {
    const response = await fetch(
      `${API_BASE_URL}/${encodeURIComponent(session.passcode)}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...action,
          actor: activeProfile,
          mutationId: createMutationId()
        })
      }
    );
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.session) {
      throw new Error(payload.error || `Shared update failed with ${response.status}`);
    }

    session = hydrateSession(payload.session);
    session.activeProfile = session.mode === "partner" ? activeProfile : "me";
    storageWarning = "";
    renderApp(message);
    return true;
  } catch (error) {
    recordError("shared-save", error.message || error);
    storageWarning = "The shared country list could not be updated. Your rankings were not changed.";
    showSaveStateSoon();
    return false;
  }
}

function sessionApiUrl(suffix = "") {
  return new URL(
    `${API_BASE_URL}/${encodeURIComponent(session.passcode)}${suffix}`,
    location.href
  );
}

function connectSessionSync() {
  disconnectSessionSync();
  if (!session) {
    return;
  }

  const passcode = session.passcode;
  const socketUrl = sessionApiUrl("/sync");
  socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";

  try {
    syncSocket = new WebSocket(socketUrl);
    syncSocket.addEventListener("message", (event) => {
      try {
        const notice = JSON.parse(event.data);
        if (notice.sessionRevision > (session?.sessionRevision || 0)) {
          scheduleRemoteRefresh();
        }
      } catch (error) {
        recordError("sync-message", error.message || error);
      }
    });
    syncSocket.addEventListener("close", () => {
      syncSocket = null;
      if (session?.passcode === passcode) {
        syncReconnectTimer = setTimeout(connectSessionSync, 2000);
      }
    });
    syncSocket.addEventListener("error", () => {
      syncSocket?.close();
    });
  } catch (error) {
    recordError("sync-connect", error.message || error);
  }

  syncPollTimer = setInterval(refreshSessionFromServer, 5000);
}

function disconnectSessionSync() {
  clearTimeout(syncReconnectTimer);
  clearTimeout(syncRefreshTimer);
  clearInterval(syncPollTimer);
  syncReconnectTimer = null;
  syncRefreshTimer = null;
  syncPollTimer = null;

  if (syncSocket) {
    const socket = syncSocket;
    syncSocket = null;
    socket.close();
  }
}

function scheduleRemoteRefresh() {
  clearTimeout(syncRefreshTimer);
  syncRefreshTimer = setTimeout(refreshSessionFromServer, 150);
}

async function refreshSessionFromServer() {
  if (!session || saveInFlight || saveTimer || dirtyProfiles.size > 0 || profileConflict) {
    return false;
  }

  const passcode = session.passcode;
  const currentRevision = session.sessionRevision || 0;
  const activeProfile = session.activeProfile;
  const result = await loadSessionByPasscode(passcode);

  if (result.error || !session || session.passcode !== passcode) {
    return false;
  }

  if ((result.session.sessionRevision || 0) <= currentRevision) {
    return true;
  }

  session = result.session;
  session.activeProfile = session.mode === "partner" ? activeProfile : "me";
  storageWarning = "";
  renderApp("Updated by partner");
  return true;
}

async function exportSessionData() {
  if (!session) {
    return;
  }

  setBusy(els.exportSession, true, "Exporting...");
  const saved = await saveSession({ immediate: true });

  if (!saved) {
    downloadJsonFile({
      format: "mapcrush-save",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      unsynced: true,
      session
    }, `mapcrush-${session.passcode}-${dateStamp()}-unsynced.json`);
    storageWarning = "Downloaded this device's unsaved copy. It might not include your partner's newest changes.";
    renderSession("Local backup exported");
    setBusy(els.exportSession, false);
    return;
  }

  try {
    const response = await fetch(sessionApiUrl("/export"));
    if (!response.ok) {
      throw new Error(`Export failed with ${response.status}`);
    }

    const blob = await response.blob();
    downloadBlob(blob, `mapcrush-${session.passcode}-${dateStamp()}.json`);
    renderSession("Synchronized backup exported");
  } catch (error) {
    recordError("export", error.message || error);
    storageWarning = "The synchronized export failed. Try again while online.";
    showSaveStateSoon();
  } finally {
    setBusy(els.exportSession, false);
  }
}

function downloadJsonFile(value, filename) {
  downloadBlob(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    filename
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureOnlineSession(nextSession) {
  let attempt = 0;

  while (attempt < 5) {
    const result = await createSession(nextSession);

    if (!result.error) {
      return result;
    }

    if (!/already exists/i.test(result.error)) {
      return result;
    }

    nextSession.passcode = generatePasscode();
    attempt += 1;
  }

  return { error: "Could not find an unused passcode. Try starting again." };
}

function setBusy(button, isBusy, label) {
  if (!button) {
    return;
  }

  if (isBusy) {
    button.dataset.originalText = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    delete button.dataset.originalText;
  }
}

function showSaveStateSoon() {
  if (storageWarning && session) {
    renderSession(els.lastAction.textContent || "Ready");
  }
}

async function startOnlineSession(mode) {
  const nextSession = makeSession(els.newPasscode.textContent || generatePasscode(), mode, newSessionNames());
  const startButton = mode === "partner" ? els.startPartner : els.startSolo;

  setBusy(startButton, true, "Creating...");
  els.newMessage.textContent = "";

  const result = await ensureOnlineSession(nextSession);
  setBusy(startButton, false);

  if (result.error) {
    storageWarning = result.error;
    els.newPasscode.textContent = generatePasscode();
    els.newMessage.textContent = result.error;
    return;
  }

  els.newPasscode.textContent = result.session.passcode;

  if (mode === "partner") {
    session = result.session;
    updateProfileChoiceLabels();
    showPanel(els.profilePanel);
    return;
  }

  beginSession(result.session);
}

function setSaveWarningIfNeeded(saved) {
  if (!saved && session && !storageWarning) {
    storageWarning = "Online save is not connected right now. Your latest click may not be stored yet.";
    showSaveStateSoon();
  }
}

function saveSessionAndWarn(options = {}) {
  saveSession(options).then(setSaveWarningIfNeeded);
}

function queueSave() {
  markActiveProfileDirty();
  saveSessionAndWarn();
}

function queueImmediateSave() {
  markActiveProfileDirty();
  saveSessionAndWarn({ immediate: true });
}

function markActiveProfileDirty() {
  if (!session) {
    return;
  }
  const actor = session.mode === "partner" ? session.activeProfile : "me";
  localChangeNumbers[actor] += 1;
  dirtyProfiles.add(actor);
}

async function loadOnlineSessionFromInput() {
  setBusy(els.loadSession, true, "Loading...");
  const result = await loadSessionByPasscode(els.passcodeInput.value);
  setBusy(els.loadSession, false);

  if (result.error) {
    els.existingMessage.textContent = result.error;
    return;
  }

  if (result.session.mode === "partner") {
    session = result.session;
    updateProfileChoiceLabels();
    showPanel(els.profilePanel);
    return;
  }

  beginSession(result.session);
}

async function saveBeforeHide() {
  clearTimeout(saveTimer);
  await saveSession({ immediate: true, keepalive: true });
}

function hydrateSession(savedSession) {
  const mode = savedSession.mode === "partner" ? "partner" : "solo";
  const restored = makeSession(savedSession.passcode, mode, savedSession.profileNames);
  restored.activeProfile = savedSession.activeProfile === "partner" ? "partner" : "me";
  restored.createdAt = savedSession.createdAt || restored.createdAt;
  restored.updatedAt = savedSession.updatedAt || restored.updatedAt;
  restored.schemaVersion = Number.isInteger(savedSession.schemaVersion) ? savedSession.schemaVersion : 2;
  restored.sessionRevision = Number.isInteger(savedSession.sessionRevision) ? savedSession.sessionRevision : 0;
  restored.sharedRevision = Number.isInteger(savedSession.sharedRevision) ? savedSession.sharedRevision : 0;
  restored.profileRevisions = {
    me: Number.isInteger(savedSession.profileRevisions?.me) ? savedSession.profileRevisions.me : 0,
    partner: Number.isInteger(savedSession.profileRevisions?.partner) ? savedSession.profileRevisions.partner : 0
  };
  restored.removedCountryIds = normalizeCountryIdList(savedSession.removedCountryIds);
  restored.removalSuggestions = normalizeRemovalSuggestions(savedSession.removalSuggestions);

  ["me", "partner"].forEach((profileName) => {
    const savedProfile = savedSession.profiles?.[profileName] || {};
    const restoredProfile = restored.profiles[profileName];
    restoredProfile.rounds = Number.isFinite(savedProfile.rounds) ? savedProfile.rounds : 0;
    restoredProfile.currentPair = normalizePair(savedProfile.currentPair);
    restoredProfile.loved = normalizeCountryIdList(savedProfile.loved);
    restoredProfile.comments = normalizeComments(savedProfile.comments);
    restoredProfile.donationHidden = Boolean(savedProfile.donationHidden);
    restoredProfile.history = Array.isArray(savedProfile.history) ? savedProfile.history : [];

    Object.entries(savedProfile.ratings || {}).forEach(([id, rating]) => {
      if (countryById.has(id) && Number.isFinite(rating)) {
        restoredProfile.ratings[id] = Math.max(1, rating);
      }
    });
  });

  if (mode === "solo") {
    restored.activeProfile = "me";
  }

  return restored;
}

function normalizeCountryIdList(ids) {
  return Array.isArray(ids) ? [...new Set(ids.filter((id) => countryById.has(id)))] : [];
}

function normalizeRemovalSuggestions(suggestions) {
  const normalized = {};

  Object.entries(suggestions || {}).forEach(([id, suggestedBy]) => {
    if (countryById.has(id) && ["me", "partner"].includes(suggestedBy)) {
      normalized[id] = suggestedBy;
    }
  });

  return normalized;
}

function normalizeComments(comments) {
  const normalized = {};

  Object.entries(comments || {}).forEach(([id, comment]) => {
    if (!countryById.has(id)) {
      return;
    }

    if (typeof comment === "string") {
      const text = comment.trim();

      if (text) {
        normalized[id] = {
          text,
          updatedAt: new Date().toISOString()
        };
      }
      return;
    }

    const text = String(comment?.text || "").trim();

    if (text) {
      normalized[id] = {
        text,
        updatedAt: comment?.updatedAt || new Date().toISOString()
      };
    }
  });

  return normalized;
}

function normalizePair(pair) {
  if (!Array.isArray(pair) || pair.length !== 2) {
    return null;
  }

  const ids = pair.map((id) => String(id || ""));
  return ids.every((id) => countryById.has(id)) && ids[0] !== ids[1] ? ids : null;
}

function beginSession(nextSession, profile = "me") {
  disconnectSessionSync();
  dirtyProfiles.clear();
  profileConflict = false;
  session = nextSession;
  savePasscodeLocally(session.passcode);
  session.activeProfile = session.mode === "partner" ? profile : "me";
  rankingView = session.mode === "partner" ? "together" : "active";
  rankingsExpanded = false;
  lovedView = session.activeProfile;

  const needsInitialPair = !getActiveProfile().currentPair;
  if (needsInitialPair) {
    getActiveProfile().currentPair = pickPairIds();
  }

  if (needsInitialPair) {
    queueImmediateSave();
  }
  renderApp("Ready");
  els.onboarding.hidden = true;
  document.querySelector("main.app").hidden = false;
  connectSessionSync();
}

function showPanel(panel) {
  [els.welcomePanel, els.existingPanel, els.newPanel, els.profilePanel, els.resumePanel].forEach((item) => {
    item.hidden = item !== panel;
  });
}

function buildCountriesForActiveProfile() {
  const ratings = getActiveProfile().ratings;

  return activeBaseCountries().map((country) => ({
    ...country,
    rating: Number.isFinite(ratings[country.id]) ? ratings[country.id] : STARTING_ELO
  }));
}

function syncActiveRatings() {
  const ratings = getActiveProfile().ratings;

  countries.forEach((country) => {
    ratings[country.id] = country.rating;
  });
}

function expectedScore(a, b) {
  return 1 / (1 + 10 ** ((b.rating - a.rating) / 400));
}

function applyWin(winner, loser) {
  const winnerExpected = expectedScore(winner, loser);
  const loserExpected = expectedScore(loser, winner);

  winner.rating = Math.max(1, Math.round(winner.rating + WIN_K * (1 - winnerExpected)));
  loser.rating = Math.max(1, Math.round(loser.rating + WIN_K * (0 - loserExpected)));
}

function applyHardChoice(a, b) {
  a.rating = Math.max(1, a.rating + HARD_TO_CHOOSE_BOOST);
  b.rating = Math.max(1, b.rating + HARD_TO_CHOOSE_BOOST);
}

function weightedPickIndex(weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return i;
  }
  return weights.length - 1;
}

function pickPairIds() {
  const pool = activeBaseCountries();
  if (pool.length < 2) return null;

  const { history, ratings, rounds } = getActiveProfile();

  const recentHistory = history.length > HISTORY_SCAN_LIMIT
    ? history.slice(-HISTORY_SCAN_LIMIT)
    : history;
  const seen = {};
  for (const entry of recentHistory) {
    const [a, b] = entry.split(/[>~]/);
    seen[a] = (seen[a] || 0) + 1;
    seen[b] = (seen[b] || 0) + 1;
  }

  const topBoost = 1 + Math.min(rounds / 1000, 1);
  const sortedByElo = [...pool].sort(
    (a, b) => (ratings[b.id] || STARTING_ELO) - (ratings[a.id] || STARTING_ELO)
  );
  const topIds = new Set(sortedByElo.slice(0, TOP_FOCUS_COUNT).map(c => c.id));
  const rankWeight = (c) => topIds.has(c.id) ? topBoost : 1;

  const firstWeights = pool.map(c =>
    (1 / ((seen[c.id] || 0) + 1)) * rankWeight(c)
  );
  const firstIndex = weightedPickIndex(firstWeights);
  const firstElo = ratings[pool[firstIndex].id] || STARTING_ELO;

  const secondWeights = pool.map((c, i) => {
    if (i === firstIndex) return 0;
    const appWeight = 1 / ((seen[c.id] || 0) + 1);
    const eloWeight = 1 / (Math.abs((ratings[c.id] || STARTING_ELO) - firstElo) + 100);
    return appWeight * eloWeight * rankWeight(c);
  });
  const secondIndex = weightedPickIndex(secondWeights);

  return [pool[firstIndex].id, pool[secondIndex].id];
}

function setCurrentPairFromProfile() {
  const profile = getActiveProfile();

  if (!normalizePair(profile.currentPair)) {
    profile.currentPair = pickPairIds();
  }

  if (!profile.currentPair) {
    currentPair = [];
    return;
  }

  currentPair = profile.currentPair.map((id) => countries.find((country) => country.id === id));

  if (currentPair.some((country) => !country) || currentPair.some((country) => isRemoved(country.id))) {
    profile.currentPair = pickPairIds();
    currentPair = profile.currentPair ? profile.currentPair.map((id) => countries.find((country) => country.id === id)) : [];
  }
}

function advance(message, shouldCountRound = true) {
  const profile = getActiveProfile();

  if (shouldCountRound) {
    profile.rounds += 1;
  }

  syncActiveRatings();
  profile.currentPair = pickPairIds();
  queueSave();
  renderApp(message);
}

function saveUndoState() {
  const profile = getActiveProfile();
  undoState = {
    pairIds: [currentPair[0].id, currentPair[1].id],
    ratingA: profile.ratings[currentPair[0].id],
    ratingB: profile.ratings[currentPair[1].id],
    rounds: profile.rounds,
    historyLen: profile.history.length
  };
}

function undoLastChoice() {
  if (!undoState || !session) return;
  const profile = getActiveProfile();
  profile.ratings[undoState.pairIds[0]] = undoState.ratingA;
  profile.ratings[undoState.pairIds[1]] = undoState.ratingB;
  profile.rounds = undoState.rounds;
  profile.history.splice(undoState.historyLen);
  profile.currentPair = undoState.pairIds;
  undoState = null;
  queueSave();
  renderApp("Undid last choice");
}

function renderApp(message = els.lastAction.textContent || "Ready") {
  countries = buildCountriesForActiveProfile();
  setCurrentPairFromProfile();
  renderPair();
  renderRankings();
  renderLovedList();
  renderRemovedList();
  renderCommentsFeed();
  renderDonationFooter();
  renderSession(message);
}

function renderSession(message) {
  const activeLabel = getProfileName(session.activeProfile);
  const otherProfile = session.activeProfile === "me" ? "partner" : "me";
  const modeLabel = session.mode === "partner" ? "Partner ranking" : `${getProfileName("me")}'s ranking`;
  els.sessionPasscode.textContent = `Passcode ${session.passcode}`;
  els.activeProfileLabel.textContent = session.mode === "partner" ? activeLabel : getProfileName("me");
  els.sessionModeLabel.textContent = modeLabel;
  els.switchProfile.hidden = session.mode !== "partner";
  els.switchProfile.textContent = `Switch to ${getProfileName(otherProfile)}`;
  els.lastAction.textContent = message;
  els.storageWarning.hidden = !storageWarning;
  els.storageWarning.textContent = storageWarning;
}

function syncCommentExpansion() {
  const leftOpen = els.leftCommentBox.open;
  const rightOpen = els.rightCommentBox.open;
  els.leftSummary.classList.toggle("summary-expanded", rightOpen && !leftOpen);
  els.rightSummary.classList.toggle("summary-expanded", leftOpen && !rightOpen);
}

function renderPair() {
  const [left, right] = currentPair;
  const hasPair = Boolean(left && right);

  els.leftCommentBox.open = false;
  els.rightCommentBox.open = false;
  syncCommentExpansion();

  [els.leftChoose, els.rightChoose, els.hardChoice, els.skipPair].forEach((button) => {
    button.disabled = !hasPair;
  });
  els.undoChoice.disabled = !undoState;

  if (!hasPair) {
    return;
  }

  renderCountry("left", left);
  renderCountry("right", right);
}

function renderCountry(side, country) {
  els[`${side}Summary`].scrollTop = 0;
  const previewPhotos = getPreviewPhotos(country.photos);
  const moreButton = els[`${side}MorePhotos`];
  const nameLink = els[`${side}Name`];
  const loveButton = els[`${side}Love`];
  const removalButton = els[`${side}SuggestRemoval`];
  const commentInput = els[`${side}Comment`];
  const saveCommentButton = els[`${side}SaveComment`];

  els[`${side}Photos`].innerHTML = previewPhotos.map((photo, index) => (
    `<img src="${escapeHtml(photo)}" alt="${escapeHtml(country.name)} photo ${index + 1}">`
  )).join("");
  els[`${side}Photos`].querySelectorAll("img").forEach((img, i) => {
    setupPhotoFallback(img, country.photos, i);
  });
  nameLink.textContent = country.name;
  nameLink.href = wikipediaUrl(country.name);
  els[`${side}Summary`].textContent = country.summary;
  els[`${side}Rating`].textContent = `ELO ${country.rating}`;
  const advisoryInfo = ADVISORY_INFO[country.advisoryLevel];
  const advisoryEl = els[`${side}Advisory`];
  if (advisoryInfo) {
    advisoryEl.innerHTML = `<span class="advisory-label">Travel advisory</span><span class="advisory-badge advisory-${country.advisoryLevel}" title="US State Dept: ${advisoryInfo.title}">${advisoryInfo.label}</span>`;
    advisoryEl.hidden = false;
  } else {
    advisoryEl.hidden = true;
  }
  renderCountryActionButtons(country, loveButton, removalButton);
  renderCommentBox(country, commentInput, saveCommentButton);
  moreButton.hidden = country.photos.length <= PREVIEW_PHOTOS;
  moreButton.textContent = `More photos (${country.photos.length})`;
  moreButton.onclick = () => openPhotoModal(country);
}

function renderCountryActionButtons(country, loveButton, removalButton) {
  const loved = getActiveProfile().loved.includes(country.id);
  const suggestedBy = session.removalSuggestions[country.id];

  loveButton.classList.toggle("active", loved);
  loveButton.textContent = loved ? "♥" : "♡";
  loveButton.setAttribute("aria-label", loved ? `Unlove ${country.name}` : `Love ${country.name}`);
  loveButton.dataset.tooltip = loved
    ? "Remove this country from your personal loved list."
    : "Save this country to your personal loved list without changing its ranking.";
  loveButton.onclick = () => toggleLove(country.id);

  if (session.mode === "solo") {
    removalButton.textContent = "Remove from queue";
    removalButton.dataset.tooltip = "Remove this country from your future matchups.";
  } else if (suggestedBy && suggestedBy !== session.activeProfile) {
    removalButton.textContent = `Agree remove`;
    removalButton.dataset.tooltip = `${getProfileName(suggestedBy)} suggested removing this country. Agree to remove it from future matchups for both of you.`;
  } else if (suggestedBy === session.activeProfile) {
    removalButton.textContent = "Removal suggested";
    removalButton.dataset.tooltip = "Your removal suggestion is saved. The other person can agree when they see this country.";
  } else {
    removalButton.textContent = "Suggest removal";
    removalButton.dataset.tooltip = "Ask the other person to remove this country from future matchups. It only disappears if they agree.";
  }

  removalButton.onclick = () => handleRemoval(country.id);
}

function renderCommentBox(country, commentInput, saveCommentButton) {
  const comment = getActiveProfile().comments[country.id];
  const details = commentInput.closest("details");
  const summary = details.querySelector("summary");
  const hasSaved = Boolean(comment?.text);

  const otherProfile = session.activeProfile === "me" ? "partner" : "me";
  const partnerNote = session.mode === "partner"
    ? session.profiles[otherProfile]?.comments[country.id]?.text || ""
    : "";
  const partnerDot = partnerNote
    ? ` <span class="partner-comment-dot" title="${escapeHtml(getProfileName(otherProfile))}: ${escapeHtml(partnerNote)}">&#9679;</span>`
    : "";

  commentInput.value = comment?.text || "";
  commentInput.readOnly = hasSaved;
  saveCommentButton.textContent = hasSaved ? "Edit" : "Save comment";
  details.classList.toggle("has-comment", hasSaved);
  summary.innerHTML = (hasSaved ? "Comment ✓" : "Comment") + partnerDot;

  saveCommentButton.onclick = () => {
    if (commentInput.readOnly) {
      commentInput.readOnly = false;
      saveCommentButton.textContent = "Save comment";
      commentInput.focus();
    } else {
      saveComment(country.id, commentInput.value);
    }
  };
}

function setupPhotoFallback(img, allPhotos, gridIndex) {
  let currentIndex = Math.min(gridIndex, allPhotos.length - 1);
  let retried = false;

  img.onerror = () => {
    if (!retried) {
      retried = true;
      const src = allPhotos[currentIndex];
      img.src = "";
      setTimeout(() => { img.src = src; }, 1000);
    } else if (currentIndex + 1 < allPhotos.length) {
      retried = false;
      currentIndex += 1;
      img.src = allPhotos[currentIndex];
    }
  };
}

function getPreviewPhotos(photos) {
  const previewPhotos = photos.slice(0, PREVIEW_PHOTOS);

  while (previewPhotos.length < PREVIEW_PHOTOS) {
    previewPhotos.push(previewPhotos[0]);
  }

  return previewPhotos;
}

function openPhotoModal(country) {
  els.modalTitle.textContent = `${country.name} photos`;
  els.modalPhotos.innerHTML = country.photos.map((photo, index) => (
    `<img src="${escapeHtml(photo)}" alt="${escapeHtml(country.name)} photo ${index + 1}">`
  )).join("");
  els.photoModal.showModal();
}

function renderRankings() {
  const sorted = getRankingRows();
  const visibleRows = rankingsExpanded ? sorted : sorted.slice(0, RANKING_PREVIEW_COUNT);

  els.rankingList.innerHTML = visibleRows.map((country) => (
    `<li><a href="${wikipediaUrl(country.name)}" target="_blank" rel="noopener"><strong>${escapeHtml(country.name)}</strong></a><span>${escapeHtml(country.meta)}</span></li>`
  )).join("");

  renderRankingControls();
  els.countryCount.textContent = `${countries.length} ${countries.length === 1 ? "country" : "countries"}`;
  els.roundCount.textContent = `${getActiveProfile().rounds} ${getActiveProfile().rounds === 1 ? "round" : "rounds"}`;
  els.toggleRankings.hidden = sorted.length <= RANKING_PREVIEW_COUNT;
  els.toggleRankings.textContent = rankingsExpanded ? "Show top 15" : `See more (${sorted.length - RANKING_PREVIEW_COUNT} more)`;
}

function getRankingRows() {
  if (session.mode === "partner" && rankingView === "together") {
    return getTogetherRankings();
  }

  const profileName = rankingView === "partner" ? "partner" : rankingView === "me" ? "me" : session.activeProfile;
  const ratings = session.profiles[profileName].ratings;

  return activeBaseCountries()
    .map((country) => ({
      ...country,
      rating: Number.isFinite(ratings[country.id]) ? ratings[country.id] : STARTING_ELO
    }))
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
    .map((country) => ({
      ...country,
      meta: `ELO ${country.rating}`
    }));
}

function getTogetherRankings() {
  const profileRankings = ["me", "partner"].map((profileName) => {
    const ratings = session.profiles[profileName].ratings;

    return activeBaseCountries()
      .map((country) => ({
        id: country.id,
        rating: Number.isFinite(ratings[country.id]) ? ratings[country.id] : STARTING_ELO
      }))
      .sort((a, b) => b.rating - a.rating || countryById.get(a.id).name.localeCompare(countryById.get(b.id).name))
      .reduce((rankings, country, index) => {
        rankings[country.id] = index + 1;
        return rankings;
      }, {});
  });

  return activeBaseCountries()
    .map((country) => {
      const averageRank = (profileRankings[0][country.id] + profileRankings[1][country.id]) / 2;

      return {
        ...country,
        averageRank,
        meta: `Avg rank ${averageRank.toFixed(1)}`
      };
    })
    .sort((a, b) => a.averageRank - b.averageRank || a.name.localeCompare(b.name));
}

function renderLovedList() {
  els.lovedControls.hidden = session.mode !== "partner";
  lovedView = session.mode === "partner" ? lovedView : "me";
  els.lovedMe.textContent = getProfileName("me");
  els.lovedPartner.textContent = getProfileName("partner");
  els.lovedMe.classList.toggle("active", lovedView === "me");
  els.lovedPartner.classList.toggle("active", lovedView === "partner");

  const lovedCountries = session.profiles[lovedView].loved
    .map((id) => countryById.get(id))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  els.lovedList.innerHTML = lovedCountries.length
    ? lovedCountries.map((country) => (
      `<li><a href="${wikipediaUrl(country.name)}" target="_blank" rel="noopener">${escapeHtml(country.name)}</a></li>`
    )).join("")
    : `<li class="empty-list">No loved countries yet.</li>`;
}

function renderRemovedList() {
  const removedCountries = session.removedCountryIds
    .map((id) => countryById.get(id))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  els.removedList.innerHTML = removedCountries.length
    ? removedCountries.map((country) => (
      `<li><a href="${wikipediaUrl(country.name)}" target="_blank" rel="noopener">${escapeHtml(country.name)}</a></li>`
    )).join("")
    : `<li class="empty-list">No removed countries yet.</li>`;

  renderRemovalSuggestions();
}

function renderRemovalSuggestions() {
  if (session.mode !== "partner") {
    els.suggestionsSection.hidden = true;
    return;
  }

  const otherProfile = session.activeProfile === "me" ? "partner" : "me";
  const pending = Object.entries(session.removalSuggestions)
    .filter(([id, suggester]) => (
      suggester === otherProfile
      && !session.removedCountryIds.includes(id)
      && countryById.has(id)
    ))
    .map(([id]) => countryById.get(id))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (pending.length === 0) {
    els.suggestionsSection.hidden = true;
    return;
  }

  els.suggestionsSection.hidden = false;
  els.suggestionsList.innerHTML = pending.map((country) => (
    `<li><a href="${wikipediaUrl(country.name)}" target="_blank" rel="noopener">${escapeHtml(country.name)}</a> <button class="confirm-removal-btn" data-id="${escapeHtml(country.id)}" type="button">Confirm removal</button></li>`
  )).join("");

  els.suggestionsList.querySelectorAll(".confirm-removal-btn").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      handleRemoval(id);
    };
  });
}

function renderCommentsFeed() {
  const comments = ["me", "partner"].flatMap((profileName) => (
    Object.entries(session.profiles[profileName].comments || {}).map(([countryId, comment]) => ({
      profileName,
      country: countryById.get(countryId),
      text: comment.text,
      updatedAt: comment.updatedAt
    }))
  ))
    .filter((item) => item.country && item.text)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  els.commentsFeed.innerHTML = comments.length
    ? comments.map((item) => (
      `<li><strong><a href="${wikipediaUrl(item.country.name)}" target="_blank" rel="noopener">${escapeHtml(item.country.name)}</a> &middot; ${escapeHtml(getProfileName(item.profileName))}</strong><span>${escapeHtml(item.text)}</span></li>`
    )).join("")
    : `<li class="empty-list">No comments yet.</li>`;
}

function renderDonationFooter() {
  els.donationFooter.hidden = Boolean(getActiveProfile().donationHidden);
}

function showFloatingTooltip(target) {
  const text = target.dataset.tooltip;

  if (!text) {
    return;
  }

  els.floatingTooltip.textContent = text;
  els.floatingTooltip.hidden = false;

  const targetRect = target.getBoundingClientRect();
  const tooltipRect = els.floatingTooltip.getBoundingClientRect();
  const gap = 10;
  const margin = 12;
  let left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
  let top = targetRect.top - tooltipRect.height - gap;

  left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));

  if (top < margin) {
    top = targetRect.bottom + gap;
  }

  top = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));
  els.floatingTooltip.style.left = `${left}px`;
  els.floatingTooltip.style.top = `${top}px`;
}

function hideFloatingTooltip() {
  els.floatingTooltip.hidden = true;
}

function activeBaseCountries() {
  return baseCountries.filter((country) => !isRemoved(country.id));
}

function isRemoved(countryId) {
  return session?.removedCountryIds?.includes(countryId);
}

function toggleLove(countryId) {
  const loved = getActiveProfile().loved;
  const index = loved.indexOf(countryId);

  if (index >= 0) {
    loved.splice(index, 1);
  } else {
    loved.push(countryId);
  }

  queueSave();
  renderApp(index >= 0 ? "Removed from loved countries" : "Saved to loved countries");
}

function saveComment(countryId, value) {
  const text = String(value || "").trim();
  const comments = getActiveProfile().comments;

  if (text) {
    comments[countryId] = {
      text,
      updatedAt: new Date().toISOString()
    };
  } else {
    delete comments[countryId];
  }

  queueSave();
  renderApp(text ? "Comment saved" : "Comment removed");
}

async function handleRemoval(countryId) {
  const countryName = countryById.get(countryId)?.name || "Country";
  const suggestedBy = session.removalSuggestions[countryId];
  const type = session.mode === "solo" || (suggestedBy && suggestedBy !== session.activeProfile)
    ? "remove-country"
    : "suggest-removal";
  const message = type === "remove-country"
    ? (session.mode === "solo"
      ? `${countryName} removed from future matchups`
      : `${countryName} removed by agreement`)
    : `${countryName} removal suggested`;

  const saved = await saveSession({ immediate: true });
  if (!saved) {
    storageWarning = storageWarning || "Save your ranking before changing the shared country list.";
    showSaveStateSoon();
    return;
  }

  await sendSharedAction({ type, countryId }, message);
}

function renderRankingControls() {
  els.rankingControls.hidden = session.mode !== "partner";
  els.viewMe.textContent = getProfileName("me");
  els.viewPartner.textContent = getProfileName("partner");
  els.viewTogether.classList.toggle("active", rankingView === "together");
  els.viewMe.classList.toggle("active", rankingView === "me" || (rankingView === "active" && session.activeProfile === "me"));
  els.viewPartner.classList.toggle("active", rankingView === "partner" || (rankingView === "active" && session.activeProfile === "partner"));
}

function wikipediaUrl(name) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(name.replace(/\s+/g, "_"))}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

function resetActiveRanking() {
  undoState = null;
  const previousProfile = getActiveProfile();
  session.profiles[session.activeProfile] = makeProfile();
  session.profiles[session.activeProfile].loved = previousProfile.loved;
  session.profiles[session.activeProfile].comments = previousProfile.comments;
  session.profiles[session.activeProfile].donationHidden = previousProfile.donationHidden;
  session.profiles[session.activeProfile].currentPair = pickPairIds();
  queueSave();
  renderApp("Active ranking reset");
}

function switchProfile() {
  undoState = null;
  session.activeProfile = session.activeProfile === "me" ? "partner" : "me";
  rankingView = "active";
  lovedView = session.activeProfile;

  const needsInitialPair = !getActiveProfile().currentPair;
  if (needsInitialPair) {
    getActiveProfile().currentPair = pickPairIds();
  }

  if (needsInitialPair) {
    queueImmediateSave();
  }
  renderApp(`${getProfileName(session.activeProfile)} profile loaded`);
}

function newSessionNames() {
  return {
    me: cleanName(els.meNameInput.value, "Me"),
    partner: cleanName(els.partnerNameInput.value, "Partner")
  };
}

function updateProfileChoiceLabels() {
  els.chooseMe.textContent = getProfileName("me");
  els.choosePartner.textContent = getProfileName("partner");
}

function copyToClipboard(text, button) {
  navigator.clipboard.writeText(text).then(() => {
    const original = button.textContent;
    button.textContent = "Copied!";
    setTimeout(() => { button.textContent = original; }, 1500);
  });
}

els.showExistingSession.addEventListener("click", () => {
  els.existingMessage.textContent = "";
  els.passcodeInput.value = "";
  showPanel(els.existingPanel);
  els.passcodeInput.focus();
});

els.showNewSession.addEventListener("click", () => {
  els.newPasscode.textContent = generatePasscode();
  els.meNameInput.value = "";
  els.partnerNameInput.value = "";
  els.newMessage.textContent = "";
  showPanel(els.newPanel);
  els.meNameInput.focus();
});

els.passcodeInput.addEventListener("input", () => {
  els.passcodeInput.value = normalizePasscode(els.passcodeInput.value);
});

els.backToWelcomeFromExisting.addEventListener("click", () => showPanel(els.welcomePanel));
els.backToWelcomeFromNew.addEventListener("click", () => showPanel(els.welcomePanel));

els.copyNewPasscode.addEventListener("click", () => {
  copyToClipboard(els.newPasscode.textContent, els.copyNewPasscode);
});

els.sessionPasscode.addEventListener("click", () => {
  if (session?.passcode) {
    copyToClipboard(session.passcode, els.sessionPasscode);
  }
});

els.loadSession.addEventListener("click", loadOnlineSessionFromInput);

els.passcodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    els.loadSession.click();
  }
});

els.startSolo.addEventListener("click", () => {
  startOnlineSession("solo");
});

els.startPartner.addEventListener("click", () => {
  startOnlineSession("partner");
});

els.chooseMe.addEventListener("click", () => beginSession(session, "me"));
els.choosePartner.addEventListener("click", () => beginSession(session, "partner"));

els.leftChoose.addEventListener("click", () => {
  saveUndoState();
  applyWin(currentPair[0], currentPair[1]);
  getActiveProfile().history.push(`${currentPair[0].id}>${currentPair[1].id}`);
  advance(`${currentPair[0].name} chosen`);
});

els.rightChoose.addEventListener("click", () => {
  saveUndoState();
  applyWin(currentPair[1], currentPair[0]);
  getActiveProfile().history.push(`${currentPair[1].id}>${currentPair[0].id}`);
  advance(`${currentPair[1].name} chosen`);
});

els.hardChoice.addEventListener("click", () => {
  saveUndoState();
  applyHardChoice(currentPair[0], currentPair[1]);
  getActiveProfile().history.push(`${currentPair[0].id}~${currentPair[1].id}`);
  advance("Hard to choose: both countries got a small boost");
});

els.undoChoice.addEventListener("click", undoLastChoice);

els.skipPair.addEventListener("click", () => {
  getActiveProfile().currentPair = pickPairIds();
  queueSave();
  renderApp("Skipped pair");
});

els.resetRatings.addEventListener("click", resetActiveRanking);
els.switchProfile.addEventListener("click", switchProfile);
els.exportSession.addEventListener("click", exportSessionData);
els.viewTogether.addEventListener("click", () => {
  rankingView = "together";
  rankingsExpanded = false;
  renderRankings();
});
els.viewMe.addEventListener("click", () => {
  rankingView = "me";
  rankingsExpanded = false;
  renderRankings();
});
els.viewPartner.addEventListener("click", () => {
  rankingView = "partner";
  rankingsExpanded = false;
  renderRankings();
});
els.lovedMe.addEventListener("click", () => {
  lovedView = "me";
  renderLovedList();
});
els.lovedPartner.addEventListener("click", () => {
  lovedView = "partner";
  renderLovedList();
});
els.hideDonation.addEventListener("click", () => {
  getActiveProfile().donationHidden = true;
  queueSave();
  renderDonationFooter();
});
els.openHelp.addEventListener("click", () => {
  els.helpModal.showModal();
});
els.closeHelp.addEventListener("click", () => {
  els.helpModal.close();
});
els.openFeedbackFromHelp.addEventListener("click", () => {
  els.helpModal.close();
  els.openFeedback.click();
});
els.openFeedback.addEventListener("click", () => {
  els.feedbackText.value = "";
  els.feedbackMessage.textContent = "";
  els.feedbackDebugSection.hidden = true;
  els.toggleFeedbackDebug.textContent = "Show debug snapshot";
  els.feedbackDebug.textContent = JSON.stringify(buildFeedbackSnapshot(), null, 2);
  els.feedbackModal.showModal();
  setTimeout(() => els.feedbackText.focus(), 0);
});
els.closeFeedback.addEventListener("click", () => {
  els.feedbackModal.close();
});
els.feedbackModal.addEventListener("click", (event) => {
  if (event.target === els.feedbackModal) {
    els.feedbackModal.close();
  }
});
els.toggleFeedbackDebug.addEventListener("click", () => {
  const showing = !els.feedbackDebugSection.hidden;
  els.feedbackDebugSection.hidden = showing;
  els.toggleFeedbackDebug.textContent = showing ? "Show debug snapshot" : "Hide debug snapshot";
  if (!showing) {
    els.feedbackDebug.textContent = JSON.stringify(buildFeedbackSnapshot(), null, 2);
  }
});
els.submitFeedback.addEventListener("click", async () => {
  const text = els.feedbackText.value.trim();
  if (!text) {
    els.feedbackMessage.textContent = "Add some details before sending.";
    return;
  }
  setBusy(els.submitFeedback, true, "Sending…");
  const result = await submitFeedback(text);
  setBusy(els.submitFeedback, false);
  if (result.error) {
    els.feedbackMessage.textContent = result.error;
    return;
  }
  els.feedbackMessage.textContent = "Thanks — feedback sent.";
  els.feedbackText.value = "";
  setTimeout(() => els.feedbackModal.close(), 1200);
});
els.helpModal.addEventListener("click", (event) => {
  if (event.target === els.helpModal) {
    els.helpModal.close();
  }
});
document.addEventListener("mouseover", (event) => {
  const target = event.target.closest(".has-tooltip");

  if (target) {
    showFloatingTooltip(target);
  }
});
document.addEventListener("focusin", (event) => {
  const target = event.target.closest(".has-tooltip");

  if (target) {
    showFloatingTooltip(target);
  }
});
document.addEventListener("mouseout", (event) => {
  if (event.target.closest(".has-tooltip")) {
    hideFloatingTooltip();
  }
});
document.addEventListener("focusout", (event) => {
  if (event.target.closest(".has-tooltip")) {
    hideFloatingTooltip();
  }
});
window.addEventListener("pagehide", () => {
  saveBeforeHide();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    saveBeforeHide();
  } else {
    refreshSessionFromServer();
  }
});
els.toggleRankings.addEventListener("click", () => {
  rankingsExpanded = !rankingsExpanded;
  renderRankings();
});
els.leftCommentBox.addEventListener("toggle", syncCommentExpansion);
els.rightCommentBox.addEventListener("toggle", syncCommentExpansion);

els.changeSession.addEventListener("click", () => {
  disconnectSessionSync();
  clearSavedPasscode();
  dirtyProfiles.clear();
  profileConflict = false;
  session = null;
  els.onboarding.hidden = false;
  showPanel(els.welcomePanel);
});

els.closeModal.addEventListener("click", () => {
  els.photoModal.close();
});

els.photoModal.addEventListener("click", (event) => {
  if (event.target === els.photoModal) {
    els.photoModal.close();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.target.closest("input, textarea")) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  const inGame = session && currentPair.length === 2;

  switch (event.key) {
    case "[":
      if (inGame) { event.preventDefault(); els.leftChoose.click(); }
      break;
    case "]":
      if (inGame) { event.preventDefault(); els.rightChoose.click(); }
      break;
    case ",":
      if (inGame) { event.preventDefault(); els.hardChoice.click(); }
      break;
    case ".":
      if (inGame) { event.preventDefault(); els.skipPair.click(); }
      break;
    case "/":
      if (undoState) { event.preventDefault(); undoLastChoice(); }
      break;
  }
});

els.appVersionLabel.textContent = APP_VERSION;
els.profileVersionLabel.textContent = APP_VERSION;
els.resumeVersionLabel.textContent = APP_VERSION;

(async () => {
  const saved = getSavedPasscode();

  if (saved) {
    showPanel(els.resumePanel);
    const result = await loadSessionByPasscode(saved);

    if (!result.error) {
      if (result.session.mode === "partner") {
        session = result.session;
        updateProfileChoiceLabels();
        showPanel(els.profilePanel);
      } else {
        beginSession(result.session);
      }
      return;
    }

    clearSavedPasscode();
  }

  showPanel(els.welcomePanel);
})();
