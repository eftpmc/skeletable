import { Navigate, Route, Routes } from "react-router";
import { AddItemProvider } from "./components/AddItem";
import { AppShell } from "./components/AppShell";
import { useSession } from "./lib/auth-client";
import { AlertsPage } from "./routes/AlertsPage";
import { AuthPage } from "./routes/AuthPage";
import { BrandPage } from "./routes/BrandPage";
import { ClosetPage } from "./routes/ClosetPage";
import { DiscoverPage } from "./routes/DiscoverPage";
import { ItemPage } from "./routes/ItemPage";
import { ProductPage } from "./routes/ProductPage";
import { ResultsPage } from "./routes/ResultsPage";
import { SavedPage } from "./routes/SavedPage";
import { SearchHome } from "./routes/SearchHome";
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
          <Route index element={<SearchHome />} />
          <Route path="/search" element={<ResultsPage />} />
          <Route path="/p/:id" element={<ProductPage />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/brands/:id" element={<BrandPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/collection" element={<ClosetPage />} />
          <Route path="/collection/:id" element={<ItemPage />} />
          <Route path="/profile" element={<SettingsPage user={session.user} />} />
          <Route path="/owned/*" element={<Navigate to="/collection" replace />} />
          <Route path="/closet/*" element={<Navigate to="/collection" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AddItemProvider>
  );
}
