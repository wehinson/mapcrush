# Country Ranker

This is a static version of the country comparison tool. It keeps the same ELO-style comparison flow underneath, including:

- choosing one country gives that country a normal ELO win against the other country
- `Hard to choose` gives both countries a small `+4` ELO boost
- `Skip pair` simply moves to another matchup and does not change ratings

The current data was generated from `countries_with_summaries_v2.xlsx`.

## Online Passcodes

Progress is saved online through a Cloudflare Worker. Each ranking uses a Durable Object so both partners can save at the same time without replacing each other's work. Existing KV sessions move to the new format automatically when they are opened.

The browser no longer uses localStorage or cookies as the save system. If the Cloudflare API is not deployed yet, the app can load visually but passcodes cannot create, save, or restore sessions.

Passcodes are six digits only, such as `482913`.

## Partner Synchronization

Each partner profile is saved separately. Both partners can rank at the same time without replacing each other's profile data. Open browsers receive update notices automatically and also check for updates every five seconds.

If the same profile is changed on two devices, MapCrush stops the stale save and asks which saved version to keep. It does not silently replace the newer profile.

Use **Export data** in the session controls to download the complete synchronized ranking as JSON. If the server is unavailable, MapCrush downloads a clearly marked local copy instead.

## Cloudflare Workers Setup

This app is configured as a Cloudflare Worker with static assets. Use a **Worker** project, not a Pages project. A Pages project cannot be converted into a Worker project, so create a new Worker connected to the same GitHub repo if the current Cloudflare project was created as Pages.

1. In Cloudflare, create a new Worker from this folder/repo with Workers Builds.
2. Create a KV namespace in Cloudflare named something like `country-ranker-sessions`.
3. The included `wrangler.jsonc` declares the existing `KV_BINDING`, a SQLite-backed `SessionCoordinator` Durable Object, and the `public` static asset directory.
4. Use `npx wrangler deploy` as the deploy command.
5. Open the deployed site, create a ranking, copy the six-digit passcode, then load that same passcode from another browser/device.

Recommended build settings:

```text
Build command:
echo "No build step"

Deploy command:
npx wrangler deploy

Non-production branch deploy command:
npx wrangler versions upload

Root directory:
/
```

For local Cloudflare testing, install Wrangler and run `npx wrangler dev`. Opening the plain `index.html` file directly will not have the Cloudflare KV API.

Run `npm test` before deployment. The tests cover simultaneous partner saves, stale-save protection, duplicate updates, shared removals, KV migration, and export.

## Country Data Format

The permanent place to update content is `public/js/country-data.js`:

```json
[
  {
    "id": "japan",
    "name": "Japan",
    "summary": "Your country summary here.",
    "photos": [
      "https://example.com/photo-1.jpg",
      "https://example.com/photo-2.jpg",
      "https://example.com/photo-3.jpg",
      "https://example.com/photo-4.jpg",
      "https://example.com/photo-5.jpg"
    ]
  },
  {
    "id": "italy",
    "name": "Italy",
    "summary": "Your country summary here.",
    "photos": [
      "https://example.com/photo-1.jpg",
      "https://example.com/photo-2.jpg",
      "https://example.com/photo-3.jpg",
      "https://example.com/photo-4.jpg",
      "https://example.com/photo-5.jpg"
    ]
  }
]
```

`id` is optional. `name`, `summary`, and `photos` are the main fields. You can include up to 20 photos per country. The app shows the first four and adds a `More photos` button when there are extra images.

Spreadsheet-style columns named `photo1`, `photo2`, `photo3`, and so on through `photo20` also work. If you only have one image, the older `photo` field still works and the app will repeat it into the four-photo preview.
