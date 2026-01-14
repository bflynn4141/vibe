# Mobile Handoff: Vibe Tipping Feature

**Created**: 2026-01-03
**Branch**: `feature/tipping-privy`
**Mode**: Manual continuation

---

## Summary

Designing a tipping feature for vibe that lets users send USDC to each other on Base, authenticated via X (Twitter) login with Privy server wallets. Interview complete, spec locked — ready for implementation planning.

## Current State

- **Working on**: Feature spec for Privy wallet + tipping integration
- **Key files modified**: None yet (spec phase)
- **Build/test status**: N/A

---

## Complete Feature Spec

### Overview

Add the ability for vibe users to tip each other USDC on Base network. Users authenticate with X (Twitter) via Privy, which creates a server-managed wallet. Tips are instant, handle-based, and frictionless.

### Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Blockchain** | Base | Low fees, fast, perfect for microtips |
| **Token** | USDC only | Stable value, simple UX |
| **Wallet type** | Privy server wallets | Keys managed server-side, user never sees seed phrase |
| **Auth** | X (Twitter) login | Social identity already used in vibe |

### User Flow

1. **Setup**: During `vibe start`, user authenticates with X via Privy
2. **Wallet creation**: Privy automatically creates a Base wallet linked to their X identity
3. **Funding**: User deposits USDC from external wallet (Coinbase, MetaMask, etc.)
4. **Tipping**: `vibe tip @handle amount` sends USDC instantly
5. **Balance**: `vibe wallet` shows balance and deposit address

### Commands

| Command | Description |
|---------|-------------|
| `vibe tip @user 5` | Send 5 USDC to @user |
| `vibe wallet` | Show balance and deposit address |

### UX Details

- **No confirmation** — tips are instant and frictionless
- **No limits** — users can tip any amount they have
- **Handle-based** — no wallet addresses exposed, just `@username`
- **Fail gracefully** — if recipient hasn't set up wallet, show helpful message
- **Inbox notification** — tips appear in recipient's vibe inbox

### Constraints

- **No withdrawals in v1** — closed loop, funds stay in vibe ecosystem
- **Standalone feature** — no leaderboards or game integrations initially
- **Deposits only** — users fund via external wallet transfer

---

## Next Steps (Implementation Plan Needed)

1. **Privy Integration**
   - Set up Privy app with X (Twitter) auth
   - Configure server wallets on Base
   - Design auth flow that works in CLI context

2. **API Endpoints**
   - `POST /api/wallet/create` — Create wallet on X auth
   - `GET /api/wallet/balance` — Get USDC balance
   - `POST /api/tip` — Send tip to another user
   - `GET /api/wallet/address` — Get deposit address

3. **MCP Tools**
   - `vibe_wallet` — Show balance, address
   - `vibe_tip` — Send USDC to @handle

4. **Database Schema**
   - Link vibe handles to Privy wallet IDs
   - Transaction history (optional for v1)

5. **USDC on Base**
   - USDC contract: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
   - Need to handle token transfers via Privy SDK

---

## Context for Continuation

### Key Gotchas

- Privy server wallets require backend integration — can't be purely client-side
- Need to handle the CLI auth flow (likely open browser, redirect back)
- USDC has 6 decimals, not 18 like ETH
- Base USDC contract address differs from mainnet

### Open Questions

- How to handle the OAuth redirect flow in a CLI context?
- Should failed tips (recipient no wallet) create a pending invite?
- Rate limiting on tips to prevent spam?

### Resources

- [Privy Server Wallets Docs](https://docs.privy.io/guide/server/wallets)
- [Base USDC Contract](https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
- Vibe repo: https://github.com/brightseth/vibe

---

## Commands to Resume

```bash
cd ~/Code/vibe
git pull origin feature/tipping-privy
# Then start Claude and read this handoff
claude "Read .claude/HANDOFF.md and continue with the implementation plan"
```

---

*Handed off from desktop at 2026-01-03*
*Feature spec complete, ready for implementation planning*
