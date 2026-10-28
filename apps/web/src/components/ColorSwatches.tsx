import { type ColorName, colorNames, palette } from "@skeleton/shared";

export function Swatch({ color, size = 16 }: { color: ColorName; size?: number }) {
  return (
    <span
      title={color}
      className="inline-block shrink-0 rounded-full ring-1 ring-black/10 ring-inset dark:ring-white/15"
      style={{ width: size, height: size, background: palette[color] }}
    />
  );
}

export function ColorPicker({ value, onChange }: { value: ColorName[]; onChange: (colors: ColorName[]) => void }) {
  const toggle = (color: ColorName) =>
    onChange(value.includes(color) ? value.filter((entry) => entry !== color) : [...value, color].slice(0, 5));

  return (
    <div className="flex flex-wrap gap-2">
      {colorNames.map((color) => {
        const selected = value.includes(color);
        return (
          <button
            key={color}
            type="button"
            onClick={() => toggle(color)}
            aria-pressed={selected}
            aria-label={color}
            title={color}
            className={`rounded-full p-0.5 transition-shadow ${selected ? "ring-2 ring-ink" : "ring-2 ring-transparent"}`}
          >
            <Swatch color={color} size={26} />
          </button>
        );
      })}
    </div>
  );
}
