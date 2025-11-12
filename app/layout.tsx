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
import { getClerkEnv } from "@/lib/utils/clerk-env";

// Validate Clerk configuration at build/startup time
if (typeof window === 'undefined') {
  try {
    getClerkEnv();
  } catch (error) {
    console.error('⚠️ Clerk configuration error:', error instanceof Error ? error.message : String(error));
    console.error('⚠️ Authentication will not work. Please set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in your .env.local file.');
    // Don't throw in development to allow partial functionality
    if (process.env.NODE_ENV === 'production') {
      throw error;
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
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
            <FloatingAuthButtons />
            <ChatProvider>
              <ChatInputProvider>
                <SidebarProvider>
                  <AppSidebar />
                  <SidebarInset className="flex flex-col h-screen">
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

