import { toast } from "sonner";

/** Copy text and say how it went. If the browser refuses, the text is still on screen to select. */
export async function copyText(text: string, done = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
    return true;
  } catch {
    toast.error("Your browser blocked copying");
    return false;
  }
}
