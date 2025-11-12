"use client";

import { SignInButton, SignUpButton, SignedOut } from '@clerk/nextjs';

export function FloatingAuthButtons() {
  // UserButton is now shown in the footer next to the text box
  // Only show sign in/up buttons when signed out
  return (
    <div className="fixed top-6 right-[82px] z-50 flex items-center gap-3">
      <SignedOut>
        <div className="flex items-center gap-3">
          <SignInButton mode="modal">
            <button className="px-4 py-2 bg-sidebar text-sidebar-foreground rounded-md text-sm font-medium hover:bg-sidebar/90 transition-colors">
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="px-4 py-2 bg-white text-black rounded-md text-sm font-medium hover:bg-white/90 transition-colors">
              Start for free
            </button>
          </SignUpButton>
        </div>
      </SignedOut>
    </div>
  );
}

