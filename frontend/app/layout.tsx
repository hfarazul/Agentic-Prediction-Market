import type { Metadata } from "next";
import { ConnectButton, ThirdwebProvider } from "thirdweb/react";
import "./globals.css";

export const metadata: Metadata = {
    title: "Truthseeker",
    description: "Truthseeker - Claim Verifier",
    generator: "v0.dev",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body>
                <ThirdwebProvider>{children}</ThirdwebProvider>
            </body>
        </html>
    );
}
