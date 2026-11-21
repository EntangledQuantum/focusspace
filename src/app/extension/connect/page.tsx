import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnectExtension } from "./ConnectExtension";

export const metadata: Metadata = {
  title: "Connect the FocusSpace extension",
  description: "Link the FocusSpace Chrome extension to your account.",
  robots: { index: false },
};

export default function ExtensionConnectPage() {
  return (
    <div className="wp-noir relative h-dvh overflow-y-auto flex items-center justify-center" style={{ padding: 20 }}>
      <Suspense fallback={null}>
        <ConnectExtension />
      </Suspense>
    </div>
  );
}
