import { useRoute } from "wouter";
import { useJson, type Me } from "@/lib/api";
import { Account } from "@/pages/Account";
import { Explore } from "@/pages/Explore";
import { Landing } from "@/pages/Landing";
import { Message } from "@/pages/Message";
import { Sheet } from "@/pages/Sheet";
import { YourHome } from "@/pages/YourHome";

export function App() {
  const { data: me, status } = useJson<Me>("/api/me");
  const [isHome] = useRoute("/");
  const [isExplore] = useRoute("/explore");
  const [isAccount, account] = useRoute("/:owner");
  const [isTable, table] = useRoute("/:owner/:slug");
  if (isHome) {
    if (status === "loading") return null;
    return me?.user ? <YourHome user={me.user} /> : <Landing />;
  }
  if (isExplore) return <Explore />;
  if (isAccount) return <Account key={account.owner} owner={account.owner} />;
  if (isTable) return <Sheet key={`${table.owner}/${table.slug}`} owner={table.owner} slug={table.slug} />;
  return <Message title="There's no page here" />;
}
