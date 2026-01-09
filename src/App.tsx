import Terminal from "./components/Terminal";

function App() {
  return (
    <div style={{ width: "100%", height: "100vh", display: "flex" }}>
      {/* Terminal (80%) */}
      <div style={{ flex: 1 }}>
        <Terminal />
      </div>

      {/* Social Sidebar (20%) - placeholder for now */}
      <div
        style={{
          width: "300px",
          background: "#0a0a0a",
          borderLeft: "1px solid #222",
          padding: "16px",
        }}
      >
        <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>
          Social
        </h3>
        <p style={{ fontSize: "12px", color: "#666" }}>
          Presence, messages, and games coming soon...
        </p>
      </div>
    </div>
  );
}

export default App;
