import { afterEach } from "vitest";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { cleanup } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";

MotionGlobalConfig.skipAnimations = true; // jsdom has no layout engine; skip animation timing
afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); });
