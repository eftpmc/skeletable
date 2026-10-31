import { Moon, Sun } from "lucide-react";
import { Link, Route, Switch } from "wouter";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { Home } from "@/pages/Home";
import { Message } from "@/pages/Message";
import { TablePage } from "@/pages/TablePage";

export function App() {
  const { dark, toggle } = useTheme();
  return (
    <div className="mx-auto min-h-svh max-w-5xl px-4 pb-16 sm:px-6">
      <header className="flex h-16 items-center justify-between">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          skeleton
        </Link>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? "Use light theme" : "Use dark theme"}>
          {dark ? <Sun /> : <Moon />}
        </Button>
      </header>
      <main>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/tables/:slug">{({ slug }) => <TablePage key={slug} slug={slug} />}</Route>
          <Route>
            <Message title="There's no page here" />
          </Route>
        </Switch>
      </main>
    </div>
  );
}
