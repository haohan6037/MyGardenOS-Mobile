# MyGardenOS

MyGardenOS is an iOS development-test MVP. It implements the visible app flows while robot/BLE integration is mocked.

## Stack

- Mobile: React Native + Expo + TypeScript (Node.js ecosystem)
- Backend: Python FastAPI + SQLAlchemy + Pydantic
- Database: PostgreSQL with PostGIS-ready schema via `postgis/postgis`
- Device/BLE: mocked local/API flow only

## Local backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs
Health: http://localhost:8000/health

## Backend with Docker/PostGIS

```bash
docker compose up --build
```

The app creates tables at startup for the MVP. Models include address/coordinate fields and comments for future PostGIS `geography(Point,4326)` migration.

## iOS Expo dev/test app

```bash
cd mobile
npm install
npm run typecheck
npm run start
```

Then press `i` for iOS Simulator, or scan the Expo QR code with Expo Go.

Set API URL when needed:

```bash
EXPO_PUBLIC_API_URL=http://localhost:8000 npm run start
```

## Implemented MVP flows

- Device tab with empty state, Help, Notification, Add Device, and mock binding
- Add Device radar/search UI and mock device selection/bind flow
- Profile menu into Account, Families, Notifications, Help, About, General Settings
- Editable account username/gender/address/password through API/local UI
- Families list, action sheet, details, address modal, dissolve action
- Notifications tabs, unread/read filters, empty state, notification settings switches
- Help contact expansion, operation help list, PDF-like manual placeholder pages
- About page with product placeholder, version, update/privacy/agreement pages
- General settings: language action sheet, region auto, clear cache
- Backend APIs for dev auth/user, profile, families/members, devices, notifications, settings, help/about metadata

## iOS downloadable test builds

This repo is configured for Expo EAS iOS builds and GitHub Release publishing.

- Real iPhone test build: run the GitHub Actions workflow **Build iOS app** with profile `preview` after adding the `EXPO_TOKEN` repository secret and Apple signing credentials in EAS.
- Simulator build: run the same workflow with profile `simulator`; this does not install on a physical iPhone.
- Details: see `docs/ios-distribution.md`.

Important: iOS cannot install an unsigned app directly from GitHub. A physical iPhone build must be signed through Apple Developer/TestFlight/EAS internal distribution.

## Deployment runbook

- Railway backend deployment runbook: `docs/railway-deployment.md`

## Tests/checks

Backend:

```bash
cd backend
pip install -r requirements.txt
pytest
```

Mobile:

```bash
cd mobile
npm install
npm run typecheck
```

## Privacy note

No real personal email from screenshots is used as default data. Demo account is `demo@example.com` / `Hector`.
