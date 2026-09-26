"use client";

/*
  The root boundary, re-exported here so it renders *inside* the shop layout
  and a failed page keeps its header and menu. A boundary only sits beneath the
  layouts above it, and the root one is above (shop)/layout.tsx.
*/
export { default } from "../error";
