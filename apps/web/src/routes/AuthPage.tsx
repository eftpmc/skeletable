import { Button, TextField } from "@closet/ui";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { Wordmark } from "../components/AppShell";
import { signIn, signUp } from "../lib/auth-client";
import { useServerInfo } from "../lib/viewer";

export function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  const { search } = useLocation();
  const { data: info } = useServerInfo();
  const queryClient = useQueryClient();
  // A server with no accounts yet: whoever signs up first sets it up and owns it.
  const setup = info?.needsSetup ?? false;
  const isSignUp = mode === "sign-up" || setup;
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setError(null);
    setSubmitting(true);
    const result = isSignUp
      ? await signUp.email({ name: String(form.get("name")), email, password })
      : await signIn.email({ email, password });
    setSubmitting(false);
    if (result.error) setError(result.error.message ?? "Something went wrong");
    // The server may have just been set up, or closed its sign-ups behind the first account.
    else if (isSignUp) void queryClient.invalidateQueries({ queryKey: ["server-info"] });
  }

  if (setup && mode === "sign-in") return <Navigate to={`/sign-up${search}`} replace />;
  if (info && !info.signupsEnabled && mode === "sign-up") return <Navigate to={`/sign-in${search}`} replace />;

  // Self-hosted servers show their own name, if they've set one.
  const serverName = info && info.name !== "skeleton" ? info.name : null;
  const subtitle = setup
    ? "Create the owner account for this server."
    : [isSignUp ? "Create your account" : "Welcome back", serverName].filter(Boolean).join(" · ");

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="flex justify-center">
          {/* Back to searching where signed-out visitors can search; just the name where they can't. */}
          {info?.publicSearch ? <Wordmark className="px-2 text-title-1" /> : <span className="text-title-1 font-extrabold tracking-[-0.03em] text-ink">skeleton</span>}
        </h1>
        <p className="mt-2 text-center text-callout font-normal text-muted">{subtitle}</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-3">
          {isSignUp && <Field name="name" type="text" placeholder="Name" autoComplete="name" />}
          <Field name="email" type="email" placeholder="Email" autoComplete="email" />
          <Field
            name="password"
            type="password"
            placeholder="Password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            minLength={8}
          />
          {error && <p className="text-callout font-normal text-ink">{error}</p>}
          <Button type="submit" block disabled={submitting}>
            {setup ? "Set up server" : isSignUp ? "Create account" : "Sign in"}
          </Button>
        </form>

        {setup ? null : isSignUp ? (
          <p className="mt-6 text-center text-callout font-normal text-muted">
            Already have an account?{" "}
            <Link to={`/sign-in${search}`} className="text-ink underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        ) : (
          info?.signupsEnabled && (
            <p className="mt-6 text-center text-callout font-normal text-muted">
              New here?{" "}
              <Link to={`/sign-up${search}`} className="text-ink underline-offset-4 hover:underline">
                Create an account
              </Link>
            </p>
          )
        )}
      </div>
    </div>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <TextField required aria-label={props.placeholder} {...props} />
  );
}
