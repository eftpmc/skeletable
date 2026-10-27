import { Navigate, Route, Routes, useLocation } from "react-router";
import { AddItemProvider } from "./components/AddItem";
import { AppShell } from "./components/AppShell";
import { PublicShell } from "./components/PublicShell";
import { SearchPaletteProvider } from "./components/SearchPalette";
import { useSession } from "./lib/auth-client";
import { nextPath, useServerInfo } from "./lib/viewer";
import { AlertsPage } from "./routes/AlertsPage";
import { AuthPage } from "./routes/AuthPage";
import { BrandPage } from "./routes/BrandPage";
import { ClosetPage } from "./routes/ClosetPage";
import { DiscoverPage } from "./routes/DiscoverPage";
import { Home } from "./routes/Home";
import { ItemPage } from "./routes/ItemPage";
import { ProductPage } from "./routes/ProductPage";
import { PublicHome } from "./routes/PublicHome";
import { ResultsPage } from "./routes/ResultsPage";
import { SavedPage } from "./routes/SavedPage";
import { SettingsPage } from "./routes/settings/SettingsPage";

/** Signed out on a page that needs an account: sign in, then come back to it. */
function SignInFirst() {
  const { pathname, search } = useLocation();
  return <Navigate to={pathname === "/" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(pathname + search)}`} replace />;
}

/** Just signed in or up: back to the page that sent you. */
function Continue() {
  return <Navigate to={nextPath(useLocation().search)} replace />;
}

export function App() {
  const { data: session, isPending } = useSession();
  const info = useServerInfo();

  if (isPending || (!session && info.isPending)) return null;

  if (!session) {
    return (
      <SearchPaletteProvider>
        <Routes>
          <Route path="/sign-in" element={<AuthPage mode="sign-in" />} />
          <Route path="/sign-up" element={<AuthPage mode="sign-up" />} />
          {/* On servers with public search (the cloud), searching and products need no account. */}
          {info.data?.publicSearch && (
            <Route element={<PublicShell />}>
              <Route index element={<PublicHome />} />
              <Route path="/search" element={<ResultsPage />} />
              <Route path="/p/:id" element={<ProductPage />} />
            </Route>
          )}
          <Route path="*" element={<SignInFirst />} />
        </Routes>
      </SearchPaletteProvider>
    );
  }

  return (
    <AddItemProvider>
      <SearchPaletteProvider>
        <Routes>
          <Route path="/sign-in" element={<Continue />} />
          <Route path="/sign-up" element={<Continue />} />
          <Route element={<AppShell user={session.user} />}>
            <Route index element={<Home />} />
            <Route path="/search" element={<ResultsPage />} />
            <Route path="/p/:id" element={<ProductPage />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/brands/:id" element={<BrandPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/saved" element={<SavedPage />} />
            <Route path="/collection" element={<ClosetPage />} />
            <Route path="/collection/:id" element={<ItemPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/:section" element={<SettingsPage />} />
            <Route path="/profile" element={<Navigate to="/settings" replace />} />
            <Route path="/owned/*" element={<Navigate to="/collection" replace />} />
            <Route path="/closet/*" element={<Navigate to="/collection" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </SearchPaletteProvider>
    </AddItemProvider>
  );
}
