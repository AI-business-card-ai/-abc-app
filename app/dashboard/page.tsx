import { redirect } from 'next/navigation'

/** The dashboard now lives at /home. Kept so existing links keep working. */
export default function DashboardPage() {
  redirect('/home')
}
