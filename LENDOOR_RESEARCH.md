# Lendoor Codebase Research - Comprehensive Summary

> This document is the output of a deep-dive into the existing **Lendoor** project
> (`/home/lucholeonel/CODE-werify/projects/lendoor/`).
> It is meant to guide the Lenclaw MVP build so we maintain visual and architectural
> consistency where appropriate, and learn from Lendoor's proven patterns.

---

## 1. FRONTEND ARCHITECTURE

### 1.1 Tech Stack & Dependencies

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + Vite 6 (SPA, `react-router-dom` v7 for routing) |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite` plugin) + CSS variables |
| UI primitives | Radix UI (dialog, tooltip, scroll-area, separator, slider, popover, slot) |
| Component variants | `class-variance-authority` (cva) + `tailwind-merge` + `clsx` |
| State management | Zustand v5 (multiple stores: auth, credit, gamification, loanStats, verification) |
| Wallet / Web3 | wagmi v2 + viem v2 + ethers v6 + RainbowKit v2 |
| Chain | Celo mainnet (chainId 42220), USDC with 6 decimals |
| Mini-app SDKs | `@lemoncash/mini-app-sdk`, `@farcaster/miniapp-sdk` + wagmi connector |
| Charts | Recharts v3 |
| Toast / notifications | Sonner v2 |
| i18n | i18next + react-i18next (Spanish primary, English fallback) |
| Animations | Framer Motion v12, custom CSS keyframes |
| Fonts | Inter Variable (sans), JetBrains Mono (mono) |
| Analytics | Microsoft Clarity |
| Build tooling | Vite + `@vitejs/plugin-react-swc`, TypeScript 5.6 |

### 1.2 Color Palette & Design Tokens

The design uses **CSS custom properties** defined in `index.css`, with both light and dark modes.

#### Light Mode (`:root`)
```
--background: #ffffff
--foreground: #1f2937
--card: #f8fafc
--card-foreground: #1f2937
--primary: #ea580c          (bright orange)
--primary-foreground: #ffffff
--secondary: #6b7280
--muted: #f1f5f9
--muted-foreground: #6b7280
--accent: #ea580c           (same orange)
--destructive: #dc2626
--border: #e5e7eb
--input: #f8fafc
--ring: rgba(234, 88, 12, 0.3)
--radius: 0.25rem
```

#### Dark Mode (`.dark`)
```
--background: #0f172a       (slate-900)
--foreground: #f1f5f9
--card: #1e293b             (slate-800)
--primary: #f97316          (brighter orange)
--secondary: #64748b
--muted: #1e293b
--muted-foreground: #94a3b8
--border: #334155
```

#### Key Brand Colors
- **Primary orange**: `#ea580c` (light) / `#f97316` (dark) -- used everywhere for CTAs, highlights
- **CTA button**: `#F46A06` with hover `#e35f02` (hardcoded in components)
- **Terminal green**: `#10b981`
- **Terminal red**: `#ef4444`
- **Terminal yellow**: `#f59e0b`
- **USDC blue**: `#2775CA`

#### Fonts
- **Sans**: `InterVariable` (system-ui fallback chain)
- **Mono**: `JetBrains Mono`, `Courier New`, Consolas (used for `.mono-text` class)
- Terminal/crypto-native aesthetic with monospace text extensively

#### Border radius
- Base: `0.25rem` (very tight, boxy)
- Cards often use `rounded-2xl` or `rounded-3xl` (override) for a softer feel
- Buttons: `rounded-2xl`

### 1.3 Component Architecture Patterns

#### UI Primitives (`components/ui/`)
Uses shadcn/ui pattern with Radix under the hood:
- `button.tsx` - CVA-based variants: default (orange-300), destructive, outline, secondary, ghost, link. Sizes: default, sm, lg, xl, icon.
- `card.tsx` - Simple div wrappers with data-slot attributes. Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter.
- `dialog.tsx`, `input.tsx`, `separator.tsx`, `slider.tsx`, `tooltip.tsx`, `badge.tsx`, `textarea.tsx`, `scroll-area.tsx`
- All use `cn()` helper (`clsx` + `twMerge`)

#### Page-level components
- Pages are thin wrappers that compose market/panel components
- `Home.tsx`: Hero + borrow/lend cards. Full-screen sections with terminal aesthetic.
- `Lend.tsx`: Wraps `<LendMarket />`
- `Borrow.tsx`: Complex onboarding flow with `SlidingScreens` for animated transitions between states (boot -> not-logged-in -> terms -> waitlist -> early-init -> borrow)
- `Stats.tsx`: Wraps `<VaultStatsPanel />`
- `Info.tsx`: Debtors list with filtering/sorting

#### Market/Panel components
- `LendMarket.tsx`: Deposit/withdraw USDC into vault, shows shares, total assets, share price. White cards with `rounded-3xl`, `shadow-sm`.
- `BorrowMarket.tsx` (CreditMarket): Orchestrates PullPanel / RepayPanel / CooldownPanel with sliding transitions. Shows credit score, performance, funds.
- `VaultStatsPanel.tsx`: Vault utilization bar, cumulative metrics, borrow/repay activity list.

#### Data Pattern for Cards
```tsx
<div className="bg-white rounded-3xl shadow-sm p-4 space-y-1">
  <p className="text-xs text-gray-500">Label</p>
  <p className="text-2xl font-semibold">$Value</p>
  <p className="text-xs text-gray-500">Sub-label</p>
</div>
```

#### Custom CSS Classes
- `.terminal-grid` - Repeating grid pattern using orange (rgba(234, 88, 12, 0.12))
- `.code-pattern` - Radial dot pattern
- `.mono-text` - Courier/monospace font
- `.terminal-cursor::after` - Blinking underscore cursor
- `.data-card` - Glassmorphism card (border, backdrop-blur)
- `.terminal-hover` - Hover effect with translateX(4px)
- `.glitch-effect:hover` - Glitch animation
- `.cta-badge` - Animated pill badge for CTAs (ring-pulse)
- `.qr-skeleton` / `.qr-skeleton-band` - Loading shimmer

### 1.4 Provider Architecture (React Context)

Provider nesting order (outermost to innermost):
```
BrowserRouter
  AnalyticsProvider
    WagmiProvider (wagmi config + QueryClient + RainbowKit + FarcasterProvider)
      WalletProvider (unifies lemon/farcaster/webapp wallet modes)
        ContractsProvider (ethers contracts, USDC, EVault, LoanManager)
          App (Header + Routes)
            BorrowerProvider (per /borrow route - Zustand stores)
            LenderProvider (per /lend route - on-chain reads)
```

**WalletProvider** exposes:
- `mode`: 'lemon' | 'farcaster' | 'webapp' | 'none'
- `isMiniApp`, `isLemonMiniApp`, `isFarcasterMiniApp`
- `isLoggedIn`, `primaryWallet`, `loadingNetwork`
- `setShowAuthFlow()` for connect modal

**ContractsProvider** exposes:
- Read-only contracts (evault, controller, usdc) via `ethers.Contract` + `JsonRpcProvider`
- `sendContractTx()` / `sendBatchContractTx()` - routes through Lemon SDK or walletClient depending on mode
- Lemon helpers for deposit, call, callBatch, requestSiwe

**BorrowerProvider** (borrowing flow):
- Wraps 5 Zustand stores: authStore, verificationStore, creditStore, gamificationStore, loanStatsStore
- Manages access token refresh, loan stats, achievements, credit score

### 1.5 State Management (Zustand)

Multiple small stores rather than one big store:
- `authStore` - accessToken, authLoading, clearAuth
- `verificationStore` - isVerified, goToWaitlist, hasAcceptedTerms
- `creditStore` - creditScoreDisplay, creditScoreRaw
- `gamificationStore` - xp, achievementsCount, latestAchievements
- `loanStatsStore` - loansCount, closedLoansCount, loansOnTimeCount, onTimePercent

### 1.6 Routing

```
/ -> Home (landing)
/lend -> LendPage (wrapped in LenderProvider)
/borrow -> BorrowPage (wrapped in BorrowerProvider + RepaymentRecoveryGuard)
/stats -> StatsPage
```

### 1.7 i18n

- i18next with inline JSON resources (es.json, en.json)
- Default language: Spanish (`lng: "es"`)
- Custom `useTranslation` hook at `@/i18n/useTranslation.ts`

### 1.8 API Communication

- `LendoorApi` class with access token auto-refresh
- Backend URL from env: `VITE_PUBLIC_BACKEND_URL`
- All loan endpoints protected by `AccessTokenGuard`
- Subgraph queries for on-chain data (The Graph)

---

## 2. BACKEND ARCHITECTURE

### 2.1 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS 11 |
| Language | TypeScript 5.6 |
| Database | PostgreSQL (TypeORM 0.3) |
| Blockchain | ethers v6, viem v2 |
| Auth | SIWE (Sign-In With Ethereum), custom access tokens |
| Rate limiting | @nestjs/throttler (30 req/60s per IP) |
| Scheduling | @nestjs/schedule (cron jobs) |
| Validation | class-validator + class-transformer (whitelist + forbidNonWhitelisted) |
| Identity | @selfxyz/core, @zkpassport/sdk |
| KYC | Cr3dentials API integration |
| Email | Nodemailer |
| Math | decimal.js for financial calculations |

### 2.2 Module Structure

```
AppModule
  |- ConfigModule (global)
  |- ScheduleModule
  |- ThrottlerModule (30/60s)
  |- TypeOrmModule (PostgreSQL)
  |
  |- AuthModule
  |    |- SIWE nonce management
  |    |- Access token creation/validation/refresh
  |    |- Blocklist checking
  |
  |- UserModule
  |    |- User CRUD
  |    |- Email OTP verification
  |    |- Terms acceptance
  |    |- Waitlist management
  |    |- Early access notifications
  |
  |- ContractModule (LoanModule)
  |    |- Loan lifecycle: verify -> borrow -> inform-open -> inform-repayment
  |    |- Credit policy (ladder system)
  |    |- Chain sync service (cron reconciliation)
  |
  |- Cr3Module (KYC verification via Cr3dentials API)
  |- ZkPassportModule (zk-passport verification)
  |- SelfModule (Self Protocol verification)
  |- AchievementModule (gamification badges)
  |- NotificationModule (email notifications)
  |- WaitlistModule
  |- BlocklistModule
```

### 2.3 Entity Model (Database Schema)

#### Users (`users` table)
```
id: number (PK, autoincrement)
walletAddress: text (unique, lowercase)
platform: varchar(16) - 'lemon' | 'farcaster' | 'webapp'
firstName, lastName: text (nullable)
birthdate: text (nullable, "1996-04-12")
nationality: varchar(3) (ISO alpha-3)
documentType, documentNumber: text (unique together)
creditLimit: decimal(18,2) (nullable)
score: integer (0-1000, nullable)
email: text (unique, lowercase)
waitlistJoinedAt, earlyAccessNotifiedAt: timestamptz
xp: integer (default 1)
waitlistPriority: integer (default 0)
workType: varchar(32) - 'app_driver' | 'app_delivery' | 'creator' | 'freelance_cripto' | 'other_job' | 'no_job'
termsAcceptedAt: timestamptz
createdAt, updatedAt: timestamps
```

#### Loans (`loans` table)
```
id: number (PK)
userId: FK -> users
borrowerAddress: text
principal: decimal(18,2)
amountDueAtOpen: decimal(18,2)
amountPaid: decimal(18,2)
tenorDays: integer (7, 14, or 21 days)
feeBps: integer (basis points)
startAt, dueAt: timestamptz
closedAt: timestamptz (nullable)
status: enum (OPEN, REPAID_ON_TIME, REPAID_LATE, DEFAULTED)
repaidOnTime: boolean
openTxHash, closeTxHash: text (nullable)
syncedByChain: boolean
```

#### Other Entities
- `Achievement` - Badges with code, title, description, xp, icon, sortOrder
- `UserAchievement` - M2M join table
- `SiweNonce` - SIWE nonces with expiry
- `AccessToken` - Session tokens with walletAddress, expiresAt, revokedAt
- `Notification` - Email notifications
- `Waitlist` - Waitlist entries
- `SelfVerification` - Self Protocol verification records
- `BlockedWallet` - Blocked wallet addresses
- `NotVerifiedUser` - Pre-registration records

### 2.4 Authentication Flow

1. Client requests nonce: `GET /auth/nonce`
2. Client signs SIWE message with wallet
3. Client sends to `POST /auth/verify-siwe` with { wallet, signature, message, nonce }
4. Backend verifies SIWE (supports ERC-6492 for smart wallets)
5. Backend issues opaque access token (48 hex chars, 1hr expiry)
6. Token refresh via `POST /auth/refresh` (15-min grace window after expiry)
7. Hourly cron cleans expired nonces and tokens

### 2.5 Credit Policy (Reputation Ladder)

Discrete ladder with conservative progression:
```
Loans on-time | Score | Limit (USDC) | XP Base
0             | 1     | 3            | 1
1             | 2     | 4            | 11
2             | 3     | 6            | 21
3             | 4     | 8            | 31
4             | 5     | 10           | 41
5             | 6     | 12           | 51
6             | 7     | 15           | 61
7             | 8     | 18           | 71
8             | 9     | 22           | 81
9             | 10    | 25           | 91
```

Interest rates: Base 25% monthly for lowest score, decreasing to 21% for score > 15.
Rate varies by term length (7/14/21 days).

### 2.6 Loan Flow

1. **Verify**: `POST /loan/verify` - Sets on-chain credit score + limit via `setUserRisk()`
2. **Get terms**: `POST /loan/loan-terms` - Returns rates for 7/14/21 day terms
3. **Borrow**: `POST /loan/borrow` - Creates on-chain loan offer via `setLoanOffer()`
4. **Inform open**: `POST /loan/inform-open` - Records loan in DB after on-chain opening
5. **Inform repayment**: `POST /loan/inform-repayment` - Closes loan, updates score/limit, awards achievements

### 2.7 On-Chain Integration (contractConfig.ts)

- Uses ethers v6 for on-chain writes (server-side wallet)
- **LoanManager** contract with:
  - `setUserRisk(address, score, kycOk, validUntil, limit)`
  - `setLoanOffer(address, tenorDays, feeBps, validUntil, maxAmount)`
  - `creditLimit(address)` (read)
- Transaction queue (serialized) with auto-nonce-clearing
- Gas estimation with +20% buffer
- Fee bumping on retries
- Polling-based receipt confirmation

### 2.8 Key Backend Patterns

- **Guards**: `AccessTokenGuard` for protected endpoints
- **Decorators**: `@CallerWallet()` extracts wallet from validated token, `assertWalletOwnership()` ensures caller matches target
- **DTOs**: class-validator with whitelist + forbidNonWhitelisted
- **Financial math**: decimal.js for all money calculations
- **Wallet normalization**: Always lowercase, validated hex format
- **Idempotency**: Loan inform-open checks for duplicate txHash
- **Pessimistic locking**: Used for loan closure to prevent race conditions
- **Cron jobs**: Chain sync, auth cleanup, notification scheduling

---

## 3. SMART CONTRACT ARCHITECTURE

### 3.1 LoanManager Contract

The core on-chain contract manages:
- **User risk profiles**: score (uint16), KYC status (bool), validity period (uint64), credit limit (uint256)
- **Loan offers**: receiver, tenor (uint16 days), fee (uint16 bps), validity period, max amount
- Functions: `setUserRisk()`, `setLoanOffer()`, `creditLimit()`, `owner()`

### 3.2 Euler Vault Integration

- Uses Euler Finance's EVault system (IEVault, IEVC/EVC)
- Senior vault for lender deposits (USDC)
- Junior vault (subordinated)
- Exchange rate tracking for share pricing
- Vault utilization monitoring

### 3.3 Chain Details

- **Network**: Celo Mainnet (chainId 42220)
- **Token**: USDC (6 decimals)
- **RPC endpoints**: Alchemy, Forno, Ankr, 1RPC (fallback chain)
- **Subgraph**: The Graph for indexed on-chain data

---

## 4. UI/UX AESTHETIC SUMMARY

### 4.1 Overall Aesthetic: "Terminal/Crypto-Native"

- **Dark foundation** with orange accents (terminal-inspired)
- **Grid background** pattern (`terminal-grid`) using orange lines
- **Monospace text** for data/numbers (`.mono-text`)
- **Blinking cursor** animation (`.terminal-cursor`)
- **Glitch effect** on hover for titles
- **Data cards** with glassmorphism (backdrop-blur, semi-transparent borders)
- **Clean white cards** inside pages (`bg-white rounded-3xl shadow-sm`)

### 4.2 Layout Pattern

- Max width `max-w-4xl` for main content
- Pages use `max-w-3xl` or `max-w-md` for focused content
- Sticky header with backdrop blur
- Mobile-first responsive (grid-cols on sm/md breakpoints)
- Container padding: `px-4` to `px-6`

### 4.3 Typography

- Inter Variable as primary sans-serif
- JetBrains Mono for code/data display
- Font sizes: `text-xs` (labels), `text-sm` (body), `text-2xl` (values), `text-4xl`/`text-5xl` (hero)
- Tracking: `tracking-tight` (hero), `tracking-wide` (labels)

### 4.4 Interactive Patterns

- Orange primary buttons with rounded-2xl
- Pill tabs (rounded-full, bg-gray-100)
- Sliding screen transitions (left/right) for multi-step flows
- Loading states: animated ping dot + text label
- Toast notifications (sonner, top-center)
- Tooltip provider wrapping interactive sections

### 4.5 Responsive Design

- Mobile-first with sm/md/lg breakpoints
- Different navigation for mini-app vs web
- Conditional rendering based on `isMiniApp`
- Full-height sections: `min-h-[calc(100vh-X)]`

---

## 5. KEY PATTERNS FOR LENCLAW TO MAINTAIN

### 5.1 Frontend Consistency

1. **Use Tailwind CSS v4** with CSS custom properties for theming
2. **Radix + CVA pattern** for UI primitives (shadcn/ui style)
3. **Zustand** for client state (small, focused stores)
4. **Provider nesting**: Wallet -> Contracts -> Page-specific providers
5. **cn() utility**: `clsx` + `twMerge` for className composition
6. **Orange as primary brand color** (can adapt shade for Lenclaw)
7. **Terminal/monospace aesthetic** for data-heavy sections
8. **White cards with rounded-3xl + shadow-sm** for content sections
9. **Inter font family** for body, mono for data
10. **SlidingScreens** pattern for multi-step flows

### 5.2 Backend Consistency

1. **NestJS module pattern** (or equivalent in Python/FastAPI): Controllers -> Services -> Repositories
2. **Guard-based auth** with wallet ownership assertion
3. **DTO validation** with whitelisting
4. **Decimal precision** for all financial calculations
5. **Wallet address normalization** (always lowercase)
6. **Idempotent operations** for critical state changes
7. **Pessimistic locking** for concurrent-sensitive operations
8. **Credit ladder/policy** as configurable service
9. **Chain sync cron** for on-chain reconciliation
10. **Opaque access tokens** with timed expiry + refresh

### 5.3 Smart Contract Consistency

1. **Server-side wallet** for administrative on-chain actions
2. **Transaction queue** to serialize writes
3. **Gas estimation** with safety buffer
4. **Auto-clear** for stuck nonces
5. **Polling receipt** confirmation (not tx.wait())

---

## 6. DEPENDENCY QUICK REFERENCE

### Frontend Key Deps
```
react: 19, react-dom: 19, react-router-dom: 7.9
vite: 6, tailwindcss: 4, typescript: 5.6
wagmi: 2.12, viem: 2.40, ethers: 6.14
zustand: 5, sonner: 2, recharts: 3
framer-motion: 12, lucide-react: 0.511
i18next: 25.7, react-i18next: 16.5
@radix-ui/* (dialog, tooltip, scroll-area, etc.)
class-variance-authority: 0.7
@rainbow-me/rainbowkit: 2
```

### Backend Key Deps
```
@nestjs/core: 11, @nestjs/config: 4
typeorm: 0.3, pg: 8.16
ethers: 6.13, viem: 2.30
decimal.js: 10.6
class-validator: 0.14, class-transformer: 0.5
@nestjs/throttler: 6.5, @nestjs/schedule: 6.1
nodemailer: 7, uuid: 11
```
