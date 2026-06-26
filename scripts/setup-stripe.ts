import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

async function setup() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is required')
  }

  const starter = await stripe.products.create({
    name: 'ABC Starter',
    description: '50 scans/month, AI messages, follow-up, CSV export',
  })
  const starterPrice = await stripe.prices.create({
    product: starter.id,
    unit_amount: 4900,
    currency: 'usd',
    recurring: { interval: 'month' },
  })
  console.log('STARTER price ID:', starterPrice.id)

  const pro = await stripe.products.create({
    name: 'ABC Pro',
    description: 'Unlimited scans, Salesforce/HubSpot, analytics, priority AI',
  })
  const proPrice = await stripe.prices.create({
    product: pro.id,
    unit_amount: 14900,
    currency: 'usd',
    recurring: { interval: 'month' },
  })
  console.log('PRO price ID:', proPrice.id)

  const team = await stripe.products.create({
    name: 'ABC Team',
    description: '5 users, shared contacts, team pipeline, admin dashboard',
  })
  const teamPrice = await stripe.prices.create({
    product: team.id,
    unit_amount: 39900,
    currency: 'usd',
    recurring: { interval: 'month' },
  })
  console.log('TEAM price ID:', teamPrice.id)

  console.log('Stripe setup complete!')
}

setup().catch((err) => {
  console.error(err)
  process.exit(1)
})
