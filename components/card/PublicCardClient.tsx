'use client'

import { useState } from 'react'
import DigitalCardView from '@/components/card/DigitalCardView'
import CardExchangeModal from '@/components/card/CardExchangeModal'
import type { DigitalCardData } from '@/lib/card/types'

/**
 * A visitor's view of somebody else's card.
 *
 * No wallet capability reaches here, and none should: a pass represents its
 * owner's identity, and the person scanning the QR is not that owner. Adding
 * another person's card to your own Wallet is a different product from the one
 * this page is — the owner's wallet actions live on My Card.
 */
export default function PublicCardClient({ card }: { card: DigitalCardData }) {
  const [exchangeOpen, setExchangeOpen] = useState(false)

  function handleLinkClick(linkId: string) {
    void fetch('/api/card/link-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId }),
    }).catch((err) => console.error('[PublicCardClient] link-click failed:', err))
  }

  return (
    <>
      <DigitalCardView
        card={card}
        onExchange={() => setExchangeOpen(true)}
        onLinkClick={handleLinkClick}
      />
      {/*
        The slug, not the owner id. Which card was opened is a fact this page
        already holds; who it belongs to is the server's to decide.
      */}
      <CardExchangeModal
        open={exchangeOpen}
        onClose={() => setExchangeOpen(false)}
        ownerName={card.fullName}
        cardSlug={card.slug}
      />
    </>
  )
}
