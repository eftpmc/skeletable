import { useRoute } from "wouter";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MeContext, useJson, type Me } from "@/lib/api";
import { Account } from "@/pages/Account";
import { Explore } from "@/pages/Explore";
import { Landing } from "@/pages/Landing";
import { About, Privacy, Terms } from "@/pages/Legal";
import { NotFound } from "@/pages/Message";
import { NewTable } from "@/pages/NewTable";
import { Settings } from "@/pages/Settings";
import { Sheet } from "@/pages/Sheet";
import { TablePage, tableViews, type TableView } from "@/pages/TablePage";
import { YourHome } from "@/pages/YourHome";

function Routes({ me }: { me: Me }) {
  const [isHome] = useRoute("/");
  const [isExplore] = useRoute("/explore");
  const [isSettings] = useRoute("/settings");
  const [isNew] = useRoute("/new");
  const [isAbout] = useRoute("/about");
  const [isTerms] = useRoute("/terms");
  const [isPrivacy] = useRoute("/privacy");
  const [isAccount, account] = useRoute("/:owner");
  const [isTable, table] = useRoute("/:owner/:slug");
  const [isSheet, sheet] = useRoute("/:owner/:slug/sheet");
  const [isView, view] = useRoute("/:owner/:slug/:view");
  if (isHome) return me.user ? <YourHome user={me.user} /> : <Landing />;
  if (isExplore) return <Explore />;
  if (isSettings) return <Settings />;
  if (isNew) return <NewTable />;
  if (isAbout) return <About />;
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
  const { data, status } = useJson<Me>("/api/me");
  // Waiting here keeps the frame from flashing from public to signed-in.
  if (status === "loading") return null;
  const me = data ?? { canSignIn: false, user: null };
  return (
    <MeContext.Provider value={me}>
      <ErrorBoundary>
        <Routes me={me} />
      </ErrorBoundary>
    </MeContext.Provider>
  );
}
