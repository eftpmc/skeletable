import { useEffect } from "react";
import { toast } from "sonner";
import { useRoute } from "wouter";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import { MeContext, useJson, type Me } from "@/lib/api";
import { BlogIndex, BlogPost } from "@/pages/Blog";
import { Accuracy, Developers } from "@/pages/Docs";
import { Account } from "@/pages/Account";
import { Explore } from "@/pages/Explore";
import { Help } from "@/pages/Help";
import { Landing } from "@/pages/Landing";
import { About, Privacy, Terms } from "@/pages/Legal";
import { NotFound } from "@/pages/Message";
import { NewTable } from "@/pages/NewTable";
import { AccountSettings, ProfileSettings, TokenSettings, VisitSettings } from "@/pages/Settings";
import { RowPage } from "@/pages/RowPage";
import { Sheet } from "@/pages/Sheet";
import { TablePage, tableViews, type TableView } from "@/pages/TablePage";
import { TeamSettings, Teams } from "@/pages/Teams";
import { YourHome } from "@/pages/YourHome";

function Routes({ me }: { me: Me }) {
  const [isHome] = useRoute("/");
  const [isExplore] = useRoute("/explore");
  const [isSettings] = useRoute("/settings");
  const [isTokens] = useRoute("/settings/tokens");
  const [isAccountSettings] = useRoute("/settings/account");
  const [isVisits] = useRoute("/settings/visits");
  const [isAccuracy] = useRoute("/accuracy");
  const [isBlog] = useRoute("/blog");
  const [isPost, post] = useRoute("/blog/:slug");
  const [isDevelopers] = useRoute("/developers");
  const [isRow, row] = useRoute("/:owner/:slug/row/:row");
  const [isTeams] = useRoute("/settings/teams");
  const [isTeam, team] = useRoute("/settings/teams/:handle");
  const [isNew] = useRoute("/new");
  const [isAbout] = useRoute("/about");
  const [isHelp] = useRoute("/help");
  const [isTerms] = useRoute("/terms");
  const [isPrivacy] = useRoute("/privacy");
  const [isAccount, account] = useRoute("/:owner");
  const [isTable, table] = useRoute("/:owner/:slug");
  const [isSheet, sheet] = useRoute("/:owner/:slug/sheet");
  const [isView, view] = useRoute("/:owner/:slug/:view");
  if (isHome) return me.user ? <YourHome user={me.user} /> : <Landing />;
  if (isExplore) return <Explore />;
  if (isSettings) return <ProfileSettings />;
  if (isTokens) return <TokenSettings />;
  if (isAccountSettings) return <AccountSettings />;
  if (isVisits) return <VisitSettings />;
  if (isAccuracy) return <Accuracy />;
  if (isBlog) return <BlogIndex />;
  if (isPost) return <BlogPost key={post.slug} slug={post.slug} />;
  if (isDevelopers) return <Developers />;
  if (isRow) return <RowPage key={row.row} owner={row.owner} slug={row.slug} rowSlug={row.row} />;
  if (isTeams) return <Teams />;
  if (isTeam) return <TeamSettings key={team.handle} handle={team.handle} />;
  if (isNew) return <NewTable />;
  if (isAbout) return <About />;
  if (isHelp) return <Help />;
  if (isTerms) return <Terms />;
  if (isPrivacy) return <Privacy />;
  if (isAccount) return <Account key={account.owner} owner={account.owner} />;
  if (isTable) return <TablePage key={`${table.owner}/${table.slug}`} owner={table.owner} slug={table.slug} />;
  if (isSheet) return <Sheet key={`${sheet.owner}/${sheet.slug}`} owner={sheet.owner} slug={sheet.slug} />;
  if (isView && tableViews.includes(view.view as TableView)) {
    return <TablePage key={`${view.owner}/${view.slug}/${view.view}`} owner={view.owner} slug={view.slug} view={view.view as TableView} />;
  }
  return <NotFound />;
}

export function App() {
  const { data, status, retry } = useJson<Me>("/api/me");
  const me = { ...(data ?? { canSignIn: false, user: null }), refresh: retry };

  // A failed sign-in lands back here with this in the address.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("signin") !== "failed") return;
    toast.error("Sign-in didn't work. Try again, or use a different Google account.");
    history.replaceState(null, "", location.pathname);
  }, []);

  // Waiting here keeps the frame from flashing from public to signed-in.
  if (status === "loading" && !data) return null;
  return (
    <MeContext.Provider value={me}>
      <ErrorBoundary>
        <Routes me={me} />
      </ErrorBoundary>
      <Toaster />
    </MeContext.Provider>
  );
}
