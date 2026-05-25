"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) router.push("/onboarding");
    else setError((await res.json()).error ?? "Login failed");
  }
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-[1.3rem] border hairline bg-card p-6"
      >
        <h1 className="display text-2xl">Enter password</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-4 h-11 w-full rounded-xl border-hairline bg-paper px-3"
          placeholder="Password"
          autoFocus
        />
        {error && <p className="mt-2 text-sm text-coral">{error}</p>}
        <button className="btn-chunk mt-4 w-full justify-center" type="submit">
          Continue
        </button>
      </form>
    </main>
  );
}
