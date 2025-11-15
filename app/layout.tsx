import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider } from '@clerk/nextjs';
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { WorkspaceProvider } from "@/contexts/workspace-context";
import { ChatProvider } from "@/contexts/chat-context";
import { ChatInputProvider } from "@/contexts/chat-input-context";
import { FloatingAuthButtons } from "@/components/auth/floating-auth-buttons";
import { getClerkEnv, isClerkConfigured } from "@/lib/utils/clerk-env";

// Validate Clerk configuration at build/startup time
// During build, Next.js may set NEXT_PHASE or we can detect build by checking if we're in a build context
// We should not throw errors during build time, only at runtime
if (typeof window === 'undefined') {
  // Detect build time: check NEXT_PHASE or if we're running next build
  const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || 
                      process.env.NEXT_PHASE === 'phase-development-build' ||
                      process.env.NEXT_PHASE === 'phase-export' ||
                      process.argv?.includes('build') ||
                      // During Docker build, env vars might not be set, so don't throw
                      (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !process.env.CLERK_SECRET_KEY);
  
  if (!isBuildTime) {
    try {
      getClerkEnv();
    } catch (error) {
      console.error('⚠️ Clerk configuration error:', error instanceof Error ? error.message : String(error));
      console.error('⚠️ Authentication will not work. Please set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in your environment variables.');
      // Don't throw - log error but allow app to continue
      // ClerkProvider will handle missing keys gracefully
    }
  }
}

export const metadata: Metadata = {
  title: "LLM Assistant",
  description: "Local environment LLM assistant",
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover', // Enable safe-area-inset support for iOS
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // During build, provide placeholder values if Clerk is not configured
  // ClerkProvider needs a valid-looking key format to pass validation during build
  const isBuildTime = typeof process !== 'undefined' && (
    process.env.NEXT_PHASE === 'phase-production-build' || 
    process.env.NEXT_PHASE === 'phase-development-build' ||
    process.env.NEXT_PHASE === 'phase-export' ||
    process.argv?.includes('build') ||
    (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !process.env.CLERK_SECRET_KEY)
  );
  
  // Use actual key if available, otherwise use a valid-format placeholder
  // Clerk keys format: pk_test_... or pk_live_...
  // ClerkProvider will handle invalid keys gracefully (logs errors but doesn't crash)
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 
    'pk_test_placeholder_00000000000000000000000000000000000000000000000000000000000000000000000000';

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{
        cssLayerName: 'clerk',
        variables: {
          colorBackground: 'oklch(0.145 0 0)',
          colorInputBackground: 'oklch(0.12 0 0)',
          colorInputText: 'oklch(0.985 0 0)',
          colorPrimary: 'oklch(0.922 0 0)',
          colorText: 'oklch(0.985 0 0)',
          colorTextSecondary: 'oklch(0.708 0 0)',
          colorDanger: 'oklch(0.704 0.191 22.216)',
          colorSuccess: 'oklch(0.65 0.15 250)',
          borderRadius: '0.625rem',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        },
        elements: {
          rootBox: {
            backgroundColor: 'oklch(0.145 0 0)',
          },
          card: {
            backgroundColor: 'oklch(0.205 0 0)',
            borderColor: 'oklch(1 0 0 / 10%)',
          },
          headerTitle: {
            color: 'oklch(0.985 0 0)',
          },
          headerSubtitle: {
            color: 'oklch(0.708 0 0)',
          },
          socialButtonsBlockButton: {
            backgroundColor: 'oklch(0.269 0 0)',
            color: 'oklch(0.985 0 0)',
            '&:hover': {
              backgroundColor: 'oklch(0.32 0 0)',
              color: 'oklch(0.985 0 0)',
            },
          },
          formButtonPrimary: {
            backgroundColor: 'oklch(0.922 0 0)',
            color: 'oklch(0.205 0 0)',
            '&:hover': {
              backgroundColor: 'oklch(0.95 0 0)',
              color: 'oklch(0.205 0 0)',
            },
          },
          formFieldInput: {
            backgroundColor: 'oklch(0.12 0 0)',
            color: 'oklch(0.95 0 0)',
            borderColor: 'oklch(1 0 0 / 10%)',
          },
          formFieldLabel: {
            color: 'oklch(0.95 0 0)',
          },
          input: {
            backgroundColor: 'oklch(0.12 0 0)',
            color: 'oklch(0.95 0 0)',
            borderColor: 'oklch(1 0 0 / 10%)',
          },
          formFieldInputShowPasswordButton: {
            color: 'oklch(0.708 0 0)',
            '&:hover': {
              color: 'oklch(0.985 0 0)',
            },
          },
          footerActionLink: {
            color: 'oklch(0.922 0 0)',
            '&:hover': {
              color: 'oklch(0.95 0 0)',
            },
          },
          userButtonPopoverActionButton: {
            color: 'oklch(0.985 0 0)',
            '&:hover': {
              backgroundColor: 'oklch(0.269 0 0)',
              color: 'oklch(0.985 0 0)',
            },
          },
          userButtonPopoverActionButtonText: {
            color: 'oklch(0.985 0 0)',
          },
        },
      }}
    >
      <html lang="en" className="dark">
        <body className="font-mono antialiased overflow-hidden">
          <WorkspaceProvider>
            <ChatProvider>
              <ChatInputProvider>
                <SidebarProvider>
                  <AppSidebar />
                  <SidebarInset 
                    className="flex flex-col"
                    style={{
                      height: '100vh',
                      minHeight: '100dvh', // Use dynamic viewport height for mobile Safari
                    }}
                  >
                    <FloatingAuthButtons />
                    {children}
                  </SidebarInset>
                </SidebarProvider>
              </ChatInputProvider>
            </ChatProvider>
          </WorkspaceProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}

