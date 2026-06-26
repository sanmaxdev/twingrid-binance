"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children into document.body via React Portal.
 * This ensures fixed-position overlays (modals, sidebars) are
 * always positioned relative to the viewport, not a parent
 * with transform/backdrop-filter that creates a new containing block.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
