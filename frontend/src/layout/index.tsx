// This funky expressions just means: above a screen width of 1200px, the extra
// space will be 8% margin left and right. This is the middle ground between
// filling the full screen and having a fixed max width.
export const OUTER_CONTAINER_MARGIN = "0 calc(max(0px, 100% - 1200px) * 0.08)";
