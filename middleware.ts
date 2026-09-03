import { withAuth } from "next-auth/middleware";

// Protects the /dashboard page AND the raw dashboard files under /app/*
// (the actual charts live there as static assets served from /public/app).
// Without protecting /app/* too, someone could bypass login by guessing
// the direct file URL, e.g. yoursite.com/app/index.html.
export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: ["/dashboard/:path*", "/app/:path*"],
};
