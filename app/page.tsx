import { redirect } from "next/navigation";

export default function Home() {
  // Middleware redirects unauthenticated users from /scan to /login.
  redirect("/scan");
}
