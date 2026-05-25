import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import AuthView from "./views/AuthView.jsx";
import JournalView from "./views/JournalView.jsx";
import ItemsView from "./views/ItemsView.jsx";
import ChatView from "./views/ChatView.jsx";
import SettingsView from "./views/SettingsView.jsx";
import BottomNav from "./components/BottomNav.jsx";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token"));

  function handleLogin(t) {
    localStorage.setItem("token", t);
    setToken(t);
  }

  function handleLogout() {
    localStorage.removeItem("token");
    setToken(null);
  }

  if (!token) {
    return <AuthView onLogin={handleLogin} />;
  }

  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/journal" replace />} />
          <Route path="/journal" element={<JournalView />} />
          <Route path="/items" element={<ItemsView />} />
          <Route path="/chat" element={<ChatView />} />
          <Route path="/settings" element={<SettingsView onLogout={handleLogout} />} />
          <Route path="*" element={<Navigate to="/journal" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
