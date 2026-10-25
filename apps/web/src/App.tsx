import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell";
import { useSession } from "./lib/auth-client";
import { AuthPage } from "./routes/AuthPage";
import { Placeholder } from "./routes/Placeholder";

export function App() {
  const { data: session, isPending } = useSession();

  if (isPending) return null;

  if (!session) {
    return (
      <Routes>
        <Route path="/sign-in" element={<AuthPage mode="sign-in" />} />
        <Route path="/sign-up" element={<AuthPage mode="sign-up" />} />
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell user={session.user} />}>
        <Route index element={<Navigate to="/discover" replace />} />
        <Route
          path="/discover"
          element={<Placeholder title="Discover" body="A feed of things you'll like will live here." />}
        />
        <Route path="/closet" element={<Placeholder title="Closet" body="Everything you own, in one place." />} />
        <Route path="/saved" element={<Placeholder title="Saved" body="Your boards, wishlist and inspo." />} />
        <Route path="*" element={<Navigate to="/discover" replace />} />
      </Route>
    </Routes>
  );
}
