# Seeker Burn Club

Seeker Burn Club is a Solana Mobile Android app for daily SKR burns, streak progression, badge NFTs, referrals, and community leaderboards.

This file is the single active project handbook.

## Repository Layout

```
burn/
├── android/                          # Android app (Kotlin + Compose + MWA)
├── backend/                          # Fastify + TypeScript API
└── README.md                         # Active documentation
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Mobile | Kotlin, Jetpack Compose, Solana Mobile Wallet Adapter |
| Backend | Node.js, TypeScript, Fastify, Drizzle ORM |
| Data | PostgreSQL, Redis |
| Solana | SPL Token, Metaplex Token Metadata, `@solana/web3.js` |

## Prerequisites

- Node.js `>=20`
- npm
- Android Studio + Android SDK
- JDK 17 (for Android build)
- PostgreSQL + Redis for backend runtime

## Backend Quick Start

From repo root:

```powershell
Push-Location backend
npm ci
npm run migrate
npm run dev
Pop-Location
```

Useful backend commands:

```powershell
Push-Location backend
npm run build
npm run test
npm run typecheck
npm run lint
npm run generate:creatures
npm run audit:rarity
npm run audit:prod
Pop-Location
```

## Android Quick Start

From repo root:

```powershell
Push-Location android
.\gradlew.bat assembleDebug
Pop-Location
```

APK output:

- `android/app/build/outputs/apk/debug/app-debug.apk`

## Configuration Source Of Truth

### Backend Environment (`backend/src/config/env.ts`)

Required:

- `DATABASE_URL`
- `SOLANA_RPC_URL`
- `SKR_MINT`
- `TREASURY_WALLET`
- `TREASURY_SKR_ATA`
- `JWT_SECRET`

Common optional/configurable:

- `REDIS_URL` (default `redis://localhost:6379`)
- `PORT`, `HOST`, `NODE_ENV`
- `MIN_BURN_SKR`, `PLATFORM_FEE_SKR`, `TX_FRESHNESS_WINDOW`
- `JWT_EXPIRES_IN`, `SIWS_CHALLENGE_TTL`
- `BADGE_COLLECTION_MINT`, `MINT_AUTHORITY_SECRET_KEY`, `MINTING_ENABLED`
- `CREATOR_FEE_LAMPORTS`
- `REFERRAL_APPLY_WINDOW_DAYS`, `REFERRAL_QUALIFY_BURN_DAYS`, `REFERRAL_QUALIFY_LIFETIME_SKR`

### Android Build Config (`android/app/build.gradle.kts`)

- Debug/default build is Devnet (`IS_DEVNET=true`)
- Release build flips `IS_DEVNET=false`
- Release values are provided via `gradle.properties` or env vars:
  - `RELEASE_SKR_MINT`
  - `RELEASE_TREASURY_WALLET`
  - `RELEASE_TREASURY_SKR_ATA`
  - `RELEASE_API_PIN_HASH_1`
  - `RELEASE_API_PIN_HASH_2`
- Release validation task: `validateReleaseConfig`

## Release Blockers (Mainnet)

Before production release:

1. Set real release values for:
- `RELEASE_SKR_MINT`
- `RELEASE_TREASURY_WALLET`
- `RELEASE_TREASURY_SKR_ATA`
- `RELEASE_API_PIN_HASH_1`
- `RELEASE_API_PIN_HASH_2`
2. Run Android release validation/build:
- `Push-Location android; .\gradlew.bat validateReleaseConfig assembleRelease; Pop-Location`
3. Keep backend CI green (`lint`, `typecheck`, `test`) before shipping.

## Reliability And Security Notes

Code-backed safeguards currently implemented:

- Burn verification parses on-chain instructions server-side (not trusting client amounts).
- Per-wallet rate limiting for burn submit in `backend/src/routes/burn.routes.ts`.
- Wallet-scoped advisory lock during burn DB transaction in `backend/src/services/burn.service.ts`.
- `retryVerify=true` status fallback in burn polling path.
- `/health` endpoint checks both Postgres and Redis in `backend/src/server.ts`.
- Android preflight checks include treasury ATA derivation and frozen-account detection.
- Android release client enforces certificate pinning configuration at startup.

## CI Baseline

Workflow: `.github/workflows/ci.yml`

- Runs on push/PR to `main` and manual trigger
- Backend gates:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
- Android gate:
  - `./gradlew assembleDebug`

## Code Map

Backend:

- Server bootstrap and health: `backend/src/server.ts`
- Burn submit/status routes: `backend/src/routes/burn.routes.ts`
- Burn verification engine: `backend/src/services/burn.service.ts`
- Env validation: `backend/src/config/env.ts`

Android:

- Build config and network selection: `android/app/build.gradle.kts`
- API client and cert pinning: `android/app/src/main/java/club/seekerburn/app/di/NetworkModule.kt`
- Solana transaction + preflight logic: `android/app/src/main/java/club/seekerburn/app/data/solana/SolanaService.kt`
