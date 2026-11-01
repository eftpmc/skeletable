import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/api";
import { Message } from "@/pages/Message";

/** A private table you can't open looks like one that isn't there, so this offers the way in without saying which it is. */
export function NoTable() {
  const { canSignIn, user } = useMe();
  if (user || !canSignIn) return <Message title="There's no table here, or it's private" />;
  const next = encodeURIComponent(`${location.pathname}${location.search}`);
  return (
    <Message
      title="There's no table here, or you need to sign in to see it"
      action={<Button variant="outline" size="sm" asChild><a href={`/auth/google?next=${next}`}>Sign in</a></Button>}
    />
  );
}
