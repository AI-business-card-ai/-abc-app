import PublicNotice from '@/components/landing/PublicNotice'

export const metadata = { title: 'Checkout cancelled — ABC' }

/**
 * Stripe returns here when someone backs out of checkout.
 *
 * No longer a client component: there was nothing interactive on it, only two
 * links. Rendering it on the server makes it a static page and removes the
 * bundle it used to carry.
 */
export default function PricingCancelPage() {
  return (
    <PublicNotice
      eyebrow="Checkout"
      title="No problem."
      actions={[
        { href: '/pricing', label: 'Back to plans', variant: 'gold' },
        { href: '/', label: 'Return to ABC' },
      ]}
    >
      <p className="pub-notice-body">
        Nothing was charged. Your ABC Card and everything on it stay exactly as they are — you can
        upgrade whenever the workflow starts saving you real time.
      </p>
    </PublicNotice>
  )
}
