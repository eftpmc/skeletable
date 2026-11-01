import { useRoute } from "wouter";
import { MeContext, useJson, type Me } from "@/lib/api";
import { Account } from "@/pages/Account";
import { Explore } from "@/pages/Explore";
import { Landing } from "@/pages/Landing";
import { Message } from "@/pages/Message";
import { Sheet } from "@/pages/Sheet";
import { TablePage, tableTabs, type TableTab } from "@/pages/TablePage";
import { YourHome } from "@/pages/YourHome";

function Routes({ me }: { me: Me }) {
  const [isHome] = useRoute("/");
  const [isExplore] = useRoute("/explore");
  const [isAccount, account] = useRoute("/:owner");
  const [isTable, table] = useRoute("/:owner/:slug");
  const [isSheet, sheet] = useRoute("/:owner/:slug/sheet");
  const [isTab, tab] = useRoute("/:owner/:slug/:tab");
  if (isHome) return me.user ? <YourHome user={me.user} /> : <Landing />;
  if (isExplore) return <Explore />;
  if (isAccount) return <Account key={account.owner} owner={account.owner} />;
  if (isTable) return <TablePage key={`${table.owner}/${table.slug}`} owner={table.owner} slug={table.slug} />;
  if (isSheet) return <Sheet key={`${sheet.owner}/${sheet.slug}`} owner={sheet.owner} slug={sheet.slug} />;
  if (isTab && tableTabs.includes(tab.tab as TableTab)) {
    return <TablePage key={`${tab.owner}/${tab.slug}/${tab.tab}`} owner={tab.owner} slug={tab.slug} tab={tab.tab as TableTab} />;
  }
  return <Message title="There's no page here" />;
}

export function App() {
  const { data, status } = useJson<Me>("/api/me");
  // Waiting here keeps the frame from flashing from public to signed-in.
  if (status === "loading") return null;
  const me = data ?? { canSignIn: false, user: null };
  return (
    <MeContext.Provider value={me}>
      <Routes me={me} />
    </MeContext.Provider>
  );
}
