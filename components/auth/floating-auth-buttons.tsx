"use client";

import { SignInButton, SignUpButton, SignedOut } from '@clerk/nextjs';

export function FloatingAuthButtons() {
  // Fallback auth buttons - TopHeader also shows these, but this ensures visibility
  // Positioned to not conflict with TopHeader (which is at top-4 right-4)
  // Only show sign in/up buttons when signed out
  return (
    <div 
      className="fixed top-4 right-4 flex items-center gap-3 md:hidden"
      style={{
        zIndex: 9999,
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        WebkitTransform: 'translateZ(0)', // Force hardware acceleration for Safari
        transform: 'translateZ(0)',
      }}
    >
      {/* Only show on mobile - desktop uses TopHeader */}
      <SignedOut>
        <div className="flex items-center gap-3">
          <SignInButton mode="modal">
            <button 
              className="px-4 py-2 bg-sidebar text-sidebar-foreground rounded-md text-sm font-medium hover:bg-sidebar/90 transition-colors border border-border/50 shadow-lg"
              style={{
                WebkitAppearance: 'none',
                appearance: 'none',
                cursor: 'pointer',
              }}
            >
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button 
              className="px-4 py-2 bg-white text-black rounded-md text-sm font-medium hover:bg-white/90 transition-colors shadow-lg font-semibold"
              style={{
                WebkitAppearance: 'none',
                appearance: 'none',
                cursor: 'pointer',
              }}
            >
              Start for free
            </button>
          </SignUpButton>
        </div>
      </SignedOut>
    </div>
  );
}

