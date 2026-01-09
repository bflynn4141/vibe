import { useState, useEffect, useRef } from "react";
import Terminal from "./components/Terminal";
import SessionsDrawer from "./components/SessionsDrawer";
import SocialSidebar from "./components/SocialSidebar";
import DMPanel from "./components/DMPanel";

function App() {
  const [isSessionsDrawerOpen, setIsSessionsDrawerOpen] = useState(false);
  const [activeDM, setActiveDM] = useState<string | null>(null);
  const terminalRef = useRef<any>(null);

  const handleReplaySession = (sessionId: string, speed: "instant" | "2x" | "realtime", fromTimestamp?: number) => {
    if (terminalRef.current?.replaySession) {
      terminalRef.current.replaySession(sessionId, speed, fromTimestamp);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+S (Mac) or Ctrl+Shift+S (Windows/Linux) - Sessions
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "S" || e.key === "s")) {
        e.preventDefault();
        setIsSessionsDrawerOpen((prev) => !prev);
      }
      // Escape to close
      if (e.key === "Escape") {
        if (activeDM) setActiveDM(null);
        else if (isSessionsDrawerOpen) setIsSessionsDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSessionsDrawerOpen, activeDM]);

  return (
    <div style={{ width: "100%", height: "100vh", display: "flex" }}>
      {/* Terminal (80%) */}
      <div style={{ flex: 1 }}>
        <Terminal ref={terminalRef} />
      </div>

      {/* Social Sidebar - /vibe network */}
      <SocialSidebar onUserClick={(handle) => setActiveDM(handle)} />

      {/* Sessions Drawer */}
      <SessionsDrawer
        isOpen={isSessionsDrawerOpen}
        onClose={() => setIsSessionsDrawerOpen(false)}
        onReplaySession={handleReplaySession}
      />

      {/* DM Panel */}
      {activeDM && (
        <DMPanel
          recipient={activeDM}
          onClose={() => setActiveDM(null)}
        />
      )}
    </div>
  );
}

export default App;
