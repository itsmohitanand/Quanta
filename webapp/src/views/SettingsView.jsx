import React, { useState, useEffect } from "react";
import { fetchSettings, saveSettings } from "../api.js";

export default function SettingsView({ onLogout }) {
  const [settings, setSettings] = useState({
    notes_dir: "",
    whatsapp_number: "",
    callmebot_apikey: "",
    telegram_token: "",
    telegram_chat_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchSettings().then(d => setSettings(s => ({ ...s, ...d })));
  }, []);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    await saveSettings(settings);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function update(key, val) {
    setSettings(s => ({ ...s, [key]: val }));
  }

  const username = localStorage.getItem("username") ?? "—";

  return (
    <div className="flex flex-col h-full bg-neutral-950 overflow-y-auto"
         style={{ paddingTop: `env(safe-area-inset-top)` }}>
      <div className="px-4 py-3 border-b border-neutral-800">
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      <div className="flex-1 px-4 py-4 space-y-6 pb-24">
        {/* Account */}
        <section className="card p-4 space-y-3">
          <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Account</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{username}</p>
              <p className="text-xs text-neutral-500">Logged in</p>
            </div>
            <button onClick={onLogout} className="btn-danger text-xs px-3 py-1.5">
              Sign out
            </button>
          </div>
        </section>

        {/* Storage */}
        <form onSubmit={save} className="space-y-4">
          <section className="card p-4 space-y-3">
            <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Storage</h2>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">Notes directory</label>
              <input
                className="input text-xs"
                placeholder="~/Documents/engram/…"
                value={settings.notes_dir}
                onChange={e => update("notes_dir", e.target.value)}
              />
            </div>
          </section>

          <section className="card p-4 space-y-3">
            <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">WhatsApp (CallMeBot)</h2>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">Phone number</label>
              <input className="input text-xs" placeholder="+1234567890" value={settings.whatsapp_number} onChange={e => update("whatsapp_number", e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">API key</label>
              <input className="input text-xs" placeholder="callmebot apikey" value={settings.callmebot_apikey} onChange={e => update("callmebot_apikey", e.target.value)} />
            </div>
          </section>

          <section className="card p-4 space-y-3">
            <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Telegram</h2>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">Bot token</label>
              <input className="input text-xs" placeholder="1234:ABC..." value={settings.telegram_token} onChange={e => update("telegram_token", e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">Chat ID</label>
              <input className="input text-xs" placeholder="123456789" value={settings.telegram_chat_id} onChange={e => update("telegram_chat_id", e.target.value)} />
            </div>
          </section>

          <button type="submit" disabled={saving} className="btn-primary w-full py-3">
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save Settings"}
          </button>
        </form>
      </div>
    </div>
  );
}
