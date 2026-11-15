"use client";

import Link from "next/link";
import { useLayoutEffect, useState } from "react";
import { api, errorText } from "@/lib/api";

const modes = {
  login: {
    title: "Log in",
    submit: "Log in",
    path: "/auth/login",
    askName: false,
    switchText: "New to TripTogether?",
    switchLink: { href: "/register", label: "Create an account" },
  },
  register: {
    title: "Create your account",
    submit: "Create account",
    path: "/auth/register",
    askName: true,
    switchText: "Already have an account?",
    switchLink: { href: "/login", label: "Log in" },
  },
};

export default function AuthForm({ mode }: { mode: keyof typeof modes }) {
  const m = modes[mode];
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Next keeps this page's state when you navigate away; drop a failed attempt's message when it does.
  useLayoutEffect(() => () => setError(""), []);

  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(m.path, "POST", Object.fromEntries(new FormData(e.currentTarget)));
      // A full page load, not router.replace: Next keeps visited pages' state across client navigations, so
      // anything a page held from before this login (errors, another user's data) would otherwise come back.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the full load is the point
      window.location.assign("/trips");
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-100 gap-6 px-4 py-12">
      <p className="sign sign-small justify-self-start">TripTogether</p>
      <h1>{m.title}</h1>
      <form className="grid gap-5" onSubmit={submit}>
        {m.askName && (
          <div className="grid content-start gap-1.5">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" autoComplete="name" required />
          </div>
        )}
        <div className="grid content-start gap-1.5">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="grid content-start gap-1.5">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={m.askName ? "new-password" : "current-password"}
            minLength={m.askName ? 8 : undefined}
            required
          />
          {m.askName && <p className="text-[14px] text-muted">At least 8 characters.</p>}
        </div>
        {error && (
          <p className="font-semibold text-red" role="alert">
            {error}
          </p>
        )}
        <button className="btn" disabled={busy}>
          {m.submit}
        </button>
      </form>
      <p className="text-muted">
        {m.switchText} <Link href={m.switchLink.href}>{m.switchLink.label}</Link>
      </p>
    </main>
  );
}
