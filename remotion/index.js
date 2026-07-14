// Entry file for the render worker's Remotion bundler.
// It expects a CommonJS/ESM module that calls registerRoot.
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root.tsx";

registerRoot(RemotionRoot);
