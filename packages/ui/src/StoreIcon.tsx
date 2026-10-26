import { useState } from "react";
import { cn } from "./cn";

export type StoreIconProps = {
  /** The store's own icon, e.g. `/api/store-icons/bestbuy.com`. Falls back to the initial if it fails. */
  src?: string | null;
  name: string;
  size?: number;
  /** Squares in lists, circles where icons overlap. */
  shape?: "square" | "circle";
  className?: string;
};

/**
 * A store's logo in a rounded square on white, the way app icons look. Logos keep their own
 * colors in both themes, like product photos.
 */
export function StoreIcon({ src, name, size = 32, shape = "square", className }: StoreIconProps) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden bg-on-image text-on-image-ink ring-1 ring-line ring-inset",
        shape === "circle" ? "rounded-full" : "rounded-sm",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.45, fontWeight: 700 }}
    >
      {src && !failed ? (
        <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="size-full object-contain p-[12%]" />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

/** Up to three store icons overlapping, for "sold at these stores" on a Buy button or a row. */
export function StoreStack({ stores, size = 24, className }: { stores: { name: string; src?: string | null }[]; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex", className)}>
      {/* Each icon sits in a ring of the text color, so overlaps read on ink buttons and canvas alike. */}
      {stores.slice(0, 3).map((store, index) => (
        <span key={`${index}-${store.name}`} className={cn("rounded-full bg-current p-0.5", index > 0 && "-ml-2")}>
          <StoreIcon name={store.name} src={store.src} size={size} shape="circle" />
        </span>
      ))}
    </span>
  );
}
