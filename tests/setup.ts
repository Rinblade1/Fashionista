import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";

MotionGlobalConfig.skipAnimations = true; // jsdom has no layout engine; skip animation timing
afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); });
