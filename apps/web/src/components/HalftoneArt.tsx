import { HalftoneDots } from "@paper-design/shaders-react";
import { useAccent } from "../lib/accent";

// Two inks, like a riso print: one in the theme color, one black, printed slightly off-register.
// Each ink is a halftone of its own blurred tone map in public/hero.
const shared = {
  colorBack: "#ffffff00",
  type: "gooey",
  grid: "hex",
  size: 0.5,
  radius: 1.25,
  contrast: 0.4,
  grainMixer: 0.25,
  grainOverlay: 0.15,
  grainSize: 0.5,
  fit: "cover",
} as const;

const layer = "absolute inset-0 size-full mix-blend-multiply";

/** The home hero's art. Static (no animation); if WebGL is unavailable the paper color shows. */
export default function HalftoneArt() {
  const { accent } = useAccent();
  const origin = window.location.origin;
  return (
    <div aria-hidden="true" className="absolute inset-0 isolate">
      <HalftoneDots {...shared} image={`${origin}/hero/sun-a.png`} colorFront={accent} className={layer} />
      <HalftoneDots
        {...shared}
        image={`${origin}/hero/sun-k.png`}
        colorFront="#151515"
        className={layer}
        style={{ transform: "translate(7px, -5px)", opacity: 0.9 }}
      />
    </div>
  );
}
