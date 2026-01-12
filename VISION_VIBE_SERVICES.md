# /vibe Vision: AI-Native Social Services Platform

## The Big Idea

/vibe starts as social layer for Claude Code users, but expands into a **general-purpose AI-native social network** where any service can be accessed through conversation.

**Core insight**: In an AI-native world, every service becomes a conversation. Users configure their APIs/credentials once, then access everything through natural language.

---

## Service Verticals

| Category | Services | AI-Native UX |
|----------|----------|--------------|
| **Money** | Payments, transfers, splits | "vibe pay @stan $50 for dinner" |
| **Marketplace** | Buy/sell, listings, deals | "vibe find a used MacBook under $800" |
| **Dating** | Matching, intros, social | "vibe who's single and into AI art?" |
| **Finance** | Banking, investments, portfolio | "vibe show my runway" |
| **Credit** | Score, history, disputes | "vibe check my credit" |
| **Lending** | Loans, P2P, microloans | "vibe lend @gene $500 for 30 days" |
| **Exchange** | Crypto, forex, swaps | "vibe swap 1 ETH to USDC" |
| **Calendar** | Scheduling, availability, booking | "vibe find time with @brenner this week" |
| **Shopping** | Orders, tracking, returns | "vibe reorder my coffee beans" |
| **University** | Courses, credentials, tutoring | "vibe enroll in that ML course" |
| **Health** | Records, appointments, rx | "vibe schedule a dentist next week" |
| **Travel** | Flights, hotels, itineraries | "vibe book SFO→JFK next Friday" |
| **Art** | NFTs, galleries, commissions | "vibe mint this as an edition of 10" |
| **News** | Feeds, alerts, summaries | "vibe what's happening in AI today?" |
| **Legal** | Contracts, disputes, filings | "vibe draft an NDA for this collab" |
| **Housing** | Listings, roommates, rent | "vibe find a 2BR in Mission under $3k" |
| **Music** | Streaming, playlists, discovery | "vibe play something like Boards of Canada" |
| **Predictions** | Markets, bets, forecasts | "vibe what's the odds on X winning?" |

---

## Integration Layer

Users connect their accounts once, then access through natural language:

### Payment Rails
```
Stripe      → Card payments, subscriptions
Mercury     → Business banking
PayPal      → Consumer payments
Venmo       → Social payments
Plaid       → Bank connections
```

### Crypto Rails
```
Coinbase    → Fiat on/off ramp
ETH         → Ethereum mainnet
SOL         → Solana
Base        → L2 payments
Privy       → Embedded wallets
```

### Social Rails
```
Gmail       → Email integration
WhatsApp    → Messaging bridge
X/Twitter   → Social posting
Discord     → Community bridge
Farcaster   → Web3 social
Instagram   → Visual social
```

### Any API/MCP
```
If it has an API → it can be a vibe service
If it has an MCP server → native integration
```

---

## Architecture: Service Mesh

```
┌─────────────────────────────────────────────────────────────┐
│                     /vibe User Layer                        │
│  "vibe pay @stan" / "vibe book flight" / "vibe mint this"  │
├─────────────────────────────────────────────────────────────┤
│                    Intent Recognition                        │
│         (Which service? What action? What params?)          │
├─────────────────────────────────────────────────────────────┤
│                    Credential Vault                          │
│      (User's connected APIs, encrypted, per-service)        │
├─────────────────────────────────────────────────────────────┤
│                    Service Adapters                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ Stripe  │ │Coinbase │ │ Gmail   │ │   X     │  ...      │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
├─────────────────────────────────────────────────────────────┤
│                    Execution Layer                           │
│      (Rate limits, retries, confirmations, receipts)        │
└─────────────────────────────────────────────────────────────┘
```

---

## User Flow: Connect Once, Use Forever

```
1. User joins /vibe (handle registration - done)
2. User goes to slashvibe.dev/connect
3. OAuth flows for each service they want
4. Credentials stored encrypted in their vault
5. From then on: "vibe [action]" just works
```

---

## Trust & Safety

| Concern | Solution |
|---------|----------|
| Credential security | Encrypted vault, never logged |
| Transaction limits | User-configurable daily limits |
| Confirmation prompts | High-value actions require explicit OK |
| Audit trail | All actions logged for user review |
| Revocation | One-click disconnect any service |

---

## Revenue Model

| Stream | Mechanism |
|--------|-----------|
| Transaction fees | Small % on payments/trades |
| Premium tier | Higher limits, priority execution |
| Service partnerships | Rev share with integrated services |
| Enterprise | White-label for companies |

---

## Phase Roadmap

### Phase 1: Social Foundation (NOW)
- [x] Handle registration
- [x] Presence/DMs
- [x] Ships/streaks
- [ ] Terminal app
- [ ] 100 genesis users

### Phase 2: Payment Rails (Q1)
- [ ] Stripe Connect integration
- [ ] P2P payments ("vibe pay")
- [ ] Split bills
- [ ] Tip creators

### Phase 3: Crypto Rails (Q2)
- [ ] Coinbase OAuth
- [ ] Base L2 payments
- [ ] Privy embedded wallets
- [ ] NFT minting

### Phase 4: Social Mesh (Q3)
- [ ] X posting integration
- [ ] Discord bridge
- [ ] Farcaster native
- [ ] Cross-platform DMs

### Phase 5: Service Explosion (Q4+)
- [ ] Calendar integration
- [ ] Travel booking
- [ ] Marketplace listings
- [ ] Community-built services

---

## Technical Requirements

### Credential Vault
```typescript
interface UserVault {
  userId: string;
  services: {
    [serviceName: string]: {
      connected: boolean;
      credentials: EncryptedBlob;
      scopes: string[];
      connectedAt: Date;
      lastUsed: Date;
    }
  }
}
```

### Service Adapter Interface
```typescript
interface ServiceAdapter {
  name: string;
  capabilities: string[];

  // OAuth flow
  getAuthUrl(userId: string): string;
  handleCallback(code: string): Promise<Credentials>;

  // Actions
  execute(action: string, params: object, creds: Credentials): Promise<Result>;

  // Introspection
  describeActions(): ActionSchema[];
}
```

### Intent Recognition
```typescript
interface Intent {
  service: string;      // "payments", "calendar", etc.
  action: string;       // "send", "schedule", etc.
  params: object;       // {to: "@stan", amount: 50, currency: "USD"}
  confidence: number;   // 0-1
  requiresConfirmation: boolean;
}
```

---

## The Vision Statement

> "/vibe is the universal interface to digital life. Connect your services once, then do everything through conversation. AI-native from day one."

---

## Related

- Spirit Protocol (infrastructure layer)
- AIRC (agent communication)
- Eden (creative/artist vertical)

---

*This is the north star. We're building toward it incrementally.*
