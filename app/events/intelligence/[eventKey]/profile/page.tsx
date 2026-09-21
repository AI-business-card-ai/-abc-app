import { notFound, redirect } from 'next/navigation'
import SmartProfileView from '@/components/event-intelligence/SmartProfileView'
import { loadMaterials, loadProducts } from '@/lib/event-intelligence/data'
import { eventIntelligenceContext } from '@/lib/event-intelligence/page-context'

export const dynamic = 'force-dynamic'

/**
 * The Smart Event Profile for one edition: what this company will show here.
 *
 * Scoped to the edition by the route. Material for Ambiente 2027 is a
 * different set from material for Ambiente 2026, and the URL is where that
 * starts being true.
 */
export default async function SmartProfilePage({ params }: { params: { eventKey: string } }) {
  const result = await eventIntelligenceContext(params.eventKey)
  if (result.kind === 'login') redirect('/login')
  if (result.kind === 'absent') notFound()

  const { supabase, ownerId, event } = result.context

  const [products, materials] = await Promise.all([
    loadProducts(supabase, ownerId),
    loadMaterials(supabase, ownerId, event.id),
  ])

  return <SmartProfileView event={event} products={products} materials={materials} />
}
