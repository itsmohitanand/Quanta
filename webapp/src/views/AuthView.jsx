import React, { useState } from "react";
import { login, register } from "../api.js";

export default function AuthView({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const fn = mode === "login" ? login : register;
      const data = await fn(username, password);
      onLogin(data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 bg-neutral-950 safe-top safe-bottom">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-center mb-1">Quanta</h1>
        <p className="text-sm text-neutral-500 text-center mb-8">
          {mode === "login" ? "Sign in to continue" : "Create your account"}
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            className="input"
            type="text"
            placeholder="Username"
            autoCapitalize="none"
            autoCorrect="off"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="btn-primary w-full py-3 mt-1"
          >
            {loading ? "…" : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <button
          className="w-full text-center text-sm text-neutral-500 mt-5 hover:text-neutral-300 transition-colors"
          onClick={() => { setMode(m => m === "login" ? "register" : "login"); setError(""); }}
        >
          {mode === "login" ? "No account? Register" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
