import { Navigate, Route, Routes } from "react-router";
import { AddItemProvider } from "./components/AddItem";
import { AppShell } from "./components/AppShell";
import { useSession } from "./lib/auth-client";
import { AuthPage } from "./routes/AuthPage";
import { ClosetPage } from "./routes/ClosetPage";
import { ItemPage } from "./routes/ItemPage";
import { Placeholder } from "./routes/Placeholder";
import { SettingsPage } from "./routes/SettingsPage";

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
    <AddItemProvider>
      <Routes>
        <Route element={<AppShell user={session.user} />}>
          <Route index element={<Navigate to="/closet" replace />} />
          <Route
            path="/discover"
            element={<Placeholder title="Discover" body="A feed of things you'll like will live here." />}
          />
          <Route path="/closet" element={<ClosetPage />} />
          <Route path="/closet/:id" element={<ItemPage />} />
          <Route path="/saved" element={<Placeholder title="Saved" body="Your boards, wishlist and inspo." />} />
          <Route path="/profile" element={<SettingsPage user={session.user} />} />
          <Route path="*" element={<Navigate to="/closet" replace />} />
        </Route>
      </Routes>
    </AddItemProvider>
  );
}
