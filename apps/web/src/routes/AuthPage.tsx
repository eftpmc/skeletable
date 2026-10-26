import { Button, TextField } from "@closet/ui";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { getServerInfo } from "../lib/api";
import { signIn, signUp } from "../lib/auth-client";

export function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  const isSignUp = mode === "sign-up";
  const { data: info } = useQuery({ queryKey: ["server-info"], queryFn: getServerInfo });
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
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-title-1 text-ink">search</h1>
        <p className="mt-2 text-center text-callout font-normal text-muted">
          {isSignUp ? "Create your account" : "Welcome back"}
          {info && info.name !== "Closet" ? ` · ${info.name}` : ""}
        </p>

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
            {isSignUp ? "Create account" : "Sign in"}
          </Button>
        </form>

        {isSignUp ? (
          <p className="mt-6 text-center text-callout font-normal text-muted">
            Already have an account?{" "}
            <Link to="/sign-in" className="text-ink underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        ) : (
          info?.signupsEnabled && (
            <p className="mt-6 text-center text-callout font-normal text-muted">
              New here?{" "}
              <Link to="/sign-up" className="text-ink underline-offset-4 hover:underline">
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
