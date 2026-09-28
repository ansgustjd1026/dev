import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "shate",
  brand: {
    primaryColor: "#0EA5E9",
  },
  permissions: [],
  navigationBar: {
    withBackButton: true,
    withHomeButton: false,
    withTitle: true,
  },
  webView: {
    allowsInlineMediaPlayback: true,
    mediaPlaybackRequiresUserAction: false,
    pullToRefreshEnabled: false,
    overScrollMode: "never",
    allowsBackForwardNavigationGestures: true,
  },
  webBundleDir: "dist",
});
