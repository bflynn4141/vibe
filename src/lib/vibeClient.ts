// /vibe API client for connecting to the multiplayer backend

const VIBE_API_URL = "https://vibecodings.vercel.app/api";
const USE_MOCK = true; // Set to false when backend is ready

interface VibeUser {
  handle: string;
  oneLiner: string;
  status?: string;
  lastSeen: string;
}

interface VibeMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: string;
}

// Mock data for development
const MOCK_USERS: VibeUser[] = [
  { handle: "gene", oneLiner: "Building AI agents", lastSeen: new Date().toISOString() },
  { handle: "alex", oneLiner: "Writing a book on protocols", lastSeen: new Date().toISOString() },
  { handle: "sara", oneLiner: "Designing NFT platform", lastSeen: new Date().toISOString() },
];

class VibeClient {
  private handle: string | null = null;
  private oneLiner: string | null = null;

  async initialize(handle: string, oneLiner: string): Promise<boolean> {
    if (USE_MOCK) {
      // Mock mode - always succeed
      console.log("[MOCK] Initialized with handle:", handle);
      this.handle = handle;
      this.oneLiner = oneLiner;
      return true;
    }

    try {
      // Register/authenticate with /vibe backend
      const response = await fetch(`${VIBE_API_URL}/auth/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, oneLiner }),
      });

      if (response.ok) {
        this.handle = handle;
        this.oneLiner = oneLiner;
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to initialize /vibe:", error);
      return false;
    }
  }

  async getOnlineUsers(): Promise<VibeUser[]> {
    if (USE_MOCK) {
      // Return mock users
      return MOCK_USERS;
    }

    try {
      const response = await fetch(`${VIBE_API_URL}/presence/online`);
      if (response.ok) {
        return await response.json();
      }
      return [];
    } catch (error) {
      console.error("Failed to get online users:", error);
      return [];
    }
  }

  async sendMessage(to: string, content: string): Promise<boolean> {
    if (!this.handle) return false;

    try {
      const response = await fetch(`${VIBE_API_URL}/messages/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: this.handle,
          to,
          content,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error("Failed to send message:", error);
      return false;
    }
  }

  async getMessages(): Promise<VibeMessage[]> {
    if (!this.handle) return [];

    try {
      const response = await fetch(`${VIBE_API_URL}/messages/inbox?handle=${this.handle}`);
      if (response.ok) {
        return await response.json();
      }
      return [];
    } catch (error) {
      console.error("Failed to get messages:", error);
      return [];
    }
  }

  async setStatus(status: string): Promise<boolean> {
    if (!this.handle) return false;

    try {
      const response = await fetch(`${VIBE_API_URL}/presence/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: this.handle,
          status,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error("Failed to set status:", error);
      return false;
    }
  }
}

export const vibeClient = new VibeClient();
export type { VibeUser, VibeMessage };
