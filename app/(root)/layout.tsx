import getCurrentUser from "../actions/getCurrentUser";
import Navbar from "../components/navbar/Navbar";

// Pages read the database, so render them per request instead of at build time.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await getCurrentUser();
  return (
    <main>
      <Navbar currentUser={currentUser} />
      {children}
    </main>
  );
}
