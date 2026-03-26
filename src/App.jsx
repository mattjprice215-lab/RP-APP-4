import React from "react";

export default function App() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#eef2fa",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Arial, sans-serif",
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: "32px",
          borderRadius: "16px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          maxWidth: "700px",
          width: "100%",
        }}
      >
        <h1 style={{ marginTop: 0, color: "#002677" }}>Retirement Planner</h1>
        <p style={{ fontSize: "18px", color: "#333" }}>
          Your Vercel deployment is working.
        </p>
        <p style={{ color: "#666", lineHeight: 1.6 }}>
          This is a temporary App.jsx so the project can build successfully.
          After this works, replace this file with the full planner app.
        </p>
      </div>
    </div>
  );
}
