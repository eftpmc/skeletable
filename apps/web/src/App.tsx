import { createElement, Suspense, use, useEffect, type ComponentType } from "react";
import { toast } from "sonner";
import { useRoute } from "wouter";
import { ListSkeleton, Spinner } from "@/components/Loading";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import { MeContext, useJson, type Me } from "@/lib/api";
import { tableViews, type TableView } from "@/lib/views";

// Pages load apart from the first screen, so the first visit stays small.
type Loading<T> = Promise<T> & { status?: "fulfilled"; value?: T };

/** Loads a page's file once. Marking it loaded lets React show it at once, without a loading frame. */
function loader<T>(load: () => Promise<T>) {
  let promise: Loading<T> | undefined;
  return () => {
    if (promise) return promise;
    const loading: Loading<T> = load().then((loaded) => {
      loading.status = "fulfilled";
      loading.value = loaded;
      return loaded;
    });
    return (promise = loading);
  };
}

/** A page from a file that loads when first needed. */
function page<M, K extends keyof M>(load: () => Promise<M>, name: K): M[K] {
  return ((props: object) => createElement(use(load())[name] as ComponentType<object>, props)) as M[K];
}

const pages = {
  Blog: loader(() => import("@/pages/Blog")),
  Docs: loader(() => import("@/pages/Docs")),
  Account: loader(() => import("@/pages/Account")),
  Explore: loader(() => import("@/pages/Explore")),
  Help: loader(() => import("@/pages/Help")),
  Landing: loader(() => import("@/pages/Landing")),
  Legal: loader(() => import("@/pages/Legal")),
  Message: loader(() => import("@/pages/Message")),
  NewTable: loader(() => import("@/pages/NewTable")),
  Settings: loader(() => import("@/pages/Settings")),
  RowPage: loader(() => import("@/pages/RowPage")),
  Sheet: loader(() => import("@/pages/Sheet")),
  TablePage: loader(() => import("@/pages/TablePage")),
  Teams: loader(() => import("@/pages/Teams")),
  YourHome: loader(() => import("@/pages/YourHome")),
};
const BlogIndex = page(pages.Blog, "BlogIndex");
const BlogPost = page(pages.Blog, "BlogPost");
const Accuracy = page(pages.Docs, "Accuracy");
const Developers = page(pages.Docs, "Developers");
const Methodology = page(pages.Docs, "Methodology");
const Account = page(pages.Account, "Account");
const Explore = page(pages.Explore, "Explore");
const Help = page(pages.Help, "Help");
const Landing = page(pages.Landing, "Landing");
const About = page(pages.Legal, "About");
const Privacy = page(pages.Legal, "Privacy");
const Terms = page(pages.Legal, "Terms");
const NotFound = page(pages.Message, "NotFound");
const NewTable = page(pages.NewTable, "NewTable");
const AccountSettings = page(pages.Settings, "AccountSettings");
const ProfileSettings = page(pages.Settings, "ProfileSettings");
const TokenSettings = page(pages.Settings, "TokenSettings");
const VisitSettings = page(pages.Settings, "VisitSettings");
const RowPage = page(pages.RowPage, "RowPage");
const Sheet = page(pages.Sheet, "Sheet");
const TablePage = page(pages.TablePage, "TablePage");
const TeamSettings = page(pages.Teams, "TeamSettings");
const Teams = page(pages.Teams, "Teams");
const YourHome = page(pages.YourHome, "YourHome");

function Routes({ me }: { me: Me }) {
  const [isHome] = useRoute("/");
  const [isExplore] = useRoute("/explore");
  const [isSettings] = useRoute("/settings");
  const [isTokens] = useRoute("/settings/tokens");
  const [isAccountSettings] = useRoute("/settings/account");
  const [isVisits] = useRoute("/settings/visits");
  const [isAccuracy] = useRoute("/accuracy");
  const [isMethodology] = useRoute("/methodology");
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
  const [isVersion, versioned] = useRoute("/:owner/:slug/v/:number");
  const [isView, view] = useRoute("/:owner/:slug/:view");
  if (isHome) return me.user ? <YourHome user={me.user} /> : <Landing />;
  if (isExplore) return <Explore />;
  if (isSettings) return <ProfileSettings />;
  if (isTokens) return <TokenSettings />;
  if (isAccountSettings) return <AccountSettings />;
  if (isVisits) return <VisitSettings />;
  if (isAccuracy) return <Accuracy />;
  if (isMethodology) return <Methodology />;
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
  if (isVersion && /^\d+$/.test(versioned.number)) return <Sheet key={`${versioned.owner}/${versioned.slug}/v${versioned.number}`} owner={versioned.owner} slug={versioned.slug} version={Number(versioned.number)} />;
  if (isView && tableViews.includes(view.view as TableView)) {
    return <TablePage key={`${view.owner}/${view.slug}/${view.view}`} owner={view.owner} slug={view.slug} view={view.view as TableView} />;
  }
  return <NotFound />;
}

const loadingFrame = <div className="min-h-svh"><div className="flex h-14 items-center gap-2 border-b px-4 text-sm text-muted-foreground"><Spinner label="Loading Skeletable" />Loading Skeletable</div><div className="mx-auto max-w-5xl px-6 py-8"><ListSkeleton label="Loading page" /></div></div>;

export function App() {
  const { data, status, retry } = useJson<Me>("/api/me");
  const me = { ...(data ?? { canSignIn: false, user: null }), refresh: retry };

  // Once the first page is up, fetch the rest so moving between pages doesn't wait.
  useEffect(() => {
    const timer = setTimeout(() => { for (const load of Object.values(pages)) load().catch(() => {}); }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // A failed sign-in lands back here with this in the address.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("signin") !== "failed") return;
    toast.error("Sign-in didn't work. Try again, or use a different Google account.");
    history.replaceState(null, "", location.pathname);
  }, []);

  // Waiting here keeps the frame from flashing from public to signed-in.
  if (status === "loading" && !data) return loadingFrame;
  return (
    <MeContext.Provider value={me}>
      <ErrorBoundary>
        <Suspense fallback={loadingFrame}>
          <Routes me={me} />
        </Suspense>
      </ErrorBoundary>
      <Toaster />
    </MeContext.Provider>
  );
}
