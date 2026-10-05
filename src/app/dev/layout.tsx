import { notFound } from "next/navigation";

// Everything under /dev is for building the app. In a production build the
// whole segment answers 404.
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
